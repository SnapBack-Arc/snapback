import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";
import { payParallelSearch, ParallelPaymentError } from "@/lib/agents/parallel-client";

/**
 * Home page's "Get Answer" step — demo-only, distinct from
 * research-sourcing.ts's real paid-task agent. This step exists only to
 * produce something for the Verify step (lib/agents/verify.ts) to judge; it
 * is not itself the thing being sold, so it does not need independent
 * research, deep writing, or its own judgment. It makes the same real,
 * paid x402 call to Parallel's search API as the task agent, then spends
 * exactly one cheap Claude call lightly reformatting that real data into the
 * deliverable shape the demo UI already renders — no web_search, no
 * multi-step research/structure split.
 *
 * If the real Parallel payment fails, this must still return a deliverable
 * (a demo action failing outright reads as SnapBack being broken, not as a
 * marketplace outage) — but with nothing real to format, it says so plainly
 * rather than answering from Claude's own training knowledge or falling
 * back to a second, tool-using call that would reintroduce the exact cost
 * this file exists to cut.
 */

export type DemoFinding = {
  title: string;
  url: string;
  summary: string;
  confidence: "high" | "medium" | "low";
};

export type DemoDeliverable = {
  overall_summary: string;
  findings: DemoFinding[];
};

const SCHEMA = {
  type: "object",
  properties: {
    overall_summary: {
      type: "string",
      description: "1-3 sentences directly answering the request, summarizing what the material shows.",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          summary: {
            type: "string",
            description: "One sentence on what this specific source shows.",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
          },
        },
        required: ["title", "url", "summary", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["overall_summary", "findings"],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireServerEnv("ANTHROPIC_API_KEY") });
  return client;
}

/**
 * Fixed, not scope-derived — unlike research-sourcing.ts's real task path,
 * this demo step has no estimator session/scope_quantity behind it at all
 * (freeform instruction text, no quote). A flat ceiling on how many findings
 * the formatting call is asked to produce, so an unusually large Parallel
 * result doesn't balloon output tokens unbounded. Soft cap only — Claude's
 * structured-output API rejects a real maxItems constraint here (confirmed
 * by the existing failure documented in lib/disputes/feedback.ts), so this
 * is prompt-level, backstopped by the call's max_tokens.
 */
const DEMO_FINDINGS_CAP = 8;

type TokenUsage = { input_tokens: number; output_tokens: number };

/**
 * The one Claude call this step makes. `rawSearchMaterial` is Parallel's raw
 * paid result, or null when the real payment failed. No effort field —
 * claude-haiku-4-5 rejects it (errors on Haiku 4.5, unlike Opus/Sonnet).
 */
async function formatDeliverable(
  instruction: string,
  rawSearchMaterial: string | null,
): Promise<{ deliverable: DemoDeliverable; usage: TokenUsage }> {
  const system = rawSearchMaterial
    ? `You are given the real output of a paid search API call made for this request. Your only job is to lightly clean up and reformat this real data into the deliverable schema: write a short overall_summary of what it shows, and produce one finding per distinct source in the material with its real title, real url, a one-sentence summary of what it says, and a confidence level. Do not add outside knowledge, do not perform independent research, and do not invent a finding, url, or fact that isn't present in the material. Return at most ${DEMO_FINDINGS_CAP} findings — if the material contains more distinct sources than that, keep only the most relevant ones.`
    : "The paid search step did not return data for this request. Write a brief, honest overall_summary stating plainly that no live search data came back this time, and return an empty findings array. Do not answer from your own knowledge and do not invent a source or url.";

  const userContent = rawSearchMaterial
    ? ["REAL SEARCH RESULT (from a paid search API):", rawSearchMaterial, "", "REQUEST:", instruction].join("\n")
    : `REQUEST:\n${instruction}`;

  const response = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    system,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Formatting call was refused.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Formatting call returned no text block");
  }
  return {
    deliverable: JSON.parse(text.text) as DemoDeliverable,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

/** Real Parallel payment evidence for one demo run — null when the payment failed. */
export type ParallelPaymentRecord = {
  amountUsdc: number;
  txHash: string;
  payerAddress: string;
  payeeAddress: string;
};

export type DemoAnswerResult = {
  deliverable: DemoDeliverable;
  parallelPayment: ParallelPaymentRecord | null;
  parallelPaymentError: string | null;
  /** Real response.usage from the single formatting call — cost telemetry. */
  usage: TokenUsage & { model: "claude-haiku-4-5" };
};

export async function runDemoAnswerAgent(instruction: string): Promise<DemoAnswerResult> {
  let parallelPayment: ParallelPaymentRecord | null = null;
  let parallelPaymentError: string | null = null;
  let rawSearchMaterial: string | null = null;

  try {
    const paid = await payParallelSearch(instruction);
    parallelPayment = {
      amountUsdc: paid.amountUsdc,
      txHash: paid.txHash,
      payerAddress: paid.payerAddress,
      payeeAddress: paid.payeeAddress,
    };
    rawSearchMaterial = JSON.stringify(paid.result);
  } catch (err) {
    parallelPaymentError = err instanceof ParallelPaymentError ? err.message : String(err);
    console.error(`[demo-answer] Parallel payment failed: ${parallelPaymentError}`);
  }

  const { deliverable, usage } = await formatDeliverable(instruction, rawSearchMaterial);
  return {
    deliverable,
    parallelPayment,
    parallelPaymentError,
    usage: { ...usage, model: "claude-haiku-4-5" },
  };
}

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";

/**
 * Single real judged verdict for the home page's "Verify" step. Deliberately
 * NOT lib/disputes/judge-panel.ts's callJudge (dispute-panel + escrow
 * machinery this flow has none of), and deliberately a plain fit-check, not
 * an open-ended quality judgment: this only checks whether the delivered
 * answer states the one specific fact the instruction asked for — e.g. for
 * "who is the CEO of Anthropic", does the delivered answer say the actual
 * CEO. It does not grade hedging, thoroughness, or writing quality.
 *
 * claude-sonnet-5 at high effort, not opus-4-8: a narrow fact-fit check
 * doesn't need Opus, and running it on every nanopayment (unlike the
 * escrow-gated marketplace judge panel) makes the per-call model choice a
 * real per-transaction cost driver.
 */

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["CORRECT", "INCORRECT"] },
    reasoning: {
      type: "string",
      description: "1-3 plain sentences on the deciding factor.",
    },
  },
  required: ["verdict", "reasoning"],
  additionalProperties: false,
} as const;

const SYSTEM = `You check whether a delivered answer states the specific fact an instruction asked for — nothing more.

Rules:
- Identify the one specific fact the instruction is asking for (a name, a number, a date, etc.).
- Check only whether the delivered answer states that same fact correctly. Ignore writing quality, extra context, hedging, or thoroughness beyond that one fact.
- verdict is "CORRECT" if the answer states the asked-for fact correctly, "INCORRECT" if it states the fact wrong, omits it, or states a different fact instead. There is no partial credit and no third option.
- reasoning: 1-3 plain sentences naming the specific fact checked and why it matched or didn't.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireServerEnv("ANTHROPIC_API_KEY") });
  return client;
}

/** Single source of truth for the real judge model this call uses — also read by /api/demo/verify to log real cost against the actual model, not a hardcoded duplicate string. */
export const VERIFY_MODEL = "claude-sonnet-5" as const;

export type VerifyVerdict = {
  verdict: "CORRECT" | "INCORRECT";
  reasoning: string;
  usage: { input_tokens: number; output_tokens: number };
};

/**
 * Flat real fee charged when the user clicks Verify (not for the free "Get
 * Answer" step) — always kept by Treasury regardless of the judged verdict.
 * See /api/demo/verify for the actual transfer.
 */
export function demoVerificationFeeUsdc(): number {
  return Number(process.env.DEMO_VERIFICATION_FEE_USDC ?? "0.02");
}

export async function verifyAnswer(instruction: string, deliverable: unknown): Promise<VerifyVerdict> {
  const response = await getClient().messages.create({
    model: VERIFY_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          "INSTRUCTION:",
          instruction,
          "",
          "DELIVERED ANSWER:",
          JSON.stringify(deliverable),
        ].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Verification call was refused.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Verification call returned no text block");
  }
  const parsed = JSON.parse(text.text) as { verdict?: unknown; reasoning?: unknown };
  if (parsed.verdict !== "CORRECT" && parsed.verdict !== "INCORRECT") {
    throw new Error(`Verification call returned an unrecognized verdict: ${JSON.stringify(parsed.verdict)}`);
  }
  return {
    verdict: parsed.verdict,
    reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
  };
}

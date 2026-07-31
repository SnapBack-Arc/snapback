import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";

/**
 * Single real judged verdict for the home page's "Verify" step — same real
 * model and structured-output rigor as lib/disputes/judge-panel.ts's
 * callJudge, deliberately NOT that function: this flow has no dispute, no
 * escrow, no seller, and needs exactly one plain CORRECT/INCORRECT verdict,
 * not an 8-judge tiered panel that ends in resolveDispute() moving real
 * escrowed funds. Reuses the model/quality bar, not the dispute machinery.
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

const SYSTEM = `You are an independent judge verifying whether a delivered answer correctly and accurately fulfills what was asked. You do not see who produced the answer or how — judge only the substance.

Rules:
- Judge only whether the answer actually, accurately fulfills the instruction as given — not whether it goes further than what was asked.
- A well-hedged answer that honestly reports low confidence or partial findings is not itself a failure — judge whether what it does claim is accurate and responsive.
- verdict must be exactly "CORRECT" or "INCORRECT" — there is no partial credit and no third option.
- reasoning: 1-3 plain sentences naming the deciding factor.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: requireServerEnv("ANTHROPIC_API_KEY") });
  return client;
}

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
    model: "claude-opus-4-8",
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

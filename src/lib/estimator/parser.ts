import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";
import type { CategoryDef } from "@/lib/categories";

/**
 * Estimator spec parser.
 *
 * Normalizes a free-text quote request into a structured spec. The re-quote gate
 * compares these fields — never the raw text — so typos and rewordings that mean
 * the same thing resolve to an identical spec and don't read as a topic change.
 *
 * Uses structured outputs so the model can only emit schema-valid JSON.
 */

export type ParsedSpec = {
  /** Canonical, typo-corrected subject, e.g. "supplier sourcing for LED panels". */
  subject: string;
  /** Lowercase slug of the subject — the gate's equality key. */
  subject_key: string;
  /** Normalized difficulty band, 1 (trivial) … 5 (very hard). */
  difficulty: number;
  /** Primary quantity driving scope (e.g. 5 suppliers → 5). Null when absent. */
  scope_quantity: number | null;
  /** What the buyer wants delivered. */
  deliverable: string;
  /** Explicit constraints (deadlines, regions, formats). */
  constraints: string[];
  /**
   * True only if this request genuinely belongs in the category it was parsed
   * against — the model is asked to judge this, not assume it (the system
   * prompt used to just tell it "parse it as a request within that
   * category," which meant nothing was ever actually checked). See
   * submitQuoteRequest in lib/estimator/service.ts, which blocks on this
   * before a quote is ever generated.
   */
  category_fit: boolean;
  /** One short sentence, only meaningful when category_fit is false: what kind of request this actually looks like. */
  category_fit_reason: string;
};

const SPEC_SCHEMA = {
  type: "object",
  properties: {
    subject: {
      type: "string",
      description:
        "Canonical subject of the request, typos corrected, no quantities. e.g. 'supplier sourcing for LED panels'",
    },
    subject_key: {
      type: "string",
      description:
        "Lowercase kebab-case slug of subject, stable across rewordings. e.g. 'supplier-sourcing-led-panels'",
    },
    difficulty: {
      type: "integer",
      enum: [1, 2, 3, 4, 5],
      description:
        "Difficulty band: 1 trivial, 2 easy, 3 moderate, 4 hard, 5 very hard. Driven by scope and complexity.",
    },
    scope_quantity: {
      anyOf: [{ type: "number" }, { type: "null" }],
      description:
        "The main quantity that drives scope (e.g. 'find 5 suppliers' → 5). Null if the request has no quantity.",
    },
    deliverable: {
      type: "string",
      description: "What the buyer wants delivered.",
    },
    constraints: {
      type: "array",
      items: { type: "string" },
      description: "Explicit constraints: deadlines, regions, formats, budgets.",
    },
    category_fit: {
      type: "boolean",
      description:
        "True only if the request's actual deliverable genuinely belongs in the given category. False if it clearly reads as a different kind of work.",
    },
    category_fit_reason: {
      type: "string",
      description:
        "One short sentence. Only meaningful when category_fit is false: plainly state what kind of request this actually looks like, e.g. 'This looks like icon/graphic design work, not research or sourcing.' Empty string when category_fit is true.",
    },
  },
  required: [
    "subject",
    "subject_key",
    "difficulty",
    "scope_quantity",
    "deliverable",
    "constraints",
    "category_fit",
    "category_fit_reason",
  ],
  additionalProperties: false,
} as const;

function systemPrompt(category: CategoryDef): string {
  return `You normalize freelance/agent task requests into a structured spec.

The buyer has chosen the category "${category.label}" (${category.description})
before writing this request. Buyers sometimes pick the wrong category — you
must judge whether this request genuinely belongs there, not assume it does.
Still parse every other field as best you can either way.

Rules:
- Correct typos and rewordings. Two requests that mean the same thing must produce
  the same subject_key and the same difficulty.
- subject_key must be stable: derive it from the enduring topic only. Exclude
  quantities, dates, and phrasing. "find me 5 LED pannel supplyers" and
  "I need five suppliers of LED panels" must both give 'supplier-sourcing-led-panels'.
- difficulty reflects the real work: scale it with scope_quantity and complexity.
  Sourcing 5 suppliers is not the same difficulty as sourcing 50.
- scope_quantity is the single number that most drives scope, or null.
- category_fit is true only if the deliverable genuinely matches "${category.label}"
  (${category.description}). If the request clearly describes a different kind of
  work, set it false and say what it actually looks like in category_fit_reason.
  When it's genuinely ambiguous or borderline rather than clearly a different
  category, default to true — this is a hard block for buyers, not a style nitpick.`;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireServerEnv("ANTHROPIC_API_KEY") });
  }
  return client;
}

/** Parse a raw quote request into the structured spec the gate compares. */
export async function parseSpec(rawText: string, category: CategoryDef): Promise<ParsedSpec> {
  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    system: systemPrompt(category),
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SPEC_SCHEMA },
    },
    messages: [{ role: "user", content: rawText }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Spec parsing was refused for this request.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Parser returned no text block");
  }
  const spec = JSON.parse(text.text) as ParsedSpec;
  // Normalize the key defensively — it is the gate's equality axis.
  spec.subject_key = spec.subject_key.trim().toLowerCase();
  return spec;
}

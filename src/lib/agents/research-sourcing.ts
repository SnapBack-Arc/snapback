import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";
import { payParallelSearch, ParallelPaymentError } from "@/lib/agents/parallel-client";

/**
 * The ONE genuine, non-simulated worker agent in the marketplace (see
 * README.md "Simulated vs. real sellers"). Every other seed listing is
 * placeholder inventory that a real task just sits against forever — no
 * code anywhere executes their side of the work. This one actually does:
 * given a task's request, it researches it with Claude's real web_search
 * tool and returns a structured deliverable built only from sources it
 * actually found, which flows into the exact same runValidation() pipeline
 * (lib/validator-service.ts) any other seller's deliverable would use — no
 * special-casing in validation, approval, disputes, or settlement. The
 * special-casing lives only at the trigger point (deciding this listing
 * has an automated worker at all), in
 * /api/tasks/[id]/deliver/route.ts.
 *
 * As of the Parallel integration, this also makes one real, paid x402 call
 * to Parallel's search API (lib/agents/parallel-client.ts) alongside
 * Claude's own web_search — real USDC on Base mainnet, not simulated. That
 * payment is a hidden cost-basis input feeding Claude's report, never a
 * separately-cited source (Claude's web_search results remain the only
 * citable sources in the deliverable, per the "never fabricate a source"
 * rule below). If the real payment fails for any reason, the task MUST
 * still complete on Claude's web_search alone — a marketplace outage can
 * never block delivery — and the caller records $0 real cost for that run,
 * not the expected $0.01. See runResearchSourcingAgent's return shape.
 */

export type ResearchFinding = {
  title: string;
  url: string;
  summary: string;
  confidence: "high" | "medium" | "low";
  /** Self-reported, best-effort — see STRUCTURE_SCHEMA's description. */
  source_role: "primary" | "distributor_or_reseller" | "uncertain";
  /** Exact url of another finding in this SAME deliverable this one overlaps with (same underlying brand/manufacturer), or null. */
  overlaps_with: string | null;
};

export type ResearchDeliverable = {
  overall_summary: string;
  findings: ResearchFinding[];
};

const STRUCTURE_SCHEMA = {
  type: "object",
  properties: {
    overall_summary: {
      type: "string",
      description: "2-4 sentences directly answering the request, summarizing what was found.",
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
            description: "What this specific source shows and why it's relevant to the request.",
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "How directly this source supports the finding — high for a primary/authoritative source directly on point, low for something inferred or only tangentially relevant.",
          },
          source_role: {
            type: "string",
            enum: ["primary", "distributor_or_reseller", "uncertain"],
            description:
              "Is this source the PRIMARY manufacturer/brand behind what's being cited ('primary'), or does it present itself as reselling/distributing another company's product or brand ('distributor_or_reseller')? Use 'uncertain' if the source material doesn't make this clear, or if the entity genuinely does both (e.g. distributes others' products while also developing its own) — do not force a guess.",
          },
          overlaps_with: {
            type: ["string", "null"],
            description:
              "If this finding represents the same underlying brand/manufacturer/product line as ANOTHER finding in this SAME deliverable (e.g. a distributor of a brand that's also listed separately), set this to that other finding's exact url. Otherwise null. Only mark an overlap when the connection is actually stated or clearly evident in the source material — never infer a speculative connection.",
          },
        },
        required: ["title", "url", "summary", "confidence", "source_role", "overlaps_with"],
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
 * Step 1: actually research the request with real web search (not a
 * simulated/canned response). Returns the raw report text plus the real
 * search results Claude found, so step 2 can be constrained to only cite
 * sources that genuinely came back from a search.
 */
async function research(
  taskDescription: string,
  parallelFinding: string | null,
): Promise<{
  reportText: string;
  sources: { title: string; url: string }[];
}> {
  const userContent = parallelFinding
    ? [
        "ADDITIONAL REAL SEARCH RESULT (from a separately paid search API — for your background only, NOT a citable source; do not reference or link to it in your report):",
        parallelFinding,
        "",
        "TASK REQUEST:",
        taskDescription,
      ].join("\n")
    : taskDescription;

  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    system:
      "You are a research & sourcing agent fulfilling a paid task. Use web search to actually investigate the request below, then write a plain-language research report covering what you found, from which sources, and how confident you are in each finding. Only report sources you actually found via search — never fabricate a source, a URL, or a finding you didn't verify.",
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Research agent refused this request.");
  }

  const reportText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n\n");

  const sources: { title: string; url: string }[] = [];
  for (const block of response.content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (result.type === "web_search_result") {
          sources.push({ title: result.title, url: result.url });
        }
      }
    }
  }

  if (sources.length === 0) {
    throw new Error(
      "Research agent found no web sources for this request — cannot produce a sourced deliverable.",
    );
  }

  return { reportText, sources };
}

/**
 * Step 2: structure the raw report into the deliverable schema, same
 * structured-output pattern as lib/estimator/parser.ts and
 * lib/disputes/feedback.ts. Explicitly constrained to the real source list
 * from step 1 so structuring can't quietly invent a citation.
 */
async function structure(
  taskDescription: string,
  reportText: string,
  sources: { title: string; url: string }[],
): Promise<ResearchDeliverable> {
  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    system:
      "Structure the research report into the deliverable schema. Only cite sources from the REAL SOURCES list provided — never invent a title or URL not in that list. " +
      "For each finding, also assess source_role and overlaps_with by comparing it against every OTHER finding in this same deliverable: mark overlaps_with only when the source material actually discloses that two findings trace back to the same underlying brand/manufacturer (e.g. one page states it distributes or resells the other's brand) — never infer an undisclosed relationship. If a finding's role or relationship to the others isn't clear from what the sources actually say, use 'uncertain' / null rather than guessing.",
    output_config: { effort: "low", format: { type: "json_schema", schema: STRUCTURE_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          "ORIGINAL REQUEST:",
          taskDescription,
          "",
          "RESEARCH REPORT:",
          reportText,
          "",
          "REAL SOURCES FOUND (only cite from this list):",
          JSON.stringify(sources),
        ].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Research agent's structuring step was refused.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Research agent returned no structured output");
  }
  return JSON.parse(text.text) as ResearchDeliverable;
}

/** Real Parallel payment evidence for one task run — null when the payment failed and Claude's web_search ran alone. */
export type ParallelPaymentRecord = {
  amountUsdc: number;
  txHash: string;
  payerAddress: string;
  payeeAddress: string;
};

export type ResearchSourcingResult = {
  deliverable: ResearchDeliverable;
  parallelPayment: ParallelPaymentRecord | null;
  /** Set only when the real payment was attempted and failed — lets the caller's ledger row explain the $0. */
  parallelPaymentError: string | null;
};

export async function runResearchSourcingAgent(
  taskDescription: string,
): Promise<ResearchSourcingResult> {
  let parallelPayment: ParallelPaymentRecord | null = null;
  let parallelPaymentError: string | null = null;
  let parallelFinding: string | null = null;

  try {
    const paid = await payParallelSearch(taskDescription);
    parallelPayment = {
      amountUsdc: paid.amountUsdc,
      txHash: paid.txHash,
      payerAddress: paid.payerAddress,
      payeeAddress: paid.payeeAddress,
    };
    parallelFinding = JSON.stringify(paid.result);
  } catch (err) {
    // Required behavior: a failed real payment must never block the task —
    // fall back to Claude's own web_search alone. parallelPayment stays
    // null, so the caller records $0 real cost for this run, not $0.01.
    parallelPaymentError = err instanceof ParallelPaymentError ? err.message : String(err);
    console.error(`[research-sourcing] Parallel payment failed, falling back to web_search only: ${parallelPaymentError}`);
  }

  const { reportText, sources } = await research(taskDescription, parallelFinding);
  const deliverable = await structure(taskDescription, reportText, sources);
  return { deliverable, parallelPayment, parallelPaymentError };
}

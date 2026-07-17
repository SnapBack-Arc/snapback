import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { requireServerEnv } from "@/lib/env";

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
 */

export type ResearchFinding = {
  title: string;
  url: string;
  summary: string;
  confidence: "high" | "medium" | "low";
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
 * Step 1: actually research the request with real web search (not a
 * simulated/canned response). Returns the raw report text plus the real
 * search results Claude found, so step 2 can be constrained to only cite
 * sources that genuinely came back from a search.
 */
async function research(taskDescription: string): Promise<{
  reportText: string;
  sources: { title: string; url: string }[];
}> {
  const response = await getClient().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 4096,
    system:
      "You are a research & sourcing agent fulfilling a paid task. Use web search to actually investigate the request below, then write a plain-language research report covering what you found, from which sources, and how confident you are in each finding. Only report sources you actually found via search — never fabricate a source, a URL, or a finding you didn't verify.",
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: taskDescription }],
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
      "Structure the research report into the deliverable schema. Only cite sources from the REAL SOURCES list provided — never invent a title or URL not in that list.",
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

export async function runResearchSourcingAgent(
  taskDescription: string,
): Promise<ResearchDeliverable> {
  const { reportText, sources } = await research(taskDescription);
  return structure(taskDescription, reportText, sources);
}

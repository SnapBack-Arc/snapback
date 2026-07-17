import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import {
  revalidateTaskWithLastDeliverable,
  revalidateTaskWithFreshResearch,
} from "@/lib/admin-actions";

/**
 * POST /api/admin/tasks/[id]/revalidate
 * Body: { source: "last_deliverable" | "fresh_research", confirmText: "CONFIRM" }
 *
 * "last_deliverable" re-runs the validator against whatever was last
 * persisted to validations.deliverable for this task. "fresh_research" only
 * works for tasks backed by the Research & Sourcing agent — it regenerates a
 * brand-new deliverable and validates that instead.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;

  let source: unknown;
  let confirmText: unknown;
  try {
    ({ source, confirmText } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (confirmText !== "CONFIRM") {
    return NextResponse.json({ error: 'confirmText must be "CONFIRM"' }, { status: 400 });
  }
  if (source !== "last_deliverable" && source !== "fresh_research") {
    return NextResponse.json(
      { error: 'source must be "last_deliverable" or "fresh_research"' },
      { status: 400 },
    );
  }

  try {
    const result =
      source === "last_deliverable"
        ? await revalidateTaskWithLastDeliverable(auth.wallet.id, id)
        : await revalidateTaskWithFreshResearch(auth.wallet.id, id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to re-run validation";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

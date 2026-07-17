import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { runValidation } from "@/lib/validator-service";

/**
 * POST /api/validate
 * Body: { taskId, deliverable }
 *
 * Runs the buyer-agent validator on a delivered payload. Auto-approves (releases
 * escrow) on a pass; auto-files a dispute (freezing escrow) on any failure.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let taskId: string;
  let deliverable: unknown;
  try {
    ({ taskId, deliverable } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof taskId !== "string" || deliverable === undefined) {
    return NextResponse.json(
      { error: "taskId and deliverable are required" },
      { status: 400 },
    );
  }

  try {
    const result = await runValidation(taskId, deliverable);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

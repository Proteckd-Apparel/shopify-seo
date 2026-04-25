// Poll endpoint for BulkProgressBar. Route handlers run in parallel,
// unlike server actions which serialize per-client — critical here because
// we need to poll JobRun status WHILE the long-running apply action is
// still in flight.
//
// Two modes:
//   ?kind=foo   — return the latest job for that one kind (existing usage)
//   no kind     — return the most-recent currently-running job across all
//                 kinds, used by the global topbar pill so the user can
//                 navigate away and still see what's optimizing.

import { prisma } from "@/lib/prisma";
import { getLatestJob, type JobKind } from "@/lib/bulk-job";

export const dynamic = "force-dynamic";

// Server actions cap at 10 min (`maxDuration = 600`). Anything still
// "running" after this window died mid-execution (Railway redeploy,
// crash, function timeout) and won't ever call finishJob. The pill
// query filters these out so they auto-hide instead of showing forever.
const STALE_AFTER_MS = 15 * 60 * 1000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as JobKind | null;
  if (kind) {
    const row = await getLatestJob(kind);
    return Response.json(row);
  }
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const row = await prisma.jobRun.findFirst({
    where: { status: "running", startedAt: { gte: cutoff } },
    orderBy: { startedAt: "desc" },
  });
  if (!row) return Response.json(null);
  return Response.json({
    id: row.id,
    kind: row.kind,
    status: row.status,
    progress: row.progress,
    total: row.total,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  });
}

// User-initiated dismiss from the topbar pill. Marks a stuck job as
// failed so it disappears from the pill and stops polling.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return Response.json({ ok: false, error: "missing id" }, { status: 400 });
  await prisma.jobRun.update({
    where: { id: body.id },
    data: { status: "failed", finishedAt: new Date(), error: "Dismissed by user" },
  });
  return Response.json({ ok: true });
}

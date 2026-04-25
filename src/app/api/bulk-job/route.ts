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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as JobKind | null;
  if (kind) {
    const row = await getLatestJob(kind);
    return Response.json(row);
  }
  // No kind → find the newest currently-running job, regardless of kind.
  const row = await prisma.jobRun.findFirst({
    where: { status: "running" },
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

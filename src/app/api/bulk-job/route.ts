// Poll endpoint for BulkProgressBar. Route handlers run in parallel,
// unlike server actions which serialize per-client — critical here because
// we need to poll JobRun status WHILE the long-running apply action is
// still in flight.

import { getLatestJob, type JobKind } from "@/lib/bulk-job";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") as JobKind | null;
  if (!kind) {
    return Response.json({ error: "kind is required" }, { status: 400 });
  }
  const row = await getLatestJob(kind);
  return Response.json(row);
}

// Read-only sibling of /api/cron/cleanup. Returns the most recent CleanupRun
// row so the proteckd-admin dashboard can show "last cleanup ran X ago,
// pruned N rows" instead of just the cron schedule.
//
// Same Bearer CRON_SECRET gate as the run endpoint — the data isn't
// secret but the endpoint shouldn't be open to the public internet.

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const last = await prisma.cleanupRun.findFirst({
    orderBy: { ranAt: "desc" },
  });

  if (!last) {
    return Response.json({ ok: true, last: null });
  }

  return Response.json({
    ok: true,
    last: {
      ranAt: last.ranAt.toISOString(),
      durationMs: last.durationMs,
      imageBackups: last.imageBackups,
      scanRuns: last.scanRuns,
      notFoundResolved: last.notFoundResolved,
      notFoundStale: last.notFoundStale,
      brokenLinks: last.brokenLinks,
      jobRuns: last.jobRuns,
      staleJobsFailed: last.staleJobsFailed,
      totalPruned:
        last.imageBackups +
        last.scanRuns +
        last.notFoundResolved +
        last.notFoundStale +
        last.brokenLinks +
        last.jobRuns +
        last.staleJobsFailed,
    },
  });
}

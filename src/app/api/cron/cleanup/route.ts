// Periodic cleanup endpoint. Point Railway cron (or any external scheduler)
// at this URL daily to drop stale ImageBackup bytes, old 404 logs, finished
// JobRuns, and expired BrokenLink captures.
//
// Auth: requires Bearer CRON_SECRET. Set CRON_SECRET in Railway env, then
// configure the cron with:
//   Authorization: Bearer <CRON_SECRET>
// If no secret is configured the route refuses to run.

import { runAllCleanups } from "@/lib/cleanup";
import { loadOptimizerConfig } from "@/lib/optimizer-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  // User-controlled kill switch. Cron worker will still ping us at 03:00 UTC
  // (it's centralized + dumb), but we no-op here when the toggle is off.
  const cfg = await loadOptimizerConfig();
  if (!cfg.cleanupCronEnabled) {
    return Response.json({ ok: true, skipped: "disabled in settings" });
  }

  try {
    const report = await runAllCleanups();
    return Response.json({ ok: true, ...report });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}

// GET mirrors POST so Railway's HTTP cron (which defaults to GET) still works.
export const GET = POST;

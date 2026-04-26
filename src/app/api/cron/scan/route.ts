// Periodic catalog scan endpoint. Point an external scheduler (the
// proteckd-cron Cloudflare Worker, Railway cron, etc.) at this URL on
// whatever cadence you want — daily for most stores, hourly if your
// catalog changes constantly.
//
// Behavior:
// 1. Runs the scanner (refreshes local Resource cache from Shopify,
//    writes Issue rows for missing fields, etc.)
// 2. If the OptimizerConfig.masterAutoOptimize switch is ON, fires
//    runOptimizeAll() afterwards so newly-added products / posts get
//    AI-filled meta titles + descriptions + alt texts automatically.
//    Existing curated copy is left alone (assuming overwrite toggles
//    are off, which is the recommended default).
//
// Auth: Bearer CRON_SECRET (matches the cleanup cron pattern). Set
// CRON_SECRET in Railway env, then configure the external scheduler:
//   Authorization: Bearer <CRON_SECRET>
// If no secret is configured the route refuses to run.
//
// Response:
//   { ok, durationMs, scan: { totalPages, totalIssues }, autoOptimize: { ran } }

import { runScan } from "@/lib/scanner";
import { runOptimizeAll } from "@/lib/optimize-all";
import { loadOptimizerConfig } from "@/lib/optimizer-config";
import { finishJob, startJob } from "@/lib/bulk-job";

export const dynamic = "force-dynamic";
// Scan + optimize is the longest-running thing this app does. Push the
// max duration as far as the runtime allows; the cron will time out on
// massive catalogs but for normal Shopify stores this completes well
// inside 10 minutes.
export const maxDuration = 600;

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

  const start = Date.now();
  let scanResult: { totalPages: number; totalIssues: number } | null = null;
  let autoOptimizeRan = false;
  let autoOptimizeError: string | null = null;

  // Phase 1: scan. Wrap in a JobRun so the topbar pill shows progress
  // for any user who happens to be in the app when the cron fires.
  const job = await startJob("scan", 0);
  try {
    const r = await runScan(undefined, job.id);
    scanResult = { totalPages: r.totalPages, totalIssues: r.totalIssues };
    await finishJob(job.id, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "scan failed";
    await finishJob(job.id, { ok: false, error: msg });
    return Response.json(
      { ok: false, error: msg, phase: "scan" },
      { status: 500 },
    );
  }

  // Phase 2: auto-optimize, gated on master switch. Awaited so the cron
  // response only returns once everything is done — gives the scheduler
  // a real success/failure signal.
  try {
    const cfg = await loadOptimizerConfig();
    if (cfg.masterAutoOptimize) {
      await runOptimizeAll();
      autoOptimizeRan = true;
    }
  } catch (e) {
    autoOptimizeError = e instanceof Error ? e.message : "optimize failed";
    console.error("[cron/scan] auto-optimize failed:", e);
  }

  return Response.json({
    ok: true,
    durationMs: Date.now() - start,
    scan: scanResult,
    autoOptimize: {
      ran: autoOptimizeRan,
      error: autoOptimizeError,
    },
  });
}

// GET mirrors POST so HTTP cron schedulers (which often default to GET)
// still work without configuration.
export const GET = POST;

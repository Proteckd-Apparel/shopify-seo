"use server";

import { revalidatePath } from "next/cache";
import { runScan } from "@/lib/scanner";
import { finishJob, startJob } from "@/lib/bulk-job";
import { loadOptimizerConfig } from "@/lib/optimizer-config";
import { runOptimizeAll } from "@/lib/optimize-all";

export type ScanActionResult = {
  ok: boolean;
  message: string;
  totalPages?: number;
  totalIssues?: number;
  autoOptimizeQueued?: boolean;
};

export async function startScan(): Promise<ScanActionResult> {
  // Wrap the scan in a JobRun so BulkProgressBar (polling /api/bulk-job) can
  // show live progress and the user can navigate around the app while it
  // runs instead of watching a frozen button.
  const job = await startJob("scan", 0);
  try {
    const r = await runScan(undefined, job.id);
    await finishJob(job.id, { ok: true });
    revalidatePath("/");
    revalidatePath("/analytics/scan");
    revalidatePath("/analytics/scan-issues");
    revalidatePath("/analytics/scan-logs");
    revalidatePath("/analytics/dashboard");
    revalidatePath("/analytics/coverage");

    // If the master auto-optimize switch is on, kick off Optimize All
    // immediately after a successful scan. Fire-and-forget so this
    // server action returns to the user with scan results; the
    // optimize job runs as its own JobRun and shows in the topbar pill.
    let autoOptimizeQueued = false;
    try {
      const cfg = await loadOptimizerConfig();
      if (cfg.masterAutoOptimize) {
        autoOptimizeQueued = true;
        // Don't await — run on the server thread but let the response
        // return. If the user navigates away, runOptimizeAll keeps
        // grinding because it's a server-side promise.
        runOptimizeAll().catch((err) => {
          console.error("[scan→auto-optimize] failed:", err);
        });
      }
    } catch {}

    return {
      ok: true,
      message:
        `Scan complete in ${(r.durationMs / 1000).toFixed(1)}s` +
        (autoOptimizeQueued ? " — auto-optimize started" : ""),
      totalPages: r.totalPages,
      totalIssues: r.totalIssues,
      autoOptimizeQueued,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await finishJob(job.id, { ok: false, error: msg });
    return { ok: false, message: msg };
  }
}

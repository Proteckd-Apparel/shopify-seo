"use server";

import { revalidatePath } from "next/cache";
import { runScan } from "@/lib/scanner";
import { finishJob, startJob } from "@/lib/bulk-job";

export type ScanActionResult = {
  ok: boolean;
  message: string;
  totalPages?: number;
  totalIssues?: number;
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
    return {
      ok: true,
      message: `Scan complete in ${(r.durationMs / 1000).toFixed(1)}s`,
      totalPages: r.totalPages,
      totalIssues: r.totalIssues,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    await finishJob(job.id, { ok: false, error: msg });
    return { ok: false, message: msg };
  }
}

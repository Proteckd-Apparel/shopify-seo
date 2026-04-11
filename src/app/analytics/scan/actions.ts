"use server";

import { revalidatePath } from "next/cache";
import { runScan } from "@/lib/scanner";

export type ScanActionResult = {
  ok: boolean;
  message: string;
  totalPages?: number;
  totalIssues?: number;
};

export async function startScan(): Promise<ScanActionResult> {
  try {
    const r = await runScan();
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
    return { ok: false, message: msg };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import {
  scanForBrokenImageRefs,
  applyImageRecoveryFixes,
  type Fix,
  type ScanReport,
  type ApplyReport,
} from "@/lib/article-image-recovery";

export async function runScan(): Promise<{
  ok: boolean;
  report?: ScanReport;
  message?: string;
}> {
  try {
    const report = await scanForBrokenImageRefs();
    return { ok: true, report };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Scan failed",
    };
  }
}

export async function runApply(fixes: Fix[]): Promise<{
  ok: boolean;
  report?: ApplyReport;
  message?: string;
}> {
  try {
    if (fixes.length === 0) {
      return { ok: false, message: "No fixes selected" };
    }
    const report = await applyImageRecoveryFixes(fixes);
    revalidatePath("/tools/recover-images");
    return { ok: true, report };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Apply failed",
    };
  }
}

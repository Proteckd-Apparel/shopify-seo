"use server";

import { revalidatePath } from "next/cache";
import { runOptimizeAll } from "@/lib/optimize-all";

export type RunResult = {
  ok: boolean;
  message: string;
  totalProcessed?: number;
  totalSaved?: number;
  totalFailed?: number;
};

export async function startOptimizeAll(): Promise<RunResult> {
  try {
    const r = await runOptimizeAll();
    revalidatePath("/optimize/all");
    revalidatePath("/optimize/meta-titles");
    revalidatePath("/optimize/meta-descriptions");
    revalidatePath("/optimize/alt-texts");
    revalidatePath("/analytics/dashboard");
    return {
      ok: r.totalFailed === 0,
      message: `Done. Processed ${r.totalProcessed}, saved ${r.totalSaved}, failed ${r.totalFailed}.`,
      totalProcessed: r.totalProcessed,
      totalSaved: r.totalSaved,
      totalFailed: r.totalFailed,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import {
  loadOptimizerConfig,
  saveOptimizerConfig,
  type OptimizerConfig,
} from "@/lib/optimizer-config";

export type ConfigSaveResult = { ok: boolean; message: string };

export async function saveConfig(
  cfg: OptimizerConfig,
): Promise<ConfigSaveResult> {
  try {
    await saveOptimizerConfig(cfg);
    revalidatePath("/optimize/settings");
    revalidatePath("/optimize/all");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function getConfig() {
  return loadOptimizerConfig();
}

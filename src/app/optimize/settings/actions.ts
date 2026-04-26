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

// Set every per-field *Overwrite flag across products / collections /
// articles / pages to the same value in one atomic save. Drives the
// "Overwrite existing values" master toggle on the settings page —
// ON = regenerate everything on auto-runs, OFF = only fill empty
// fields (recommended for ongoing automation).
export async function setAllOverwrites(
  enabled: boolean,
): Promise<ConfigSaveResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const next: OptimizerConfig = {
      ...cfg,
      products: {
        ...cfg.products,
        metaTitlesOverwrite: enabled,
        metaDescriptionsOverwrite: enabled,
        altTextsOverwrite: enabled,
        htmlTextOverwrite: enabled,
      },
      collections: {
        ...cfg.collections,
        metaTitlesOverwrite: enabled,
        metaDescriptionsOverwrite: enabled,
        altTextsOverwrite: enabled,
        htmlTextOverwrite: enabled,
      },
      articles: {
        ...cfg.articles,
        metaTitlesOverwrite: enabled,
        metaDescriptionsOverwrite: enabled,
        altTextsOverwrite: enabled,
        htmlTextOverwrite: enabled,
      },
      pages: {
        ...cfg.pages,
        metaTitlesOverwrite: enabled,
        metaDescriptionsOverwrite: enabled,
        altTextsOverwrite: enabled,
        htmlTextOverwrite: enabled,
      },
    };
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/settings");
    return {
      ok: true,
      message: enabled
        ? "Overwrite turned ON — auto-optimize will regenerate existing values."
        : "Overwrite turned OFF — auto-optimize will only fill empty values.",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

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

// One-click "fill empty only" mode for auto-optimize. Flips every
// *Overwrite flag across products / collections / articles / pages
// to false. Existing values stay untouched on auto-runs; only blank
// fields get AI-filled. Recommended for ongoing automation so an
// import or scan never randomly rewrites curated copy.
export async function disableAllOverwrites(): Promise<ConfigSaveResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const next: OptimizerConfig = {
      ...cfg,
      products: {
        ...cfg.products,
        metaTitlesOverwrite: false,
        metaDescriptionsOverwrite: false,
        altTextsOverwrite: false,
        htmlTextOverwrite: false,
      },
      collections: {
        ...cfg.collections,
        metaTitlesOverwrite: false,
        metaDescriptionsOverwrite: false,
        altTextsOverwrite: false,
        htmlTextOverwrite: false,
      },
      articles: {
        ...cfg.articles,
        metaTitlesOverwrite: false,
        metaDescriptionsOverwrite: false,
        altTextsOverwrite: false,
        htmlTextOverwrite: false,
      },
      pages: {
        ...cfg.pages,
        metaTitlesOverwrite: false,
        metaDescriptionsOverwrite: false,
        altTextsOverwrite: false,
        htmlTextOverwrite: false,
      },
    };
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/settings");
    return { ok: true, message: "All overwrite toggles turned off — auto-optimize will only fill empty values now." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

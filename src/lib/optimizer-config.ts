// Optimizer settings model + defaults. Stored as JSON in Settings.optimizerRules
// (we reuse that field; the AI free-text rules live under `notes`).

import { prisma } from "./prisma";

export type ResourceConfig = {
  enabled: boolean;
  scope: "all" | "published" | "drafts"; // which to update
  metaTitles: boolean;
  metaTitlesOverwrite: boolean;
  metaDescriptions: boolean;
  metaDescriptionsOverwrite: boolean;
  altTexts: boolean;
  altTextsOverwrite: boolean;
  htmlText: boolean;
  htmlTextOverwrite: boolean;
  titles: boolean;
  urls: boolean;
  jsonLd: boolean;
  jsonLdFaq: boolean;
  photoFilenames: boolean;
  resizePhotos: boolean;
  compressPhotos: boolean;
  tags: boolean;
  translations: boolean;
};

export type OptimizerConfig = {
  // Global
  masterAutoOptimize: boolean;
  notes: string; // free-form AI brand voice / rules
  // Per resource type
  products: ResourceConfig;
  collections: ResourceConfig;
  articles: ResourceConfig;
  pages: ResourceConfig;
  // Theme images
  themeImages: { enabled: boolean; resize: boolean; compress: boolean; alt: boolean };
  // Skip rules
  skipPagesPatterns: string[]; // path globs
  skipProductsWithTags: string[];
  skipProductsByVendor: string[];
  // Behavior
  doNotReoptimizePhotos: boolean;
  doNotReoptimizeFilenames: boolean;
  upscalePhotos: boolean;
};

const DEFAULT_RESOURCE_CONFIG: ResourceConfig = {
  enabled: true,
  scope: "published",
  metaTitles: true,
  metaTitlesOverwrite: false,
  metaDescriptions: true,
  metaDescriptionsOverwrite: false,
  altTexts: true,
  altTextsOverwrite: false,
  htmlText: false,
  htmlTextOverwrite: false,
  titles: false,
  urls: false,
  jsonLd: true,
  jsonLdFaq: false,
  photoFilenames: false,
  resizePhotos: false,
  compressPhotos: false,
  tags: false,
  translations: false,
};

export const DEFAULT_OPTIMIZER_CONFIG: OptimizerConfig = {
  masterAutoOptimize: false,
  notes: "",
  products: { ...DEFAULT_RESOURCE_CONFIG },
  collections: { ...DEFAULT_RESOURCE_CONFIG, htmlText: false },
  articles: { ...DEFAULT_RESOURCE_CONFIG, jsonLd: false },
  pages: { ...DEFAULT_RESOURCE_CONFIG, jsonLd: false, altTexts: false },
  themeImages: { enabled: false, resize: false, compress: false, alt: false },
  skipPagesPatterns: [],
  skipProductsWithTags: [],
  skipProductsByVendor: [],
  doNotReoptimizePhotos: false,
  doNotReoptimizeFilenames: false,
  upscalePhotos: false,
};

export async function loadOptimizerConfig(): Promise<OptimizerConfig> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.optimizerRules) return { ...DEFAULT_OPTIMIZER_CONFIG };
  try {
    const parsed = JSON.parse(s.optimizerRules);
    if (typeof parsed === "object" && parsed && "products" in parsed) {
      return { ...DEFAULT_OPTIMIZER_CONFIG, ...parsed };
    }
    // Legacy: free-text notes only
    return { ...DEFAULT_OPTIMIZER_CONFIG, notes: String(parsed) };
  } catch {
    // Treat as plain notes
    return { ...DEFAULT_OPTIMIZER_CONFIG, notes: s.optimizerRules };
  }
}

export async function saveOptimizerConfig(cfg: OptimizerConfig) {
  const json = JSON.stringify(cfg);
  await prisma.settings.upsert({
    where: { id: 1 },
    create: { id: 1, optimizerRules: json },
    update: { optimizerRules: json },
  });
}

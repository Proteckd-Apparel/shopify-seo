// Optimizer settings model + defaults. Stored as JSON in Settings.optimizerRules
// (we reuse that field; the AI free-text rules live under `notes`).

import { prisma } from "./prisma";
import {
  DEFAULT_TEMPLATE,
  type TemplateConfig,
} from "./template-engine";
import {
  DEFAULT_JSON_LD_CONFIG,
  type JsonLdConfig,
} from "./json-ld-config";
import {
  DEFAULT_CLEANUP_CONFIG,
  type CleanupConfig,
} from "./html-cleanup";

export type HtmlCleanupConfig = CleanupConfig & {
  enabled: boolean;
  scope: "all" | "published" | "drafts";
  aiRewrite: boolean; // off by default
  aiInstructions: string; // free-form prompt addition for AI mode
};

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

export type TemplatePurpose =
  | "altText"
  | "metaTitle"
  | "metaDescription"
  | "photoFilename";

export type PhotoFilenameConfig = {
  enabled: boolean;
  scope: "all" | "published" | "drafts";
  doNotReoptimize: boolean;
  maxChars: number;
  removeDuplicateWords: boolean;
  removeSmallWords: boolean;
  disableSuffix: boolean;
  // Per resource type
};

export const DEFAULT_PHOTO_FILENAME_CONFIG: PhotoFilenameConfig = {
  enabled: true,
  scope: "published",
  doNotReoptimize: true,
  maxChars: 90,
  removeDuplicateWords: true,
  removeSmallWords: false,
  disableSuffix: false,
};
export type TemplateScopeKey = "products" | "collections" | "articles" | "pages";

// One TemplateConfig per (purpose, scope) — e.g. templates.altText.products.
export type TemplateMap = Partial<
  Record<TemplatePurpose, Partial<Record<TemplateScopeKey, TemplateConfig>>>
>;

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
  // Templates
  templates: TemplateMap;
  // JSON-LD
  jsonLd: JsonLdConfig;
  // Main HTML Text — per resource type
  htmlCleanup: {
    products: HtmlCleanupConfig;
    collections: HtmlCleanupConfig;
    articles: HtmlCleanupConfig;
    pages: HtmlCleanupConfig;
  };
  // Photo Filenames — per resource type
  photoFilenames: {
    products: PhotoFilenameConfig;
    collections: PhotoFilenameConfig;
    articles: PhotoFilenameConfig;
  };
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
  templates: {},
  jsonLd: DEFAULT_JSON_LD_CONFIG,
  htmlCleanup: {
    products: {
      ...DEFAULT_CLEANUP_CONFIG,
      enabled: true,
      scope: "published",
      aiRewrite: false,
      aiInstructions: "",
    },
    collections: {
      ...DEFAULT_CLEANUP_CONFIG,
      enabled: true,
      scope: "published",
      aiRewrite: false,
      aiInstructions: "",
    },
    articles: {
      ...DEFAULT_CLEANUP_CONFIG,
      enabled: true,
      scope: "all",
      aiRewrite: false,
      aiInstructions: "",
    },
    pages: {
      ...DEFAULT_CLEANUP_CONFIG,
      enabled: true,
      scope: "published",
      aiRewrite: false,
      aiInstructions: "",
    },
  },
  photoFilenames: {
    products: { ...DEFAULT_PHOTO_FILENAME_CONFIG },
    collections: { ...DEFAULT_PHOTO_FILENAME_CONFIG },
    articles: { ...DEFAULT_PHOTO_FILENAME_CONFIG, scope: "all" },
  },
};

export function getTemplate(
  cfg: OptimizerConfig,
  purpose: TemplatePurpose,
  scope: TemplateScopeKey,
): TemplateConfig {
  return cfg.templates?.[purpose]?.[scope] ?? { ...DEFAULT_TEMPLATE };
}

export function setTemplate(
  cfg: OptimizerConfig,
  purpose: TemplatePurpose,
  scope: TemplateScopeKey,
  template: TemplateConfig,
): OptimizerConfig {
  const next: OptimizerConfig = { ...cfg, templates: { ...cfg.templates } };
  next.templates[purpose] = { ...next.templates[purpose], [scope]: template };
  return next;
}

export async function loadOptimizerConfig(): Promise<OptimizerConfig> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.optimizerRules) return { ...DEFAULT_OPTIMIZER_CONFIG };
  try {
    const parsed = JSON.parse(s.optimizerRules);
    if (typeof parsed === "object" && parsed && "products" in parsed) {
      // Deep-merge defaults so newly added fields don't break old saves
      return {
        ...DEFAULT_OPTIMIZER_CONFIG,
        ...parsed,
        htmlCleanup: {
          ...DEFAULT_OPTIMIZER_CONFIG.htmlCleanup,
          ...(parsed.htmlCleanup ?? {}),
        },
        photoFilenames: {
          ...DEFAULT_OPTIMIZER_CONFIG.photoFilenames,
          ...(parsed.photoFilenames ?? {}),
        },
        jsonLd: {
          ...DEFAULT_OPTIMIZER_CONFIG.jsonLd,
          ...(parsed.jsonLd ?? {}),
          products: {
            ...DEFAULT_OPTIMIZER_CONFIG.jsonLd.products,
            ...(parsed.jsonLd?.products ?? {}),
          },
          collections: {
            ...DEFAULT_OPTIMIZER_CONFIG.jsonLd.collections,
            ...(parsed.jsonLd?.collections ?? {}),
          },
          localBusiness: {
            ...DEFAULT_OPTIMIZER_CONFIG.jsonLd.localBusiness,
            ...(parsed.jsonLd?.localBusiness ?? {}),
          },
          other: {
            ...DEFAULT_OPTIMIZER_CONFIG.jsonLd.other,
            ...(parsed.jsonLd?.other ?? {}),
          },
        },
      };
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

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  loadOptimizerConfig,
  saveOptimizerConfig,
} from "@/lib/optimizer-config";
import {
  generateProductSchema,
  generateCollectionSchema,
  generateLocalBusinessSchema,
} from "@/lib/json-ld-generators";
import type { JsonLdConfig } from "@/lib/json-ld-config";
import { setJsonLd } from "@/lib/shopify-metafields";
import {
  commentOutSchemas,
  findExistingSchemas,
  getMainTheme,
  readThemeFiles,
  restoreSchemas,
  writeThemeFile,
} from "@/lib/shopify-theme";
import { shopInfo } from "@/lib/shopify";

// Common Liquid files where JSON-LD scripts live across popular themes.
// Impulse uses snippets/structured-data.liquid + product-template;
// Dawn uses snippets/structured-data.liquid;
// most heavily-customized themes inline schemas in main-product.liquid.
const THEME_FILES_TO_SCAN = [
  "layout/theme.liquid",
  // Impulse + Pixel Union
  "snippets/structured-data.liquid",
  "snippets/structured-data-product.liquid",
  "snippets/product-template.liquid",
  "sections/product-template.liquid",
  "sections/product.liquid",
  // Dawn / Shopify 2.0
  "sections/main-product.liquid",
  "sections/main-collection-product-grid.liquid",
  "sections/main-article.liquid",
  "templates/product.liquid",
  // Prestige
  "snippets/json-ld-product.liquid",
  "snippets/json-ld-collection.liquid",
  "snippets/json-ld-article.liquid",
  // Impulse customizations on Proteckd
  "sections/article-template.liquid",
  "sections/main-collection.liquid",
  "sections/faq.liquid",
  "snippets/product-template-variables.liquid",
];

async function getShop(): Promise<{ domain: string; name: string }> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  let name = settings?.shopDomain ?? "";
  try {
    const info = await shopInfo();
    name = info.shop?.name ?? name;
  } catch {}
  return { domain: settings?.shopDomain ?? "", name };
}

// ---------- Save settings ----------

export async function saveJsonLdConfig(
  patch: Partial<JsonLdConfig>,
): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await loadOptimizerConfig();
    const next = {
      ...cfg,
      jsonLd: {
        ...cfg.jsonLd,
        ...patch,
        products: { ...cfg.jsonLd.products, ...(patch.products ?? {}) },
        collections: {
          ...cfg.jsonLd.collections,
          ...(patch.collections ?? {}),
        },
        localBusiness: {
          ...cfg.jsonLd.localBusiness,
          ...(patch.localBusiness ?? {}),
        },
        other: { ...cfg.jsonLd.other, ...(patch.other ?? {}) },
      },
    };
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/json-ld");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: Products ----------

export type ApplyResult = {
  ok: boolean;
  message: string;
  processed?: number;
  saved?: number;
  failed?: number;
};

export async function applyProductSchemaToOne(
  resourceId: string,
): Promise<ApplyResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const r = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { images: true },
    });
    if (!r) return { ok: false, message: "Resource not found" };
    const shop = await getShop();
    const schema = generateProductSchema(r, cfg.jsonLd.products, shop);
    await setJsonLd(r.id, schema);
    return { ok: true, message: "Applied", processed: 1, saved: 1, failed: 0 };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function applyProductSchemaToAll(): Promise<ApplyResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const shop = await getShop();
    const products = await prisma.resource.findMany({
      where: { type: "product", status: "active" },
      include: { images: true },
      take: 5000,
    });
    let saved = 0;
    let failed = 0;
    for (const p of products) {
      try {
        const schema = generateProductSchema(p, cfg.jsonLd.products, shop);
        await setJsonLd(p.id, schema);
        saved++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/optimize/json-ld");
    return {
      ok: failed === 0,
      message: `Saved ${saved}, failed ${failed}`,
      processed: products.length,
      saved,
      failed,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: Collections ----------

export async function applyCollectionSchemaToAll(): Promise<ApplyResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const shop = await getShop();
    const collections = await prisma.resource.findMany({
      where: { type: "collection" },
      include: { images: true },
      take: 5000,
    });
    let saved = 0;
    let failed = 0;
    for (const c of collections) {
      try {
        const schema = generateCollectionSchema(c, cfg.jsonLd.collections, shop);
        await setJsonLd(c.id, schema);
        saved++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/optimize/json-ld");
    return {
      ok: failed === 0,
      message: `Saved ${saved}, failed ${failed}`,
      processed: collections.length,
      saved,
      failed,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: LocalBusiness ----------

export async function previewLocalBusiness(): Promise<{
  ok: boolean;
  schema?: string;
  message?: string;
}> {
  try {
    const cfg = await loadOptimizerConfig();
    const shop = await getShop();
    const schema = generateLocalBusinessSchema(cfg.jsonLd.localBusiness, shop);
    return { ok: true, schema: JSON.stringify(schema, null, 2) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Theme conflict detection ----------

export type ConflictReport = {
  ok: boolean;
  message: string;
  conflicts: Array<{
    filename: string;
    schemaType: string;
  }>;
};

export async function scanThemeConflicts(): Promise<ConflictReport> {
  try {
    const theme = await getMainTheme();
    if (!theme)
      return { ok: false, message: "No main theme found", conflicts: [] };
    const files = await readThemeFiles(theme.id, THEME_FILES_TO_SCAN);
    const found = findExistingSchemas(files);
    return {
      ok: true,
      message: `${found.length} JSON-LD blocks found in theme`,
      conflicts: found.map((f) => ({
        filename: f.filename,
        schemaType: f.schemaType,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed",
      conflicts: [],
    };
  }
}

export async function disableThemeSchemas(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme found" };
    const files = await readThemeFiles(theme.id, THEME_FILES_TO_SCAN);
    let edited = 0;
    for (const f of files) {
      const newContent = commentOutSchemas(f.content);
      if (newContent !== f.content) {
        await writeThemeFile(theme.id, f.filename, newContent);
        edited++;
      }
    }
    return { ok: true, message: `Disabled JSON-LD in ${edited} theme file(s)` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function enableThemeSchemas(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme found" };
    const files = await readThemeFiles(theme.id, THEME_FILES_TO_SCAN);
    let edited = 0;
    for (const f of files) {
      const newContent = restoreSchemas(f.content);
      if (newContent !== f.content) {
        await writeThemeFile(theme.id, f.filename, newContent);
        edited++;
      }
    }
    return { ok: true, message: `Restored JSON-LD in ${edited} theme file(s)` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

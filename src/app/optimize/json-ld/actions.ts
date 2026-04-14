"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  loadOptimizerConfig,
  saveOptimizerConfig,
} from "@/lib/optimizer-config";
import {
  generateArticleSchema,
  generateProductSchema,
  generateCollectionSchema,
  generateLocalBusinessSchema,
  buildBreadcrumbForResource,
  siteWideSchemas,
} from "@/lib/json-ld-generators";
import { ensureJsonMetafieldDefinition, setMetafield } from "@/lib/shopify-metafields";
import type { JsonLdConfig } from "@/lib/json-ld-config";
import { setJsonLd } from "@/lib/shopify-metafields";
import {
  debugJudgeMe,
  fetchJudgeMeAggregate,
  fetchJudgeMeBatch,
  type JudgeMeDebugReport,
} from "@/lib/judge-me";

export async function debugJudgeMeForResource(
  resourceId: string,
): Promise<JudgeMeDebugReport> {
  return debugJudgeMe(resourceId);
}
import type { RealReviews } from "@/lib/json-ld-generators";
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
  // Always prefer the customer-facing primary domain (e.g. www.proteckd.com)
  // over the .myshopify.com admin domain.
  let domain = settings?.shopDomain ?? "";
  try {
    const info = await shopInfo();
    name = info.shop?.name ?? name;
    const primary = info.shop?.primaryDomain?.url;
    if (primary) {
      domain = primary.replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
  } catch {}
  return { domain, name };
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
    // Best-effort Judge.me lookup; null if not configured or no reviews
    let reviews: RealReviews | null = null;
    try {
      const agg = await fetchJudgeMeAggregate(r.id);
      if (agg) {
        reviews = {
          rating: agg.rating,
          count: agg.count,
          reviews: agg.reviews.map((rv) => ({
            rating: rv.rating,
            title: rv.title,
            body: rv.body,
            reviewer: rv.reviewer.name,
            date: rv.created_at,
          })),
        };
      }
    } catch {}
    const schema = generateProductSchema(
      r,
      cfg.jsonLd.products,
      shop,
      reviews,
      cfg.jsonLd.other.breadcrumb,
    );
    await setJsonLd(r.id, schema);
    return {
      ok: true,
      message: reviews
        ? `Applied with ${reviews.count} real reviews`
        : "Applied (no Judge.me reviews)",
      processed: 1,
      saved: 1,
      failed: 0,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function applyProductSchemaToAll(): Promise<ApplyResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const shop = await getShop();
    const products = await prisma.resource.findMany({
      where: {
        type: "product",
        status: { in: ["active", "ACTIVE"] },
      },
      include: { images: true },
      take: 5000,
    });
    // Pre-fetch Judge.me reviews in parallel (fast) so the per-product loop
    // below doesn't serialize on the network.
    let reviewMap = new Map<string, Awaited<ReturnType<typeof fetchJudgeMeAggregate>>>();
    try {
      const batch = await fetchJudgeMeBatch(products.map((p) => p.id));
      for (const [k, v] of batch) reviewMap.set(k, v);
    } catch {}
    let saved = 0;
    let failed = 0;
    for (const p of products) {
      try {
        const agg = reviewMap.get(p.id);
        const reviews: RealReviews | null = agg
          ? {
              rating: agg.rating,
              count: agg.count,
              reviews: agg.reviews.map((rv) => ({
                rating: rv.rating,
                title: rv.title,
                body: rv.body,
                reviewer: rv.reviewer.name,
                date: rv.created_at,
              })),
            }
          : null;
        const schema = generateProductSchema(
          p,
          cfg.jsonLd.products,
          shop,
          reviews,
          cfg.jsonLd.other.breadcrumb,
        );
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
        const schema = generateCollectionSchema(
          c,
          cfg.jsonLd.collections,
          shop,
          cfg.jsonLd.other.breadcrumb,
        );
        await setJsonLd(c.id, schema as Record<string, unknown>);
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

// ---------- Preview (no write) ----------

export async function previewProductSchema(
  resourceId: string,
): Promise<{ ok: boolean; json?: string; message?: string }> {
  try {
    const cfg = await loadOptimizerConfig();
    const r = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { images: true },
    });
    if (!r) return { ok: false, message: "Resource not found" };
    const shop = await getShop();
    let reviews: RealReviews | null = null;
    try {
      const agg = await fetchJudgeMeAggregate(r.id);
      if (agg) {
        reviews = {
          rating: agg.rating,
          count: agg.count,
          reviews: agg.reviews.map((rv) => ({
            rating: rv.rating,
            title: rv.title,
            body: rv.body,
            reviewer: rv.reviewer.name,
            date: rv.created_at,
          })),
        };
      }
    } catch {}
    const schema = generateProductSchema(
      r,
      cfg.jsonLd.products,
      shop,
      reviews,
      cfg.jsonLd.other.breadcrumb,
    );
    return { ok: true, json: JSON.stringify(schema, null, 2) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function previewCollectionSchema(
  resourceId: string,
): Promise<{ ok: boolean; json?: string; message?: string }> {
  try {
    const cfg = await loadOptimizerConfig();
    const r = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { images: true },
    });
    if (!r) return { ok: false, message: "Resource not found" };
    const shop = await getShop();
    const schema = generateCollectionSchema(
      r,
      cfg.jsonLd.collections,
      shop,
      cfg.jsonLd.other.breadcrumb,
    );
    return { ok: true, json: JSON.stringify(schema, null, 2) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: Articles ----------

export async function applyArticleSchemaToAll(): Promise<ApplyResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const shop = await getShop();
    const articles = await prisma.resource.findMany({
      where: { type: "article" },
      include: { images: true },
      take: 5000,
    });
    let saved = 0;
    let failed = 0;
    for (const a of articles) {
      try {
        const article = generateArticleSchema(a, shop);
        const out = cfg.jsonLd.other.breadcrumb
          ? [article, buildBreadcrumbForResource(a, shop)]
          : article;
        await setJsonLd(a.id, out as Record<string, unknown>);
        saved++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/optimize/json-ld");
    return {
      ok: failed === 0,
      message: `Saved ${saved}, failed ${failed}`,
      processed: articles.length,
      saved,
      failed,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: Site-wide schemas (Other tab) ----------

export async function applySiteWideSchemas(): Promise<ApplyResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const shop = await getShop();
    const schemas = siteWideSchemas(cfg.jsonLd, shop);
    if (schemas.length === 0) {
      return {
        ok: false,
        message: "No site-wide schemas enabled — turn some on first.",
      };
    }
    // Get the shop GID so we can write a shop-level metafield
    const info = await shopInfo();
    const shopGid = info.shop?.id;
    if (!shopGid) return { ok: false, message: "Could not resolve shop GID" };

    await ensureJsonMetafieldDefinition(
      "SHOP",
      "custom",
      "json_ld_sitewide",
      "JSON-LD Site-wide",
    );
    await setMetafield({
      ownerId: shopGid,
      namespace: "custom",
      key: "json_ld_sitewide",
      type: "json",
      value: JSON.stringify(schemas),
    });
    revalidatePath("/optimize/json-ld");
    return {
      ok: true,
      message: `Saved ${schemas.length} site-wide schema(s) to shop metafield`,
      processed: schemas.length,
      saved: schemas.length,
      failed: 0,
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

export async function searchProductsForPicker(
  q: string,
): Promise<Array<{ id: string; title: string; handle: string }>> {
  return searchResources("product", q);
}

export async function searchCollectionsForPicker(
  q: string,
): Promise<Array<{ id: string; title: string; handle: string }>> {
  return searchResources("collection", q);
}

async function searchResources(type: string, q: string) {
  if (q.length < 2) return [];
  const rows = await prisma.resource.findMany({
    where: {
      type,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { handle: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 15,
    orderBy: { title: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    handle: r.handle ?? "",
  }));
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

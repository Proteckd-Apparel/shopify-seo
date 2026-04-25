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
import {
  buildProductTypeToCollectionMap,
  resolvePrimaryCollection,
} from "@/lib/primary-collection";
import { ensureJsonMetafieldDefinition, setMetafield } from "@/lib/shopify-metafields";
import type { JsonLdConfig } from "@/lib/json-ld-config";
import { clearJsonLd, setJsonLd } from "@/lib/shopify-metafields";
import {
  debugReviewsApi,
  fetchReviewsForHandle,
  fetchReviewsBatch,
  type ReviewsDebugReport,
} from "@/lib/proteckd-reviews";

// Diagnostic for the products tab "Test Reviews" button. Takes a resource
// id, looks up the product handle, and pings the reviews API for raw
// summary + by-handle responses so the user can see what the server returns.
export async function debugReviewsForResource(
  resourceId: string,
): Promise<ReviewsDebugReport> {
  const r = await prisma.resource.findUnique({
    where: { id: resourceId },
    select: { handle: true },
  });
  if (!r?.handle) {
    return {
      ok: false,
      message: "Resource has no handle",
      handle: "",
    };
  }
  return debugReviewsApi(r.handle);
}
import type { RealReviews } from "@/lib/json-ld-generators";
import { finishJob, setProgress, startJob } from "@/lib/bulk-job";
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

// Shopify returns INVALID_VALUE "Owner does not exist" when a metafield write
// targets a product/collection/article GID Shopify no longer has. The local
// Resource row is a stale cache from a previous scan — the right move is to
// drop it from our DB and treat it as skipped, not a failure.
function isStaleOwnerError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /Owner does not exist/i.test(msg);
}

// Best-effort prune of a stale local Resource row. Image rows cascade via the
// schema's onDelete. If this fails (e.g. concurrent delete), swallow it —
// the next scan will reconcile.
async function pruneStaleResource(id: string): Promise<void> {
  try {
    await prisma.resource.delete({ where: { id } });
  } catch {}
}

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
    // Best-effort lookup against the self-hosted reviews API; null if not
    // configured, no published reviews, or the call fails.
    let reviews: RealReviews | null = null;
    try {
      const agg = r.handle ? await fetchReviewsForHandle(r.handle) : null;
      if (agg) {
        reviews = {
          rating: agg.rating,
          count: agg.count,
          reviews: agg.reviews.map((rv) => ({
            rating: rv.rating,
            title: rv.title,
            body: rv.body,
            reviewer: rv.reviewer,
            date: rv.date,
          })),
        };
      }
    } catch {}
    const collectionMap = await buildProductTypeToCollectionMap();
    const primaryCollection = resolvePrimaryCollection(
      r.productType,
      collectionMap,
    );
    const schema = generateProductSchema(
      r,
      cfg.jsonLd.products,
      shop,
      reviews,
      cfg.jsonLd.other.breadcrumb,
      undefined,
      primaryCollection,
    );
    await setJsonLd(r.id, schema);
    return {
      ok: true,
      message: reviews
        ? `Applied with ${reviews.count} real reviews`
        : "Applied (no published reviews for this product)",
      processed: 1,
      saved: 1,
      failed: 0,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function applyProductSchemaToAll(): Promise<ApplyResult> {
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
  const job = await startJob("json_ld_products", products.length);
  try {
    // Pre-fetch reviews in batch so the per-product loop below doesn't
    // serialize on the network. Keyed by product handle (the reviews API
    // tracks reviews per handle, not Shopify GID).
    const reviewMap = new Map<
      string,
      Awaited<ReturnType<typeof fetchReviewsForHandle>>
    >();
    try {
      const handles = products
        .map((p) => p.handle)
        .filter((h): h is string => !!h);
      const batch = await fetchReviewsBatch(handles);
      for (const [k, v] of batch) reviewMap.set(k, v);
    } catch {}
    const collectionMap = await buildProductTypeToCollectionMap();
    let saved = 0;
    let failed = 0;
    let staleSkipped = 0;
    const sampleErrors: string[] = [];
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      try {
        const agg = p.handle ? reviewMap.get(p.handle) : null;
        const reviews: RealReviews | null = agg
          ? {
              rating: agg.rating,
              count: agg.count,
              reviews: agg.reviews.map((rv) => ({
                rating: rv.rating,
                title: rv.title,
                body: rv.body,
                reviewer: rv.reviewer,
                date: rv.date,
              })),
            }
          : null;
        const primaryCollection = resolvePrimaryCollection(
          p.productType,
          collectionMap,
        );
        const schema = generateProductSchema(
          p,
          cfg.jsonLd.products,
          shop,
          reviews,
          cfg.jsonLd.other.breadcrumb,
          undefined,
          primaryCollection,
        );
        await setJsonLd(p.id, schema);
        saved++;
      } catch (e) {
        if (isStaleOwnerError(e)) {
          staleSkipped++;
          await pruneStaleResource(p.id);
          console.warn(
            `[json-ld products] pruned stale ${p.handle ?? p.id} (no longer in Shopify)`,
          );
        } else {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[json-ld products] ${p.handle ?? p.id}: ${msg}`);
          if (sampleErrors.length < 3) {
            sampleErrors.push(`${p.handle ?? p.id}: ${msg}`);
          }
        }
      }
      await setProgress(job.id, i + 1);
    }
    const errorSummary = failed > 0
      ? `${failed} failed. First: ${sampleErrors.join(" | ")}`
      : undefined;
    await finishJob(job.id, { ok: failed === 0, error: errorSummary });
    revalidatePath("/optimize/json-ld");
    const parts = [`Saved ${saved}`];
    if (staleSkipped > 0) parts.push(`pruned ${staleSkipped} stale (deleted in Shopify)`);
    if (failed > 0) parts.push(`failed ${failed}`);
    if (errorSummary) parts.push(errorSummary);
    return {
      ok: failed === 0,
      message: parts.join(", "),
      processed: products.length,
      saved,
      failed,
    };
  } catch (e) {
    await finishJob(job.id, {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    });
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: Collections ----------

export async function applyCollectionSchemaToAll(): Promise<ApplyResult> {
  const cfg = await loadOptimizerConfig();
  const shop = await getShop();
  const collections = await prisma.resource.findMany({
    where: { type: "collection" },
    include: { images: true },
    take: 5000,
  });
  const job = await startJob("json_ld_collections", collections.length);
  try {
    let saved = 0;
    let failed = 0;
    let staleSkipped = 0;
    const sampleErrors: string[] = [];
    for (let i = 0; i < collections.length; i++) {
      const c = collections[i];
      try {
        const schema = generateCollectionSchema(
          c,
          cfg.jsonLd.collections,
          shop,
          cfg.jsonLd.other.breadcrumb,
        );
        await setJsonLd(c.id, schema as Record<string, unknown>);
        saved++;
      } catch (e) {
        if (isStaleOwnerError(e)) {
          staleSkipped++;
          await pruneStaleResource(c.id);
          console.warn(
            `[json-ld collections] pruned stale ${c.handle ?? c.id} (no longer in Shopify)`,
          );
        } else {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[json-ld collections] ${c.handle ?? c.id}: ${msg}`);
          if (sampleErrors.length < 3) {
            sampleErrors.push(`${c.handle ?? c.id}: ${msg}`);
          }
        }
      }
      await setProgress(job.id, i + 1);
    }
    const errorSummary = failed > 0
      ? `${failed} failed. First: ${sampleErrors.join(" | ")}`
      : undefined;
    await finishJob(job.id, { ok: failed === 0, error: errorSummary });
    revalidatePath("/optimize/json-ld");
    const parts = [`Saved ${saved}`];
    if (staleSkipped > 0) parts.push(`pruned ${staleSkipped} stale (deleted in Shopify)`);
    if (failed > 0) parts.push(`failed ${failed}`);
    if (errorSummary) parts.push(errorSummary);
    return {
      ok: failed === 0,
      message: parts.join(", "),
      processed: collections.length,
      saved,
      failed,
    };
  } catch (e) {
    await finishJob(job.id, {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    });
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
      const agg = r.handle ? await fetchReviewsForHandle(r.handle) : null;
      if (agg) {
        reviews = {
          rating: agg.rating,
          count: agg.count,
          reviews: agg.reviews.map((rv) => ({
            rating: rv.rating,
            title: rv.title,
            body: rv.body,
            reviewer: rv.reviewer,
            date: rv.date,
          })),
        };
      }
    } catch {}
    const collectionMap = await buildProductTypeToCollectionMap();
    const primaryCollection = resolvePrimaryCollection(
      r.productType,
      collectionMap,
    );
    const schema = generateProductSchema(
      r,
      cfg.jsonLd.products,
      shop,
      reviews,
      cfg.jsonLd.other.breadcrumb,
      undefined,
      primaryCollection,
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

// Parses blog handle out of a Resource.raw JSON blob the scanner saved.
// Returns null if the article has no blog reference (shouldn't happen for
// articles, but we defend against bad data).
function blogHandleOf(rawJson: string | null | undefined): string | null {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(rawJson);
    const handle = parsed?.blog?.handle;
    return typeof handle === "string" && handle ? handle : null;
  } catch {
    return null;
  }
}

// Detects whether an article's body already contains its own JSON-LD script
// (as the autoblog emits for posts it generated going forward). Articles
// that DO have inline schema should not get duplicate schema from this app;
// articles that DON'T still need our coverage even if they sit in a blog
// the user marked as "autoblog-owned", because the autoblog isn't going back
// to retrofit older posts.
function hasInlineJsonLd(bodyHtml: string | null | undefined): boolean {
  if (!bodyHtml) return false;
  // Case-insensitive, whitespace-tolerant match on the JSON-LD script open tag.
  return /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>/i.test(
    bodyHtml,
  );
}

export async function applyArticleSchemaToAll(): Promise<ApplyResult> {
  const cfg = await loadOptimizerConfig();
  const shop = await getShop();
  const articles = await prisma.resource.findMany({
    where: { type: "article" },
    include: { images: true },
    take: 5000,
  });
  // Excluded blog handles are where another tool may own the schema. Within
  // those blogs we still emit our schema unless the article's body already
  // has inline JSON-LD (which means the other tool already handled it).
  const exclusions = new Set(
    (cfg.jsonLd.other.articleBlogExclusions ?? []).map((h) => h.toLowerCase()),
  );
  const job = await startJob("json_ld_articles", articles.length);
  try {
    let saved = 0;
    let cleared = 0;
    let coveredOld = 0;
    let failed = 0;
    let staleSkipped = 0;
    const sampleErrors: string[] = [];
    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      const handle = blogHandleOf(a.raw)?.toLowerCase();
      const inExcludedBlog =
        handle !== null && handle !== undefined && exclusions.has(handle);
      const hasOwnSchema = hasInlineJsonLd(a.bodyHtml);
      try {
        if (inExcludedBlog && hasOwnSchema) {
          // Autoblog-owned blog AND article already emits its own schema →
          // clear ours so it isn't double-posted.
          await clearJsonLd(a.id);
          cleared++;
        } else {
          // Either the blog isn't excluded, or it's excluded but the article
          // is an older post without inline schema. Either way, write ours
          // so the page has coverage.
          const article = generateArticleSchema(a, shop);
          const out = cfg.jsonLd.other.breadcrumb
            ? [article, buildBreadcrumbForResource(a, shop)]
            : article;
          await setJsonLd(a.id, out as Record<string, unknown>);
          if (inExcludedBlog) coveredOld++;
          else saved++;
        }
      } catch (e) {
        if (isStaleOwnerError(e)) {
          staleSkipped++;
          await pruneStaleResource(a.id);
          console.warn(
            `[json-ld articles] pruned stale ${a.handle ?? a.id} (no longer in Shopify)`,
          );
        } else {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[json-ld articles] ${a.handle ?? a.id}: ${msg}`);
          if (sampleErrors.length < 3) {
            sampleErrors.push(`${a.handle ?? a.id}: ${msg}`);
          }
        }
      }
      await setProgress(job.id, i + 1);
    }
    const errorSummary = failed > 0
      ? `${failed} failed. First: ${sampleErrors.join(" | ")}`
      : undefined;
    await finishJob(job.id, { ok: failed === 0, error: errorSummary });
    revalidatePath("/optimize/json-ld");
    const parts = [`Saved ${saved}`];
    if (coveredOld > 0) parts.push(`covered ${coveredOld} older posts in excluded blogs`);
    if (cleared > 0) parts.push(`cleared ${cleared}`);
    if (staleSkipped > 0) parts.push(`pruned ${staleSkipped} stale (deleted in Shopify)`);
    if (failed > 0) parts.push(`failed ${failed}`);
    if (errorSummary) parts.push(errorSummary);
    return {
      ok: failed === 0,
      message: parts.join(", "),
      processed: articles.length,
      saved,
      failed,
    };
  } catch (e) {
    await finishJob(job.id, {
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    });
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// Returns the distinct blog handles found across all scanned articles, with
// an article count per blog. Powers the "exclude blogs from schema" UI so
// the user can see exactly which blogs exist without typing handles by hand.
export async function listArticleBlogHandles(): Promise<
  Array<{ handle: string; count: number }>
> {
  const articles = await prisma.resource.findMany({
    where: { type: "article" },
    select: { raw: true },
    take: 5000,
  });
  const counts = new Map<string, number>();
  for (const a of articles) {
    const h = blogHandleOf(a.raw);
    if (!h) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([handle, count]) => ({ handle, count }))
    .sort((a, b) => a.handle.localeCompare(b.handle));
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

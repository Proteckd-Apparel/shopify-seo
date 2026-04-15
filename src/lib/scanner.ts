// The scanner: pulls every resource from Shopify into the local DB, then
// runs a set of pure-function rules over each resource to detect issues.
//
// Designed to be re-run safely. Existing rows are upserted, old issues are
// wiped at the start of each scan, and the run is recorded as a ScanRun.

import { prisma } from "./prisma";
import {
  fetchAllArticles,
  fetchAllCollections,
  fetchAllPages,
  fetchAllProducts,
  type ShopifyArticle,
  type ShopifyCollection,
  type ShopifyImage,
  type ShopifyPage,
  type ShopifyProduct,
} from "./shopify-fetch";
import { getShopifyCreds, shopifyGraphQL, shopInfo } from "./shopify";
import { setProgress, setTotal } from "./bulk-job";

// Fast upfront count for products + collections. Used by the scan progress
// bar so the bar has a real denominator from the first poll. Pages and
// articles aren't GraphQL-countable in the Admin API so they get bumped into
// the total as each phase starts.
async function countProductsAndCollections(): Promise<number> {
  try {
    const data = await shopifyGraphQL<{
      productsCount: { count: number } | null;
      collectionsCount: { count: number } | null;
    }>(
      /* GraphQL */ `
        query ScanCounts {
          productsCount { count }
          collectionsCount { count }
        }
      `,
    );
    const p = data.productsCount?.count ?? 0;
    const c = data.collectionsCount?.count ?? 0;
    return p + c;
  } catch {
    return 0;
  }
}

type IssueDraft = {
  resourceId: string | null;
  category: string;
  severity: "info" | "warn" | "error";
  message: string;
  url?: string | null;
};

const META_TITLE_MIN = 25;
const META_TITLE_MAX = 60;
const META_DESC_MIN = 70;
const META_DESC_MAX = 160;
const MIN_IMAGE_WIDTH = 800;

function checkMetaTitle(
  resourceId: string,
  url: string | null,
  fallbackTitle: string,
  seoTitle: string | null,
): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const t = (seoTitle ?? "").trim();
  if (!t) {
    issues.push({
      resourceId,
      category: "meta_title",
      severity: "error",
      message: `Missing SEO title (defaults to "${fallbackTitle}")`,
      url,
    });
    return issues;
  }
  if (t.length < META_TITLE_MIN) {
    issues.push({
      resourceId,
      category: "meta_title",
      severity: "warn",
      message: `SEO title is short (${t.length} chars, target ${META_TITLE_MIN}-${META_TITLE_MAX})`,
      url,
    });
  } else if (t.length > META_TITLE_MAX) {
    issues.push({
      resourceId,
      category: "meta_title",
      severity: "warn",
      message: `SEO title is long (${t.length} chars, target ${META_TITLE_MIN}-${META_TITLE_MAX})`,
      url,
    });
  }
  return issues;
}

function checkMetaDescription(
  resourceId: string,
  url: string | null,
  seoDescription: string | null,
): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const d = (seoDescription ?? "").trim();
  if (!d) {
    issues.push({
      resourceId,
      category: "meta_description",
      severity: "error",
      message: "Missing meta description",
      url,
    });
    return issues;
  }
  if (d.length < META_DESC_MIN) {
    issues.push({
      resourceId,
      category: "meta_description",
      severity: "warn",
      message: `Meta description is short (${d.length} chars, target ${META_DESC_MIN}-${META_DESC_MAX})`,
      url,
    });
  } else if (d.length > META_DESC_MAX) {
    issues.push({
      resourceId,
      category: "meta_description",
      severity: "warn",
      message: `Meta description is long (${d.length} chars, target ${META_DESC_MIN}-${META_DESC_MAX})`,
      url,
    });
  }
  return issues;
}

function checkImages(
  resourceId: string,
  url: string | null,
  images: ShopifyImage[],
): IssueDraft[] {
  const issues: IssueDraft[] = [];
  for (const img of images) {
    if (!img.altText || img.altText.trim() === "") {
      issues.push({
        resourceId,
        category: "alt_text",
        severity: "warn",
        message: `Image missing alt text: ${img.url}`,
        url,
      });
    }
    if (img.width && img.width < MIN_IMAGE_WIDTH) {
      issues.push({
        resourceId,
        category: "image_size",
        severity: "info",
        message: `Low-resolution image (${img.width}px wide): ${img.url}`,
        url,
      });
    }
  }
  return issues;
}

function checkBody(
  resourceId: string,
  url: string | null,
  bodyHtml: string | null,
  kind: string,
): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const text = (bodyHtml ?? "").replace(/<[^>]+>/g, " ").trim();
  if (text.length < 120) {
    issues.push({
      resourceId,
      category: "thin_content",
      severity: text.length === 0 ? "error" : "warn",
      message: `${kind} has thin content (${text.length} chars)`,
      url,
    });
  }
  return issues;
}

// ---------- Public scan API ----------

export type ScanProgress = {
  phase: string;
  totalPages: number;
  totalIssues: number;
};

export type ScanResult = {
  scanId: string;
  totalPages: number;
  totalIssues: number;
  durationMs: number;
};

export async function runScan(
  onProgress?: (p: ScanProgress) => void,
  jobId?: string,
): Promise<ScanResult> {
  // Validate credentials up front so we fail fast.
  const creds = await getShopifyCreds();
  if (!creds)
    throw new Error(
      "Shopify credentials not configured — visit /settings first.",
    );
  await shopInfo(creds); // throws on bad token

  // Seed the progress bar with a real denominator before the first poll.
  // Pages and articles get added to the total as those phases begin.
  let jobTotal = 0;
  if (jobId) {
    jobTotal = await countProductsAndCollections();
    if (jobTotal > 0) await setTotal(jobId, jobTotal);
  }

  const scan = await prisma.scanRun.create({
    data: { status: "running" },
  });
  const start = Date.now();
  let totalPages = 0;
  let totalIssues = 0;
  const log: string[] = [];

  async function reportProgress() {
    if (!jobId) return;
    try {
      await setProgress(jobId, totalPages);
    } catch {
      // Progress updates are best-effort — a failure here shouldn't abort
      // the whole scan.
    }
  }

  function pushLog(line: string) {
    log.push(`[${new Date().toISOString()}] ${line}`);
  }

  async function persistResource(args: {
    id: string;
    type: string;
    handle: string | null;
    title: string | null;
    url: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    bodyHtml: string | null;
    vendor?: string | null;
    productType?: string | null;
    tags?: string[] | null;
    status?: string | null;
    raw: unknown;
  }) {
    await prisma.resource.upsert({
      where: { id: args.id },
      create: {
        id: args.id,
        type: args.type,
        handle: args.handle,
        title: args.title,
        url: args.url,
        seoTitle: args.seoTitle,
        seoDescription: args.seoDescription,
        bodyHtml: args.bodyHtml,
        vendor: args.vendor ?? null,
        productType: args.productType ?? null,
        tags: args.tags?.join(",") ?? null,
        status: args.status ?? null,
        raw: JSON.stringify(args.raw),
      },
      update: {
        type: args.type,
        handle: args.handle,
        title: args.title,
        url: args.url,
        seoTitle: args.seoTitle,
        seoDescription: args.seoDescription,
        bodyHtml: args.bodyHtml,
        vendor: args.vendor ?? null,
        productType: args.productType ?? null,
        tags: args.tags?.join(",") ?? null,
        status: args.status ?? null,
        raw: JSON.stringify(args.raw),
      },
    });
  }

  async function persistImages(resourceId: string, images: ShopifyImage[]) {
    // Wipe images for this resource, then upsert each one. Upsert is needed
    // because Shopify allows the same image id to appear on multiple resources.
    await prisma.image.deleteMany({ where: { resourceId } });
    for (const img of images) {
      await prisma.image.upsert({
        where: { id: img.id },
        create: {
          id: img.id,
          resourceId,
          src: img.url,
          altText: img.altText,
          width: img.width ?? null,
          height: img.height ?? null,
        },
        update: {
          resourceId,
          src: img.url,
          altText: img.altText,
          width: img.width ?? null,
          height: img.height ?? null,
        },
      });
    }
  }

  async function persistIssues(drafts: IssueDraft[]) {
    if (drafts.length === 0) return;
    await prisma.issue.createMany({
      data: drafts.map((d) => ({
        scanId: scan.id,
        resourceId: d.resourceId,
        category: d.category,
        severity: d.severity,
        message: d.message,
        url: d.url ?? null,
      })),
    });
    totalIssues += drafts.length;
  }

  // Wipe issues from prior runs (we keep ScanRun history but issues are
  // "current state" — easier to reason about for the UI).
  await prisma.issue.deleteMany({ where: { scan: { id: { not: scan.id } } } });

  async function safePhase(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      pushLog(`Phase ${name} FAILED: ${msg}`);
    }
  }

  // ---------- Products ----------
  await safePhase("products", async () => {
  pushLog("Scanning products...");
  onProgress?.({ phase: "products", totalPages, totalIssues });
  for await (const batch of fetchAllProducts()) {
    for (const p of batch as ShopifyProduct[]) {
      const url = p.onlineStoreUrl;
      await persistResource({
        id: p.id,
        type: "product",
        handle: p.handle,
        title: p.title,
        url,
        seoTitle: p.seo?.title ?? null,
        seoDescription: p.seo?.description ?? null,
        bodyHtml: p.descriptionHtml,
        vendor: p.vendor,
        productType: p.productType,
        tags: p.tags,
        status: p.status?.toLowerCase() ?? null,
        raw: p,
      });
      await persistImages(p.id, p.images);

      const issues: IssueDraft[] = [
        ...checkMetaTitle(p.id, url, p.title, p.seo?.title ?? null),
        ...checkMetaDescription(p.id, url, p.seo?.description ?? null),
        ...checkImages(p.id, url, p.images),
        ...checkBody(p.id, url, p.descriptionHtml, "Product"),
      ];
      await persistIssues(issues);
      totalPages++;
    }
    onProgress?.({ phase: "products", totalPages, totalIssues });
    await reportProgress();
  }
  });

  // ---------- Collections ----------
  await safePhase("collections", async () => {
  pushLog("Scanning collections...");
  onProgress?.({ phase: "collections", totalPages, totalIssues });
  for await (const batch of fetchAllCollections()) {
    for (const c of batch as ShopifyCollection[]) {
      const url = `/collections/${c.handle}`;
      await persistResource({
        id: c.id,
        type: "collection",
        handle: c.handle,
        title: c.title,
        url,
        seoTitle: c.seo?.title ?? null,
        seoDescription: c.seo?.description ?? null,
        bodyHtml: c.descriptionHtml,
        raw: c,
      });
      await persistImages(c.id, c.image ? [c.image] : []);

      const issues: IssueDraft[] = [
        ...checkMetaTitle(c.id, url, c.title, c.seo?.title ?? null),
        ...checkMetaDescription(c.id, url, c.seo?.description ?? null),
        ...checkImages(c.id, url, c.image ? [c.image] : []),
        ...checkBody(c.id, url, c.descriptionHtml, "Collection"),
      ];
      await persistIssues(issues);
      totalPages++;
    }
    onProgress?.({ phase: "collections", totalPages, totalIssues });
    await reportProgress();
  }
  });

  // ---------- Pages ----------
  await safePhase("pages", async () => {
  pushLog("Scanning pages...");
  onProgress?.({ phase: "pages", totalPages, totalIssues });
  for await (const batch of fetchAllPages()) {
    for (const pg of batch as ShopifyPage[]) {
      await persistResource({
        id: pg.id,
        type: "page",
        handle: pg.handle,
        title: pg.title,
        url: null,
        seoTitle: null,
        seoDescription: null,
        bodyHtml: pg.body,
        status: pg.isPublished ? "published" : "draft",
        raw: pg,
      });
      await persistImages(pg.id, []);

      const issues: IssueDraft[] = [
        ...checkMetaTitle(pg.id, null, pg.title, pg.title),
        ...checkBody(pg.id, null, pg.body, "Page"),
      ];
      await persistIssues(issues);
      totalPages++;
      // Pages weren't counted upfront; expand the total as we discover them
      // so the bar stays sensible.
      if (jobId && totalPages > jobTotal) {
        jobTotal = totalPages;
        await setTotal(jobId, jobTotal);
      }
    }
    onProgress?.({ phase: "pages", totalPages, totalIssues });
    await reportProgress();
  }
  });

  // ---------- Articles ----------
  await safePhase("articles", async () => {
  pushLog("Scanning articles...");
  onProgress?.({ phase: "articles", totalPages, totalIssues });
  for await (const batch of fetchAllArticles()) {
    for (const a of batch as ShopifyArticle[]) {
      await persistResource({
        id: a.id,
        type: "article",
        handle: a.handle,
        title: a.title,
        url: null,
        seoTitle: null,
        seoDescription: null,
        bodyHtml: a.body,
        status: a.isPublished ? "published" : "draft",
        raw: a,
      });
      await persistImages(a.id, a.image ? [a.image] : []);

      const issues: IssueDraft[] = [
        ...checkMetaTitle(a.id, null, a.title, a.title),
        ...checkImages(a.id, null, a.image ? [a.image] : []),
        ...checkBody(a.id, null, a.body, "Article"),
      ];
      await persistIssues(issues);
      totalPages++;
      if (jobId && totalPages > jobTotal) {
        jobTotal = totalPages;
        await setTotal(jobId, jobTotal);
      }
    }
    onProgress?.({ phase: "articles", totalPages, totalIssues });
    await reportProgress();
  }
  });

  pushLog(`Scan complete: ${totalPages} pages, ${totalIssues} issues.`);
  await prisma.scanRun.update({
    where: { id: scan.id },
    data: {
      status: "done",
      finishedAt: new Date(),
      totalPages,
      totalIssues,
      log: log.join("\n"),
    },
  });

  return {
    scanId: scan.id,
    totalPages,
    totalIssues,
    durationMs: Date.now() - start,
  };
}

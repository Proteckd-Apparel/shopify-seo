// Recovery for image URLs that 404 inside article/page/product body HTML.
//
// Why this exists: when a Shopify file is replaced (new bytes uploaded,
// old File deleted), Shopify generates a brand-new CDN URL for the new
// file. Any HTML body that hardcoded the OLD URL now serves a 404. We
// can't restore the old URL — that bucket object is gone — but the bytes
// are usually still in the store at a NEW URL with a similar filename.
// This module finds broken references and lets the caller rewrite the
// HTML to the matched new URL.

import { shopifyGraphQL } from "./shopify";
import { listImageFiles, type ImageFileRow } from "./shopify-files";

export type ResourceKind = "article" | "page" | "product";

export type ResourceBody = {
  id: string;
  type: ResourceKind;
  title: string;
  handle: string;
  body: string;
};

export type FileCandidate = {
  id: string;
  url: string;
  filename: string;
  size: number;
};

export type BrokenRef = {
  resourceId: string;
  resourceType: ResourceKind;
  resourceTitle: string;
  resourceHandle: string;
  oldUrl: string;
  oldBasename: string;
  prefix: string;
  candidates: FileCandidate[];
};

const CDN_IMG_REGEX =
  /https?:\/\/cdn\.shopify\.com\/[^\s"'<>)]+?\.(?:jpg|jpeg|png|webp|gif|svg)(?:\?[^\s"'<>)]*)?/gi;

function extractCdnImageUrls(html: string | null | undefined): string[] {
  if (!html) return [];
  return Array.from(new Set(html.match(CDN_IMG_REGEX) ?? []));
}

function basenameNoExt(url: string): string {
  const path = url.split("?")[0];
  const last = path.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(0, dot) : last;
}

// "Human prefix" is whatever remains after stripping trailing UUID-ish
// suffixes Shopify appends. Used to match an old broken filename to a
// surviving new file with the same prefix.
//
//   "02_385703af-b814-4b69-9e1d-624d02a58137" -> "02"
//   "womens_beanie_black_4"                    -> "womens_beanie_black_4"
//   "male_wearing_faraday_t_shirt_5_487f-b9ba-2818d0a9175f"
//        -> "male_wearing_faraday_t_shirt_5"
const TRAILING_HEX_SUFFIX = /_[a-f0-9]{4,}(?:-[a-f0-9]{2,}){0,5}$/i;
function humanPrefix(basename: string): string {
  let p = basename;
  // Strip up to 3 trailing hex/uuid groups so things like name_uuid1_uuid2 collapse.
  for (let i = 0; i < 3; i++) {
    const next = p.replace(TRAILING_HEX_SUFFIX, "");
    if (next === p) break;
    p = next;
  }
  return p.replace(/_+$/, "");
}

function stripCdnQuery(url: string): string {
  return url.split("?")[0];
}

async function pmap<T, U>(
  items: T[],
  concurrency: number,
  fn: (t: T) => Promise<U>,
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  );
  await Promise.all(workers);
  return out;
}

async function isUrlAlive(url: string, timeoutMs = 8000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

const ARTICLES_QUERY = /* GraphQL */ `
  query ArticlesForRecovery($cursor: String) {
    articles(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle body }
    }
  }
`;

const PAGES_QUERY = /* GraphQL */ `
  query PagesForRecovery($cursor: String) {
    pages(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle body }
    }
  }
`;

const PRODUCTS_QUERY = /* GraphQL */ `
  query ProductsForRecovery($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id title handle descriptionHtml }
    }
  }
`;

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type BodyNode = {
  id: string;
  title: string;
  handle: string;
  body: string | null;
};
type ProductNode = {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string | null;
};
type ArticlesPage = { articles: { pageInfo: PageInfo; nodes: BodyNode[] } };
type PagesPage = { pages: { pageInfo: PageInfo; nodes: BodyNode[] } };
type ProductsPage = {
  products: { pageInfo: PageInfo; nodes: ProductNode[] };
};

async function listArticleBodies(): Promise<ResourceBody[]> {
  const out: ResourceBody[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: ArticlesPage = await shopifyGraphQL<ArticlesPage>(
      ARTICLES_QUERY,
      { cursor },
    );
    for (const n of data.articles.nodes) {
      out.push({
        id: n.id,
        type: "article",
        title: n.title,
        handle: n.handle,
        body: n.body ?? "",
      });
    }
    if (!data.articles.pageInfo.hasNextPage) break;
    cursor = data.articles.pageInfo.endCursor;
    if (!cursor) break;
  }
  return out;
}

async function listPageBodies(): Promise<ResourceBody[]> {
  const out: ResourceBody[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: PagesPage = await shopifyGraphQL<PagesPage>(PAGES_QUERY, {
      cursor,
    });
    for (const n of data.pages.nodes) {
      out.push({
        id: n.id,
        type: "page",
        title: n.title,
        handle: n.handle,
        body: n.body ?? "",
      });
    }
    if (!data.pages.pageInfo.hasNextPage) break;
    cursor = data.pages.pageInfo.endCursor;
    if (!cursor) break;
  }
  return out;
}

async function listProductBodies(): Promise<ResourceBody[]> {
  const out: ResourceBody[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: ProductsPage = await shopifyGraphQL<ProductsPage>(
      PRODUCTS_QUERY,
      { cursor },
    );
    for (const n of data.products.nodes) {
      out.push({
        id: n.id,
        type: "product",
        title: n.title,
        handle: n.handle,
        body: n.descriptionHtml ?? "",
      });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    if (!cursor) break;
  }
  return out;
}

export type ScanReport = {
  scanned: { articles: number; pages: number; products: number };
  candidateUrlCount: number;
  brokenRefCount: number;
  broken: BrokenRef[];
};

export async function scanForBrokenImageRefs(): Promise<ScanReport> {
  // 1. Build the candidate pool from current Files. listImageFiles caps
  //    at 250 by default; bump well above to capture every candidate.
  const currentFiles = await listImageFiles(2000);
  const indexByPrefix = new Map<string, ImageFileRow[]>();
  for (const f of currentFiles) {
    const prefix = humanPrefix(basenameNoExt(f.url));
    if (!prefix) continue;
    const list = indexByPrefix.get(prefix);
    if (list) list.push(f);
    else indexByPrefix.set(prefix, [f]);
  }

  // 2. Pull every body HTML in parallel.
  const [articles, pages, products] = await Promise.all([
    listArticleBodies(),
    listPageBodies(),
    listProductBodies(),
  ]);
  const all = [...articles, ...pages, ...products];

  // 3. Extract every CDN image URL from every body. Track which resource
  //    each URL came from so we can attribute breakage back later.
  type Pending = { resource: ResourceBody; url: string };
  const pending: Pending[] = [];
  for (const r of all) {
    for (const url of extractCdnImageUrls(r.body)) {
      pending.push({ resource: r, url });
    }
  }

  // 4. HEAD-check unique URLs only. A single broken URL referenced from
  //    five articles only needs one network probe.
  const uniqueUrls = Array.from(new Set(pending.map((p) => p.url)));
  const aliveResults = await pmap(uniqueUrls, 12, async (url) => ({
    url,
    alive: await isUrlAlive(url),
  }));
  const aliveByUrl = new Map(aliveResults.map((r) => [r.url, r.alive]));

  // 5. For each (resource, brokenUrl) pair, compute candidates by
  //    matching the human prefix against the current Files index.
  const broken: BrokenRef[] = [];
  const seen = new Set<string>();
  for (const p of pending) {
    if (aliveByUrl.get(p.url)) continue;
    const dedupKey = `${p.resource.id}::${stripCdnQuery(p.url)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const oldBase = basenameNoExt(p.url);
    const prefix = humanPrefix(oldBase);
    const candidates = indexByPrefix.get(prefix) ?? [];
    broken.push({
      resourceId: p.resource.id,
      resourceType: p.resource.type,
      resourceTitle: p.resource.title,
      resourceHandle: p.resource.handle,
      oldUrl: p.url,
      oldBasename: oldBase,
      prefix,
      candidates: candidates.map((c) => ({
        id: c.id,
        url: c.url,
        filename: c.filename,
        size: c.size,
      })),
    });
  }

  return {
    scanned: {
      articles: articles.length,
      pages: pages.length,
      products: products.length,
    },
    candidateUrlCount: uniqueUrls.length,
    brokenRefCount: broken.length,
    broken,
  };
}

// ---------- Apply phase ----------

export type Fix = {
  resourceId: string;
  resourceType: ResourceKind;
  oldUrl: string;
  newUrl: string;
};

const ARTICLE_BODY_QUERY = /* GraphQL */ `
  query ArticleBody($id: ID!) {
    article(id: $id) {
      id
      body
    }
  }
`;

const PAGE_BODY_QUERY = /* GraphQL */ `
  query PageBody($id: ID!) {
    page(id: $id) {
      id
      body
    }
  }
`;

const PRODUCT_BODY_QUERY = /* GraphQL */ `
  query ProductBody($id: ID!) {
    product(id: $id) {
      id
      descriptionHtml
    }
  }
`;

const ARTICLE_UPDATE_BODY = /* GraphQL */ `
  mutation ArticleUpdateBody($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id }
      userErrors { field message }
    }
  }
`;

const PAGE_UPDATE_BODY = /* GraphQL */ `
  mutation PageUpdateBody($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE_BODY = /* GraphQL */ `
  mutation ProductUpdateBody($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

type UserError = { field: string[] | null; message: string };

function throwOnUserErrors(errors: UserError[] | undefined, op: string) {
  if (errors && errors.length > 0) {
    throw new Error(`${op}: ${errors.map((e) => e.message).join("; ")}`);
  }
}

// Replace every occurrence of the old URL in the body with the new one.
// We replace the bare URL (without query string) so query-versioned
// variants like ?v=12345 also rewrite correctly.
function rewriteBody(body: string, oldUrl: string, newUrl: string): {
  next: string;
  occurrences: number;
} {
  const bareOld = stripCdnQuery(oldUrl);
  const bareNew = stripCdnQuery(newUrl);
  // Escape regex specials in the URL.
  const re = new RegExp(
    bareOld.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "g",
  );
  let count = 0;
  const next = body.replace(re, () => {
    count++;
    return bareNew;
  });
  return { next, occurrences: count };
}

export type ApplyReport = {
  ok: boolean;
  resourcesUpdated: number;
  fixesApplied: number;
  failed: number;
  errors: string[];
};

export async function applyImageRecoveryFixes(
  fixes: Fix[],
): Promise<ApplyReport> {
  const groups = new Map<string, { type: ResourceKind; fixes: Fix[] }>();
  for (const f of fixes) {
    const key = `${f.resourceType}:${f.resourceId}`;
    const g = groups.get(key);
    if (g) g.fixes.push(f);
    else groups.set(key, { type: f.resourceType, fixes: [f] });
  }

  let resourcesUpdated = 0;
  let fixesApplied = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const [key, { type, fixes: groupFixes }] of groups) {
    const id = key.slice(key.indexOf(":") + 1);
    try {
      let body: string;
      if (type === "article") {
        const r = await shopifyGraphQL<{
          article: { id: string; body: string | null } | null;
        }>(ARTICLE_BODY_QUERY, { id });
        if (!r.article) throw new Error("article not found");
        body = r.article.body ?? "";
      } else if (type === "page") {
        const r = await shopifyGraphQL<{
          page: { id: string; body: string | null } | null;
        }>(PAGE_BODY_QUERY, { id });
        if (!r.page) throw new Error("page not found");
        body = r.page.body ?? "";
      } else {
        const r = await shopifyGraphQL<{
          product: { id: string; descriptionHtml: string | null } | null;
        }>(PRODUCT_BODY_QUERY, { id });
        if (!r.product) throw new Error("product not found");
        body = r.product.descriptionHtml ?? "";
      }

      let totalOccurrences = 0;
      for (const f of groupFixes) {
        const { next, occurrences } = rewriteBody(body, f.oldUrl, f.newUrl);
        body = next;
        totalOccurrences += occurrences;
      }
      if (totalOccurrences === 0) {
        // None of the URLs were actually present anymore (already fixed
        // by a previous run, or query string mismatch). Skip the write.
        continue;
      }

      if (type === "article") {
        const r = await shopifyGraphQL<{
          articleUpdate: {
            article: { id: string } | null;
            userErrors: UserError[];
          };
        }>(ARTICLE_UPDATE_BODY, { id, article: { body } });
        throwOnUserErrors(r.articleUpdate.userErrors, "articleUpdate");
      } else if (type === "page") {
        const r = await shopifyGraphQL<{
          pageUpdate: {
            page: { id: string } | null;
            userErrors: UserError[];
          };
        }>(PAGE_UPDATE_BODY, { id, page: { body } });
        throwOnUserErrors(r.pageUpdate.userErrors, "pageUpdate");
      } else {
        const r = await shopifyGraphQL<{
          productUpdate: {
            product: { id: string } | null;
            userErrors: UserError[];
          };
        }>(PRODUCT_UPDATE_BODY, {
          input: { id, descriptionHtml: body },
        });
        throwOnUserErrors(r.productUpdate.userErrors, "productUpdate");
      }
      resourcesUpdated++;
      fixesApplied += groupFixes.length;
    } catch (e) {
      failed += groupFixes.length;
      errors.push(
        `${key}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    ok: failed === 0,
    resourcesUpdated,
    fixesApplied,
    failed,
    errors,
  };
}

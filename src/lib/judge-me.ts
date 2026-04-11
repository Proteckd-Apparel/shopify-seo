// Judge.me API client. Pulls real product reviews and aggregates so JSON-LD
// can use real ratings instead of fake/random ones.
//
// Auth: shop_domain + api_token. Get the token in Judge.me admin →
// Settings → API. Free Judge.me plans expose the same endpoints.
//
// Public docs: https://judge.me/api/docs
//
// Flow for a single product:
//   1) GET /api/v1/products/-1?external_id={shopify_product_numeric_id}
//        → returns Judge.me's internal product id
//   2) GET /api/v1/reviews?product_id={jm_internal_id}&per_page=N
//        → returns recent reviews
//   3) GET /api/v1/widgets/product_review_aggregate?external_id={external_id}
//        → returns average + count for the storefront badge

import { prisma } from "./prisma";

const BASE = "https://judge.me/api/v1";

export type JudgeMeReview = {
  id: number;
  rating: number;
  title: string | null;
  body: string;
  reviewer: { name: string };
  created_at: string;
};

export type JudgeMeAggregate = {
  rating: number;
  count: number;
  reviews: JudgeMeReview[];
};

async function getCreds(): Promise<{ shopDomain: string; token: string } | null> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.shopDomain || !s?.judgeMeToken) return null;
  return { shopDomain: s.shopDomain, token: s.judgeMeToken };
}

async function jm<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T | null> {
  const creds = await getCreds();
  if (!creds) return null;
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("shop_domain", creds.shopDomain);
  url.searchParams.set("api_token", creds.token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function shopifyIdToExternal(productGid: string): string {
  return productGid.replace("gid://shopify/Product/", "");
}

// Step 1: external Shopify id → Judge.me internal product id
async function lookupJmProductId(
  externalId: string,
): Promise<number | null> {
  const data = await jm<{ product?: { id: number } }>(
    "/products/-1",
    { external_id: externalId },
  );
  return data?.product?.id ?? null;
}

export async function fetchJudgeMeAggregate(
  productGid: string,
  reviewLimit = 5,
): Promise<JudgeMeAggregate | null> {
  const externalId = shopifyIdToExternal(productGid);

  // Aggregate count + average comes from the widget endpoint and uses
  // external_id directly — no internal id lookup needed.
  const summary = await jm<{
    rating?: number;
    count?: number;
    average?: number;
  }>("/widgets/product_review_aggregate", { external_id: externalId });

  const count = summary?.count ?? 0;
  if (!summary || count === 0) return null;

  const avg = summary.average ?? summary.rating ?? 0;

  // Get the JM internal product id so we can pull recent review bodies.
  const jmProductId = await lookupJmProductId(externalId);
  let reviews: JudgeMeReview[] = [];
  if (jmProductId) {
    const list = await jm<{ reviews: JudgeMeReview[] }>("/reviews", {
      product_id: jmProductId,
      per_page: reviewLimit,
      page: 1,
    });
    reviews = list?.reviews ?? [];
  }

  return {
    rating: Math.round(avg * 10) / 10,
    count,
    reviews,
  };
}

export async function fetchJudgeMeBatch(
  productGids: string[],
  concurrency = 5,
): Promise<Map<string, JudgeMeAggregate>> {
  const out = new Map<string, JudgeMeAggregate>();
  const queue = [...productGids];
  async function worker() {
    while (queue.length > 0) {
      const gid = queue.shift();
      if (!gid) return;
      try {
        const agg = await fetchJudgeMeAggregate(gid);
        if (agg) out.set(gid, agg);
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}

// ---------- Diagnostic helpers ----------
//
// Used by the Test Judge.me button to show exactly what the API returns,
// instead of silently swallowing errors.

export type JudgeMeDebugReport = {
  ok: boolean;
  message: string;
  externalId: string;
  rawAggregate?: unknown;
  rawProduct?: unknown;
  rawReviews?: unknown;
};

export async function debugJudgeMe(
  productGid: string,
): Promise<JudgeMeDebugReport> {
  const creds = await getCreds();
  if (!creds) {
    return {
      ok: false,
      message: "Judge.me token not configured (Settings)",
      externalId: shopifyIdToExternal(productGid),
    };
  }
  const externalId = shopifyIdToExternal(productGid);

  let rawAggregate: unknown = null;
  let rawProduct: unknown = null;
  let rawReviews: unknown = null;
  let aggUrl = "";
  let prodUrl = "";
  let reviewsUrl = "";
  try {
    const u1 = new URL(`${BASE}/widgets/product_review_aggregate`);
    u1.searchParams.set("shop_domain", creds.shopDomain);
    u1.searchParams.set("api_token", creds.token);
    u1.searchParams.set("external_id", externalId);
    aggUrl = u1.toString();
    const r1 = await fetch(aggUrl);
    rawAggregate = {
      status: r1.status,
      body: r1.ok ? await r1.json() : await r1.text(),
    };

    const u2 = new URL(`${BASE}/products/-1`);
    u2.searchParams.set("shop_domain", creds.shopDomain);
    u2.searchParams.set("api_token", creds.token);
    u2.searchParams.set("external_id", externalId);
    prodUrl = u2.toString();
    const r2 = await fetch(prodUrl);
    rawProduct = {
      status: r2.status,
      body: r2.ok ? await r2.json() : await r2.text(),
    };

    const productJson =
      r2.ok && (rawProduct as { body?: { product?: { id?: number } } }).body
        ? (rawProduct as { body: { product?: { id?: number } } }).body.product
        : null;
    const jmId = productJson?.id;

    if (jmId) {
      const u3 = new URL(`${BASE}/reviews`);
      u3.searchParams.set("shop_domain", creds.shopDomain);
      u3.searchParams.set("api_token", creds.token);
      u3.searchParams.set("product_id", String(jmId));
      u3.searchParams.set("per_page", "5");
      reviewsUrl = u3.toString();
      const r3 = await fetch(reviewsUrl);
      rawReviews = {
        status: r3.status,
        body: r3.ok ? await r3.json() : await r3.text(),
      };
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "fetch failed",
      externalId,
      rawAggregate,
      rawProduct,
      rawReviews,
    };
  }

  return {
    ok: true,
    message: "Diagnostic complete",
    externalId,
    rawAggregate,
    rawProduct,
    rawReviews,
  };
}

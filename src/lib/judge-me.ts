// Judge.me API client. Pulls real product reviews and aggregates so JSON-LD
// can use real ratings instead of fake/random ones.
//
// Auth: shop_domain + api_token. Get the token in Judge.me admin →
// Settings → API. Free Judge.me plans expose the same endpoints.
//
// Public docs: https://judge.me/api/docs

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

// Map Shopify product GID → Judge.me numeric product id (Judge.me uses
// shopify_product_id which is the bare numeric id without the GID prefix).
function shopifyIdToJmProduct(productGid: string): string {
  return productGid.replace("gid://shopify/Product/", "");
}

// Pulls a product's review summary + a handful of recent reviews.
// Returns null if Judge.me isn't configured or the product has no reviews.
export async function fetchJudgeMeAggregate(
  productGid: string,
  reviewLimit = 5,
): Promise<JudgeMeAggregate | null> {
  const externalId = shopifyIdToJmProduct(productGid);
  // Aggregate
  const summary = await jm<{
    average: number | null;
    count: number;
  }>("/widgets/product_review_aggregate", { external_id: externalId });
  if (!summary || !summary.count || summary.count === 0) return null;

  // Recent reviews
  const list = await jm<{ reviews: JudgeMeReview[] }>("/reviews", {
    product_id: externalId,
    per_page: reviewLimit,
    page: 1,
  });

  return {
    rating: Math.round((summary.average ?? 0) * 10) / 10,
    count: summary.count,
    reviews: list?.reviews ?? [],
  };
}

// Convenience: bulk fetch with a small concurrency cap.
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

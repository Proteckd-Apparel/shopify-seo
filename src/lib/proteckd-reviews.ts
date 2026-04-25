// Self-hosted reviews API client. Replaces the old Judge.me integration.
//
// Calls the proteckd-verify admin endpoints over a shared X-Api-Key:
//   GET /api/reviews/admin/summaries?handles=h1,h2 → batch aggregates
//   GET /api/reviews/admin/by-handle?handle=h     → recent reviews + summary
//
// Reviews are keyed by product HANDLE (not Shopify GID), since the verify
// app stores them that way. Callers passing GIDs should switch to handles.

import { prisma } from "./prisma";

export type ProteckdReview = {
  rating: number;
  title: string | null;
  body: string;
  reviewer: string;
  date: string;
};

export type ProteckdAggregate = {
  rating: number;
  count: number;
  reviews: ProteckdReview[];
};

async function getCreds(): Promise<{ base: string; apiKey: string } | null> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.reviewsApiBase || !s?.reviewsApiKey) return null;
  // Strip trailing slash so we can build paths cleanly.
  const base = s.reviewsApiBase.replace(/\/+$/, "");
  return { base, apiKey: s.reviewsApiKey };
}

async function callJson<T>(
  path: string,
  apiKey: string,
): Promise<T | null> {
  const res = await fetch(path, {
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// Pulls recent reviews + summary for a single product handle. Returns null
// if the API isn't configured or returns no published reviews.
export async function fetchReviewsForHandle(
  handle: string,
  reviewLimit = 5,
): Promise<ProteckdAggregate | null> {
  if (!handle) return null;
  const creds = await getCreds();
  if (!creds) return null;
  const url = new URL(`${creds.base}/api/reviews/admin/by-handle`);
  url.searchParams.set("handle", handle);
  url.searchParams.set("limit", String(reviewLimit));
  type Resp = {
    ok: boolean;
    summary?: { count: number; avg_rating: number };
    reviews?: Array<{
      submitted_at: string;
      overall_rating: number;
      comments: string | null;
      reviewer_name: string | null;
      product_title: string | null;
      item_rating: number | null;
    }>;
  };
  const data = await callJson<Resp>(url.toString(), creds.apiKey);
  if (!data?.ok || !data.summary || !data.summary.count) return null;
  const reviews = (data.reviews ?? [])
    .filter((r) => r.comments && r.comments.trim())
    .map((r) => ({
      rating: r.item_rating ?? r.overall_rating,
      title: r.product_title,
      body: r.comments ?? "",
      reviewer: r.reviewer_name || "Verified Customer",
      date: r.submitted_at,
    }));
  return {
    rating: Math.round(data.summary.avg_rating * 10) / 10,
    count: data.summary.count,
    reviews,
  };
}

// Batch fetch aggregates for many handles in one round-trip. Returns a Map
// keyed by product handle. Reviews are NOT included (use fetchReviewsForHandle
// when you need bodies). 254 products × handle list ~6KB stays well under
// any URL length limits at chunks of 100.
export async function fetchAggregatesByHandle(
  handles: string[],
): Promise<Map<string, { rating: number; count: number }>> {
  const out = new Map<string, { rating: number; count: number }>();
  if (handles.length === 0) return out;
  const creds = await getCreds();
  if (!creds) return out;
  const CHUNK = 100;
  for (let i = 0; i < handles.length; i += CHUNK) {
    const slice = handles.slice(i, i + CHUNK).filter(Boolean);
    if (slice.length === 0) continue;
    const url = new URL(`${creds.base}/api/reviews/admin/summaries`);
    url.searchParams.set("handles", slice.join(","));
    type Resp = {
      ok: boolean;
      summaries?: Array<{
        product_handle: string;
        count: number;
        avg_rating: number;
      }>;
    };
    const data = await callJson<Resp>(url.toString(), creds.apiKey);
    if (!data?.ok || !data.summaries) continue;
    for (const row of data.summaries) {
      if (!row.product_handle || !row.count) continue;
      out.set(row.product_handle, {
        rating: Math.round(row.avg_rating * 10) / 10,
        count: row.count,
      });
    }
  }
  return out;
}

// Convenience: aggregates for many handles, plus full review bodies for the
// subset that has reviews. Two-phase so we don't fan out N detail calls for
// products with zero reviews.
export async function fetchReviewsBatch(
  handles: string[],
  reviewLimit = 5,
  detailConcurrency = 5,
): Promise<Map<string, ProteckdAggregate>> {
  const aggregates = await fetchAggregatesByHandle(handles);
  const out = new Map<string, ProteckdAggregate>();
  const queue = Array.from(aggregates.keys());
  async function worker() {
    while (queue.length > 0) {
      const handle = queue.shift();
      if (!handle) return;
      try {
        const agg = await fetchReviewsForHandle(handle, reviewLimit);
        if (agg) out.set(handle, agg);
      } catch {}
    }
  }
  await Promise.all(
    Array.from({ length: detailConcurrency }, () => worker()),
  );
  return out;
}

// ---------- Diagnostic ----------

export type ReviewsDebugReport = {
  ok: boolean;
  message: string;
  handle: string;
  rawSummary?: unknown;
  rawByHandle?: unknown;
};

export async function debugReviewsApi(
  handle: string,
): Promise<ReviewsDebugReport> {
  const creds = await getCreds();
  if (!creds) {
    return {
      ok: false,
      message:
        "Reviews API not configured (Settings → Reviews → set Base URL + API key).",
      handle,
    };
  }
  let rawSummary: unknown = null;
  let rawByHandle: unknown = null;
  try {
    const u1 = new URL(`${creds.base}/api/reviews/admin/summaries`);
    u1.searchParams.set("handles", handle);
    const r1 = await fetch(u1.toString(), {
      headers: { "x-api-key": creds.apiKey, Accept: "application/json" },
    });
    rawSummary = {
      status: r1.status,
      body: r1.ok ? await r1.json() : await r1.text(),
    };

    const u2 = new URL(`${creds.base}/api/reviews/admin/by-handle`);
    u2.searchParams.set("handle", handle);
    u2.searchParams.set("limit", "5");
    const r2 = await fetch(u2.toString(), {
      headers: { "x-api-key": creds.apiKey, Accept: "application/json" },
    });
    rawByHandle = {
      status: r2.status,
      body: r2.ok ? await r2.json() : await r2.text(),
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "fetch failed",
      handle,
      rawSummary,
      rawByHandle,
    };
  }
  return {
    ok: true,
    message: "Diagnostic complete",
    handle,
    rawSummary,
    rawByHandle,
  };
}

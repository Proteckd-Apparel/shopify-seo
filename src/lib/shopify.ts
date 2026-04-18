// Minimal Shopify Admin GraphQL client. Reads creds from Settings (DB) first,
// then falls back to env vars. Used by all features that touch Shopify.
//
// API version rotation: Shopify deprecates versions quarterly. When a version
// ages out, bump SHOPIFY_API_VERSION in Railway env (no redeploy needed the
// next time Next rebuilds) or update the fallback below and ship a release.
// Current required scopes: read_products, write_products, read_themes,
// write_themes, read_content, write_content, read_files, write_files.

import { prisma } from "./prisma";

const FALLBACK_API_VERSION = "2025-01";
const API_VERSION =
  process.env.SHOPIFY_API_VERSION?.trim() || FALLBACK_API_VERSION;

export type ShopifyCreds = { domain: string; token: string };

export async function getShopifyCreds(): Promise<ShopifyCreds | null> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const domain = settings?.shopDomain || process.env.SHOPIFY_SHOP_DOMAIN || "";
  const token = settings?.shopifyToken || process.env.SHOPIFY_ADMIN_TOKEN || "";
  if (!domain || !token) return null;
  return { domain, token };
}

export class ShopifyError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
  }
}

// Retry policy: Shopify throttles + flaky network + 5xx are all retryable.
// 429 honors Retry-After when present. Max 4 attempts = ~7s total worst-case.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!RETRY_STATUSES.has(res.status) || attempt === MAX_RETRIES) {
        return res;
      }
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const wait = retryAfter > 0
        ? retryAfter * 1000
        : Math.min(500 * 2 ** attempt + Math.random() * 250, 4000);
      await new Promise((r) => setTimeout(r, wait));
    } catch (e) {
      lastErr = e;
      if (attempt === MAX_RETRIES) throw e;
      await new Promise((r) =>
        setTimeout(r, Math.min(500 * 2 ** attempt + Math.random() * 250, 4000)),
      );
    }
  }
  throw lastErr ?? new Error("fetchWithRetry: exhausted");
}

export async function shopifyGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  creds?: ShopifyCreds,
): Promise<T> {
  const c = creds ?? (await getShopifyCreds());
  if (!c) throw new ShopifyError("Shopify credentials not configured");

  const res = await fetchWithRetry(
    `https://${c.domain}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": c.token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new ShopifyError(
      `Shopify ${res.status}: ${text.slice(0, 300)}`,
      res.status,
      text,
    );
  }

  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    const detail = JSON.stringify(json.errors).slice(0, 500);
    throw new ShopifyError(`GraphQL: ${detail}`, res.status, json.errors);
  }
  return json.data as T;
}

// Convenience: shop info ping (used by Settings to validate creds)
export async function shopInfo(creds?: ShopifyCreds) {
  return shopifyGraphQL<{
    shop: { id: string; name: string; primaryDomain: { url: string } };
  }>(
    `#graphql
    query ShopInfo {
      shop { id name primaryDomain { url } }
    }`,
    {},
    creds,
  );
}

export { API_VERSION as SHOPIFY_API_VERSION };

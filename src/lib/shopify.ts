// Minimal Shopify Admin GraphQL client. Reads creds from Settings (DB) first,
// then falls back to env vars. Used by all features that touch Shopify.

import { prisma } from "./prisma";

const API_VERSION = "2025-01";

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

export async function shopifyGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
  creds?: ShopifyCreds,
): Promise<T> {
  const c = creds ?? (await getShopifyCreds());
  if (!c) throw new ShopifyError("Shopify credentials not configured");

  const res = await fetch(
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
    throw new ShopifyError("GraphQL errors", res.status, json.errors);
  }
  return json.data as T;
}

// Convenience: shop info ping (used by Settings to validate creds)
export async function shopInfo(creds?: ShopifyCreds) {
  return shopifyGraphQL<{
    shop: { name: string; primaryDomain: { url: string } };
  }>(
    `#graphql
    query ShopInfo {
      shop { name primaryDomain { url } }
    }`,
    {},
    creds,
  );
}

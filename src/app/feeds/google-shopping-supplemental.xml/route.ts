// Supplemental feed for Google Merchant Center.
//
// Overrides title + description on products where we've generated
// health-claim-free copy. Items are matched to the primary feed by g:id.
//
// Shopify's Google & YouTube channel emits one primary-feed item per
// variant using the ID pattern `shopify_{country}_{product_id}_{variant_id}`.
// So for each product that has merchant copy, we emit ONE supplemental
// item per variant (all variants of a product share the same Google-safe
// copy — the per-variant differences are in options, not claims).
//
// If your primary feed uses a different ID format, set
// MERCHANT_SUPPLEMENTAL_ID_FORMAT to one of:
//   - "shopify" (default): shopify_{COUNTRY}_{product_num}_{variant_num}
//   - "product_num": just the numeric product ID
//   - "gid": raw Shopify GID (gid://shopify/Product/123)

import { shopifyGraphQL } from "@/lib/shopify";
import { xmlEscape, XML_HEADERS } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const PAGE_SIZE = 100;
const COUNTRY =
  process.env.MERCHANT_SUPPLEMENTAL_COUNTRY?.trim().toUpperCase() || "US";
const ID_FORMAT =
  (process.env.MERCHANT_SUPPLEMENTAL_ID_FORMAT?.trim() as
    | "shopify"
    | "product_num"
    | "gid"
    | undefined) || "shopify";

const QUERY = /* GraphQL */ `
  query MerchantCopyFeed($cursor: String) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        metafield(namespace: "custom", key: "google_merchant_copy") {
          value
        }
        variants(first: 100) {
          nodes { id }
        }
      }
    }
  }
`;

type StoredCopy = { title?: string; description?: string };

function numericId(gid: string): string {
  const idx = gid.lastIndexOf("/");
  return idx >= 0 ? gid.slice(idx + 1) : gid;
}

function formatFeedId(productGid: string, variantGid: string | null): string {
  if (ID_FORMAT === "gid") return productGid;
  if (ID_FORMAT === "product_num") return numericId(productGid);
  // "shopify" default
  const p = numericId(productGid);
  const v = variantGid ? numericId(variantGid) : "";
  return v
    ? `shopify_${COUNTRY}_${p}_${v}`
    : `shopify_${COUNTRY}_${p}`;
}

export async function GET() {
  type Node = {
    id: string;
    metafield: { value: string } | null;
    variants: { nodes: Array<{ id: string }> };
  };
  const items: string[] = [];
  let cursor: string | null = null;

  while (true) {
    const data: {
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Node[];
      };
    } = await shopifyGraphQL(QUERY, { cursor });

    for (const n of data.products.nodes) {
      const raw = n.metafield?.value;
      if (!raw) continue;
      let parsed: StoredCopy;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!parsed.title || !parsed.description) continue;

      const title = xmlEscape(parsed.title);
      const description = xmlEscape(parsed.description);
      const variants = n.variants.nodes;

      if (variants.length === 0) {
        const feedId = formatFeedId(n.id, null);
        items.push(
          `    <item>\n      <g:id>${xmlEscape(feedId)}</g:id>\n      <g:title>${title}</g:title>\n      <g:description>${description}</g:description>\n    </item>`,
        );
        continue;
      }
      for (const v of variants) {
        const feedId = formatFeedId(n.id, v.id);
        items.push(
          `    <item>\n      <g:id>${xmlEscape(feedId)}</g:id>\n      <g:title>${title}</g:title>\n      <g:description>${description}</g:description>\n    </item>`,
        );
      }
    }

    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Proteck'd Merchant Copy Supplemental Feed</title>
    <link>https://www.proteckd.com</link>
    <description>Health-claim-free titles and descriptions for Google Merchant Center.</description>
${items.join("\n")}
  </channel>
</rss>`;

  return new Response(xml, { headers: XML_HEADERS });
}

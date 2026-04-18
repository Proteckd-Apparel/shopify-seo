// Products sitemap with image:image entries. Each product URL carries its
// gallery as image extensions so Google Images indexes them alongside the
// product page.

import {
  fetchAllProductsForSitemap,
  fetchPrimaryDomain,
} from "@/lib/sitemap-fetch";
import { buildUrlset, XML_HEADERS, type UrlEntry } from "@/lib/sitemap-xml";

export const revalidate = 3600;

export async function GET() {
  const [products, primaryDomain] = await Promise.all([
    fetchAllProductsForSitemap(),
    fetchPrimaryDomain(),
  ]);

  // Fallback: if primaryDomain fetch fails, use the first product's
  // onlineStoreUrl origin. If no products either, return empty urlset.
  const fallback =
    products.find((p) => p.onlineStoreUrl)?.onlineStoreUrl ?? null;
  const base =
    primaryDomain ??
    (fallback ? new URL(fallback).origin : null);

  if (!base) {
    return new Response(buildUrlset([]), { headers: XML_HEADERS });
  }

  const entries: UrlEntry[] = products.map((p) => ({
    loc: p.onlineStoreUrl ?? `${base}/products/${p.handle}`,
    lastmod: p.updatedAt,
    changefreq: "weekly",
    priority: 0.8,
    images: p.images.map((img) => ({
      loc: img.url,
      caption: img.altText,
      title: img.altText,
    })),
  }));

  return new Response(buildUrlset(entries), { headers: XML_HEADERS });
}

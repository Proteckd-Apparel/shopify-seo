// Master sitemap index. Submit THIS URL to Google Search Console and it
// will auto-discover the sub-sitemaps.

import { headers } from "next/headers";
import { buildSitemapIndex, XML_HEADERS } from "@/lib/sitemap-xml";

// Rendered per-request (can't prerender — depends on Shopify creds in the
// DB, which isn't reachable during Railway's build phase). Cached downstream
// via Cache-Control headers instead.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  // Google requires submitted sitemap URLs to live on the verified domain.
  // When SHOPIFY_APP_PROXY_URL is set (e.g.
  // https://www.proteckd.com/apps/proteckd-seo), we emit sub-sitemap URLs
  // under that proxy so Google follows them via the store's canonical
  // hostname instead of the Railway one.
  //
  // Fallback order:
  //   1. SHOPIFY_APP_PROXY_URL (proxied path on your store domain)
  //   2. PUBLIC_APP_URL (explicit public Railway URL)
  //   3. x-forwarded-host (what the current request came through)
  //   4. Hard-coded Railway URL (last resort)
  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";
  const base =
    process.env.SHOPIFY_APP_PROXY_URL?.replace(/\/$/, "") ||
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null) ||
    "https://shopify-seo-production.up.railway.app";

  const now = new Date().toISOString();
  const xml = buildSitemapIndex([
    { loc: `${base}/feeds/sitemaps/products.xml`, lastmod: now },
    { loc: `${base}/feeds/sitemaps/collections.xml`, lastmod: now },
    { loc: `${base}/feeds/sitemaps/articles.xml`, lastmod: now },
    { loc: `${base}/feeds/sitemaps/pages.xml`, lastmod: now },
  ]);

  return new Response(xml, { headers: XML_HEADERS });
}

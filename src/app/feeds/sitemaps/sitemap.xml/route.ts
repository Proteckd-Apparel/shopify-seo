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
  // Railway routes requests through an internal proxy, so request.url's
  // origin is `http://localhost:8080`. The real public hostname lives in
  // x-forwarded-host. Fall back to PUBLIC_APP_URL env (explicit override)
  // then to a sensible default if neither is set.
  const h = await headers();
  const forwardedHost = h.get("x-forwarded-host");
  const forwardedProto = h.get("x-forwarded-proto") ?? "https";
  const base =
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

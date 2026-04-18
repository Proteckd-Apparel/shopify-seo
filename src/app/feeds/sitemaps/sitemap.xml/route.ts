// Master sitemap index. Submit THIS URL to Google Search Console and it
// will auto-discover the sub-sitemaps.

import { buildSitemapIndex, XML_HEADERS } from "@/lib/sitemap-xml";

// Rendered per-request (can't prerender — depends on Shopify creds in the
// DB, which isn't reachable during Railway's build phase). Cached downstream
// via Cache-Control headers instead.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(request: Request) {
  const base = new URL(request.url).origin;
  const now = new Date().toISOString();

  const xml = buildSitemapIndex([
    { loc: `${base}/feeds/sitemaps/products.xml`, lastmod: now },
    { loc: `${base}/feeds/sitemaps/collections.xml`, lastmod: now },
    { loc: `${base}/feeds/sitemaps/articles.xml`, lastmod: now },
    { loc: `${base}/feeds/sitemaps/pages.xml`, lastmod: now },
  ]);

  return new Response(xml, { headers: XML_HEADERS });
}

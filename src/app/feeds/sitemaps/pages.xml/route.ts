// Custom pages sitemap (About, Contact, Policies, etc.).

import {
  fetchAllPagesForSitemap,
  fetchPrimaryDomain,
} from "@/lib/sitemap-fetch";
import { buildUrlset, XML_HEADERS, type UrlEntry } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  const [pages, primaryDomain] = await Promise.all([
    fetchAllPagesForSitemap(),
    fetchPrimaryDomain(),
  ]);

  if (!primaryDomain) {
    return new Response(buildUrlset([]), { headers: XML_HEADERS });
  }

  const entries: UrlEntry[] = pages.map((p) => ({
    loc: `${primaryDomain}/pages/${p.handle}`,
    lastmod: p.updatedAt,
    changefreq: "monthly",
    priority: 0.5,
  }));

  return new Response(buildUrlset(entries), { headers: XML_HEADERS });
}

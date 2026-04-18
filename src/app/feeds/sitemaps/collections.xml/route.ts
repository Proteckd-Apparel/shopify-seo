// Collections sitemap. Collection hero images travel along so Google can
// index them separately from product galleries.

import {
  fetchAllCollectionsForSitemap,
  fetchPrimaryDomain,
} from "@/lib/sitemap-fetch";
import { buildUrlset, XML_HEADERS, type UrlEntry } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  const [collections, primaryDomain] = await Promise.all([
    fetchAllCollectionsForSitemap(),
    fetchPrimaryDomain(),
  ]);

  if (!primaryDomain) {
    return new Response(buildUrlset([]), { headers: XML_HEADERS });
  }

  const entries: UrlEntry[] = collections.map((c) => ({
    loc: `${primaryDomain}/collections/${c.handle}`,
    lastmod: c.updatedAt,
    changefreq: "weekly",
    priority: 0.7,
    images: c.image
      ? [
          {
            loc: c.image.url,
            caption: c.image.altText,
            title: c.image.altText,
          },
        ]
      : [],
  }));

  return new Response(buildUrlset(entries), { headers: XML_HEADERS });
}

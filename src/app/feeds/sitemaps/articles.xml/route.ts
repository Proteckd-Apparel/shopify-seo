// Articles sitemap. Article hero images travel with the URL as image:image
// entries.

import {
  fetchAllArticlesForSitemap,
  fetchPrimaryDomain,
} from "@/lib/sitemap-fetch";
import { buildUrlset, XML_HEADERS, type UrlEntry } from "@/lib/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  const [articles, primaryDomain] = await Promise.all([
    fetchAllArticlesForSitemap(),
    fetchPrimaryDomain(),
  ]);

  if (!primaryDomain) {
    return new Response(buildUrlset([]), { headers: XML_HEADERS });
  }

  const entries: UrlEntry[] = articles.map((a) => ({
    loc: `${primaryDomain}/blogs/${a.blogHandle}/${a.handle}`,
    lastmod: a.updatedAt,
    changefreq: "monthly",
    priority: 0.6,
    images: a.image
      ? [
          {
            loc: a.image.url,
            caption: a.image.altText,
            title: a.image.altText,
          },
        ]
      : [],
  }));

  return new Response(buildUrlset(entries), { headers: XML_HEADERS });
}

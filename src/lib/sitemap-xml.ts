// XML helpers for sitemap generation. Keeps escaping + namespace boilerplate
// in one place so the individual sitemap routes stay focused on data.

const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOT = /"/g;
const APOS = /'/g;

export function xmlEscape(s: string): string {
  return s
    .replace(AMP, "&amp;")
    .replace(LT, "&lt;")
    .replace(GT, "&gt;")
    .replace(QUOT, "&quot;")
    .replace(APOS, "&apos;");
}

export type UrlEntry = {
  loc: string;
  lastmod?: string; // ISO 8601
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number; // 0.0 to 1.0
  images?: Array<{ loc: string; caption?: string | null; title?: string | null }>;
};

// Build a full urlset XML. Includes the image:image namespace only when any
// entry has images (keeps XML tighter otherwise).
export function buildUrlset(entries: UrlEntry[]): string {
  const hasImages = entries.some((e) => e.images && e.images.length > 0);
  const ns = [
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    hasImages ? 'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"' : "",
  ]
    .filter(Boolean)
    .join(" ");

  const body = entries
    .map((e) => {
      const parts = [`    <loc>${xmlEscape(e.loc)}</loc>`];
      if (e.lastmod) parts.push(`    <lastmod>${xmlEscape(e.lastmod)}</lastmod>`);
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (typeof e.priority === "number")
        parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      if (e.images) {
        for (const img of e.images) {
          const imgParts = [`      <image:loc>${xmlEscape(img.loc)}</image:loc>`];
          if (img.caption)
            imgParts.push(`      <image:caption>${xmlEscape(img.caption)}</image:caption>`);
          if (img.title)
            imgParts.push(`      <image:title>${xmlEscape(img.title)}</image:title>`);
          parts.push(`    <image:image>\n${imgParts.join("\n")}\n    </image:image>`);
        }
      }
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset ${ns}>
${body}
</urlset>`;
}

export function buildSitemapIndex(sitemaps: Array<{ loc: string; lastmod?: string }>): string {
  const body = sitemaps
    .map((s) => {
      const parts = [`    <loc>${xmlEscape(s.loc)}</loc>`];
      if (s.lastmod) parts.push(`    <lastmod>${xmlEscape(s.lastmod)}</lastmod>`);
      return `  <sitemap>\n${parts.join("\n")}\n  </sitemap>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
}

export const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
};

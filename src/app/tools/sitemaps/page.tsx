import { List, ExternalLink, Copy } from "lucide-react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

type SitemapRow = {
  label: string;
  path: string;
  description: string;
};

const CUSTOM_SITEMAPS: SitemapRow[] = [
  {
    label: "Master index",
    path: "/feeds/sitemaps/sitemap.xml",
    description: "Points Google at all sub-sitemaps below. Submit THIS one.",
  },
  {
    label: "Products + images",
    path: "/feeds/sitemaps/products.xml",
    description: "Active products with image:image tags for Google Images.",
  },
  {
    label: "Collections + images",
    path: "/feeds/sitemaps/collections.xml",
    description: "All collections with hero images.",
  },
  {
    label: "Articles + images",
    path: "/feeds/sitemaps/articles.xml",
    description: "Published blog posts with featured images.",
  },
  {
    label: "Pages",
    path: "/feeds/sitemaps/pages.xml",
    description: "Custom pages (About, Contact, etc).",
  },
];

export default async function SitemapsPage() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const domain = settings?.shopDomain ?? "your-store.myshopify.com";
  const shopifySitemapUrl = `https://${domain}/sitemap.xml`;

  const h = await headers();
  const host = h.get("host") ?? "shopify-seo-production.up.railway.app";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const appOrigin = `${proto}://${host}`;

  let shopifyPreview = "Loading…";
  try {
    const r = await fetch(shopifySitemapUrl, { cache: "no-store" });
    shopifyPreview = await r.text();
  } catch {
    shopifyPreview = "Could not fetch sitemap.";
  }

  return (
    <div>
      <PageHeader
        icon={List}
        title="Sitemaps"
        description="Custom sitemaps for Google Search Console — replaces paid SEO app sitemaps."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-6">
        <h3 className="font-semibold mb-1">Custom sitemaps (submit these to GSC)</h3>
        <p className="text-xs text-slate-500 mb-4">
          These include proper <code>&lt;lastmod&gt;</code> timestamps and the
          <code> image:image</code> namespace so Google Images indexes product
          photos alongside page URLs. Paid SEO sitemap apps typically do the
          same thing — these replace them.
        </p>

        <div className="space-y-2">
          {CUSTOM_SITEMAPS.map((s) => {
            const url = `${appOrigin}${s.path}`;
            return (
              <div
                key={s.path}
                className="border border-slate-200 rounded p-3 flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm">{s.label}</div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </a>
                </div>
                <div className="text-xs text-slate-500">{s.description}</div>
                <code className="text-xs font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-1 break-all">
                  {url}
                </code>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-xs text-slate-600">
          <strong className="text-slate-900">To submit:</strong> open{" "}
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Google Search Console
          </a>{" "}
          → Sitemaps → paste the master index URL above → Submit. Google
          discovers the sub-sitemaps automatically.
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Shopify default sitemap</h3>
          <a
            href={shopifySitemapUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
          >
            <ExternalLink className="w-4 h-4" /> Open
          </a>
        </div>
        <code className="block text-xs font-mono text-slate-600 mb-3 break-all">
          {shopifySitemapUrl}
        </code>
        <p className="text-xs text-slate-500 mb-3">
          Keep this submitted to GSC too — it covers collections, variants, and
          tag pages that aren&apos;t in the custom sitemaps above.
        </p>
        <pre className="bg-slate-50 border border-slate-100 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-64">
          {shopifyPreview.slice(0, 2000)}
        </pre>
      </div>
    </div>
  );
}

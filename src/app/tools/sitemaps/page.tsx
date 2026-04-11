import { List, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function SitemapsPage() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const domain = settings?.shopDomain ?? "your-store.myshopify.com";
  const sitemapUrl = `https://${domain}/sitemap.xml`;

  let preview = "Loading…";
  let urlCount = 0;
  try {
    const r = await fetch(sitemapUrl, { cache: "no-store" });
    preview = await r.text();
    urlCount = (preview.match(/<sitemap>/g) ?? []).length;
  } catch {
    preview = "Could not fetch sitemap.";
  }

  return (
    <div>
      <PageHeader
        icon={List}
        title="Sitemaps"
        description="Inspect your Shopify-generated sitemap.xml."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Live sitemap</h3>
          <a
            href={sitemapUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
          >
            <ExternalLink className="w-4 h-4" /> Open
          </a>
        </div>
        <code className="block text-xs font-mono text-slate-600 mb-3 break-all">
          {sitemapUrl}
        </code>
        <pre className="bg-slate-50 border border-slate-100 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-96">
          {preview.slice(0, 4000)}
        </pre>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-3xl text-xs text-amber-900">
        Shopify auto-generates and updates the sitemap. You can&apos;t directly
        edit it, but you can submit it to{" "}
        <a
          href="https://search.google.com/search-console"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-600 hover:underline"
        >
          Google Search Console
        </a>{" "}
        for indexing.
      </div>
    </div>
  );
}

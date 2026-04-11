import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Detects internal links inside product/page bodies that don't resolve to
// any known Resource. Doesn't make HEAD requests yet — pure local analysis.

export default async function BrokenLinksPage() {
  const resources = await prisma.resource.findMany({
    select: { id: true, type: true, handle: true, title: true, bodyHtml: true, url: true },
    where: { bodyHtml: { not: null } },
    take: 5000,
  });

  const knownPaths = new Set<string>();
  for (const r of resources) {
    if (r.handle && r.type === "product")
      knownPaths.add(`/products/${r.handle}`);
    if (r.handle && r.type === "collection")
      knownPaths.add(`/collections/${r.handle}`);
    if (r.handle && r.type === "page") knownPaths.add(`/pages/${r.handle}`);
    if (r.handle && r.type === "article")
      knownPaths.add(`/blogs/news/${r.handle}`);
  }

  type Hit = {
    sourceId: string;
    sourceTitle: string;
    sourceUrl: string | null;
    href: string;
  };
  const hits: Hit[] = [];
  const re = /href=["']([^"']+)["']/gi;

  for (const r of resources) {
    if (!r.bodyHtml) continue;
    const matches = r.bodyHtml.matchAll(re);
    for (const m of matches) {
      const href = m[1];
      // Only check internal Shopify-style paths
      if (!href.startsWith("/")) continue;
      // Strip query / fragment
      const path = href.split("?")[0].split("#")[0];
      if (
        path.startsWith("/products/") ||
        path.startsWith("/collections/") ||
        path.startsWith("/pages/") ||
        path.startsWith("/blogs/")
      ) {
        // crude check ignoring trailing handles
        const base = path.replace(/\/$/, "");
        if (![...knownPaths].some((k) => base.startsWith(k))) {
          hits.push({
            sourceId: r.id,
            sourceTitle: r.title ?? r.handle ?? "—",
            sourceUrl: r.url,
            href,
          });
          if (hits.length >= 500) break;
        }
      }
    }
    if (hits.length >= 500) break;
  }

  return (
    <div>
      <PageHeader
        icon={AlertCircle}
        title="Broken Links"
        description="Internal links found in product/page HTML that don't resolve to any known resource."
      />

      {hits.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No broken internal links detected. ✓
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Source page</th>
                <th className="text-left px-4 py-2">Broken link</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((h, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    {h.sourceUrl ? (
                      <a
                        href={h.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        {h.sourceTitle}
                      </a>
                    ) : (
                      h.sourceTitle
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-red-600">
                    {h.href}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { Tags } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { TagsEditor } from "./tags-editor";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const q = (sp.q ?? "").trim();

  const where: Record<string, unknown> = { type: "product" };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
    ];
  }

  const products = await prisma.resource.findMany({
    where,
    orderBy: { title: "asc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  // Aggregate tag frequencies for the sidebar
  const all = await prisma.resource.findMany({
    where: { type: "product" },
    select: { tags: true },
  });
  const counts = new Map<string, number>();
  for (const r of all) {
    if (!r.tags) continue;
    for (const t of r.tags.split(",").map((s) => s.trim()).filter(Boolean)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const topTags = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  return (
    <div>
      <PageHeader
        icon={Tags}
        title="Tags"
        description="Bulk edit product tags. Saves write directly to Shopify."
      />

      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by title or tag..."
          className="px-3 py-1.5 text-sm border border-slate-200 rounded w-64"
        />
        <button className="px-3 py-1.5 text-sm rounded bg-slate-900 text-white">
          Search
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 w-1/3">Product</th>
                  <th className="text-left px-4 py-2">Tags</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 truncate">
                        {p.title}
                      </div>
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          view on store
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TagsEditor
                        productId={p.id}
                        initialTags={
                          p.tags
                            ? p.tags
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                            : []
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-4 text-sm">
            <div className="text-slate-500">Page {page}</div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`?q=${q}&page=${page - 1}`}
                  className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
                >
                  Prev
                </Link>
              )}
              {products.length === PAGE_SIZE && (
                <Link
                  href={`?q=${q}&page=${page + 1}`}
                  className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
              Top tags
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {topTags.map(([t, n]) => (
                <Link
                  key={t}
                  href={`?q=${encodeURIComponent(t)}`}
                  className="text-xs px-2 py-0.5 bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 rounded-full"
                >
                  {t} <span className="opacity-50">{n}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

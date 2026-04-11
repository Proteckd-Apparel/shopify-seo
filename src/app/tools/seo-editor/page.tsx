import { FileText } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function SeoEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const type = sp.type ?? "product";
  const q = (sp.q ?? "").trim();

  const where: Record<string, unknown> = { type };
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { handle: { contains: q, mode: "insensitive" } },
    ];
  }

  const resources = await prisma.resource.findMany({
    where,
    orderBy: { title: "asc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="SEO Editor"
        description="Side-by-side view of every resource's SEO fields. Click to jump into the relevant optimizer."
      />

      <form className="mb-4 flex gap-2">
        <select
          name="type"
          defaultValue={type}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
        >
          <option value="product">Products</option>
          <option value="collection">Collections</option>
          <option value="page">Pages</option>
          <option value="article">Articles</option>
        </select>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title or handle..."
          className="px-3 py-1.5 text-sm border border-slate-200 rounded w-64"
        />
        <button className="px-3 py-1.5 text-sm rounded bg-slate-900 text-white">
          Search
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 w-1/4">Resource</th>
              <th className="text-left px-4 py-2 w-1/3">SEO Title</th>
              <th className="text-left px-4 py-2">SEO Description</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-900 truncate">
                    {r.title}
                  </div>
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-600 hover:underline"
                    >
                      view on store
                    </a>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="text-slate-700">
                    {r.seoTitle || (
                      <span className="text-slate-400 italic">missing</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {(r.seoTitle ?? "").length} chars
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="text-slate-700">
                    {r.seoDescription || (
                      <span className="text-slate-400 italic">missing</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {(r.seoDescription ?? "").length} chars
                  </div>
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
              href={`?type=${type}&q=${q}&page=${page - 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Prev
            </Link>
          )}
          {resources.length === PAGE_SIZE && (
            <Link
              href={`?type=${type}&q=${q}&page=${page + 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

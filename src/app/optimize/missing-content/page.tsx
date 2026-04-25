// Lists resources whose body HTML is empty or thin (< 120 chars of visible
// text). Linked from the dashboard "Empty Body" / "Thin Content" tiles so
// the user can see exactly which page/product is missing copy and jump
// straight to the Shopify admin editor for that item.
//
// Pure read-only view — no AI, no batch action. Body copy needs human/store
// owner judgment, so we surface the list and link out to admin.

import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const THIN_THRESHOLD = 120;

type ResourceType = "product" | "collection" | "article" | "page";
type FilterMode = "empty" | "thin" | "all";

const TYPE_LABEL: Record<ResourceType, string> = {
  product: "Products",
  collection: "Collections",
  article: "Articles",
  page: "Pages",
};

// Build a Shopify admin edit URL from the resource gid + type. Resource.id
// is a gid like gid://shopify/Product/123; admin URLs nest under singular
// segments matching the type.
function adminEditUrl(
  resourceId: string,
  type: string,
  shopDomain: string | null,
): string | null {
  if (!shopDomain) return null;
  const numeric = resourceId.replace(/^gid:\/\/shopify\/[^/]+\//, "");
  if (!numeric) return null;
  const seg =
    type === "product"
      ? "products"
      : type === "collection"
        ? "collections"
        : type === "article"
          ? "articles"
          : type === "page"
            ? "pages"
            : null;
  if (!seg) return null;
  return `https://${shopDomain}/admin/${seg}/${numeric}`;
}

export default async function MissingContentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const type: ResourceType = (
    ["product", "collection", "article", "page"] as const
  ).includes(sp.type as ResourceType)
    ? (sp.type as ResourceType)
    : "page";
  const filter: FilterMode = (
    ["empty", "thin", "all"] as const
  ).includes(sp.filter as FilterMode)
    ? (sp.filter as FilterMode)
    : "empty";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  const [settings, allOfType] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.resource.findMany({
      where: { type },
      select: {
        id: true,
        handle: true,
        title: true,
        url: true,
        bodyHtml: true,
      },
    }),
  ]);
  const shopDomain = settings?.shopDomain ?? null;

  // Compute body lengths in JS — same logic as stats.ts so counts match.
  const annotated = allOfType.map((r) => {
    const len = (r.bodyHtml ?? "").replace(/<[^>]+>/g, " ").trim().length;
    return { ...r, bodyLen: len };
  });
  const emptyAll = annotated.filter((r) => r.bodyLen === 0);
  const thinAll = annotated.filter(
    (r) => r.bodyLen > 0 && r.bodyLen < THIN_THRESHOLD,
  );
  const allCount = annotated.length;

  let filtered =
    filter === "empty"
      ? emptyAll
      : filter === "thin"
        ? thinAll
        : annotated;
  filtered = filtered.sort((a, b) =>
    (a.title ?? a.handle ?? "").localeCompare(b.title ?? b.handle ?? ""),
  );
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasNext = filtered.length > page * PAGE_SIZE;

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Missing body content"
        description="Resources whose body HTML is empty or below 120 chars of visible text. Click a row to edit it directly in Shopify admin."
      />

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1">
          {(["product", "collection", "article", "page"] as const).map((t) => (
            <Link
              key={t}
              href={`?type=${t}&filter=${filter}`}
              className={`px-3 py-1 text-xs rounded-full border ${
                type === t
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white border-slate-300 hover:bg-slate-50"
              }`}
            >
              {TYPE_LABEL[t]}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <FilterPill type={type} filter="empty" current={filter}>
            Empty ({emptyAll.length})
          </FilterPill>
          <FilterPill type={type} filter="thin" current={filter}>
            Thin ({thinAll.length})
          </FilterPill>
          <FilterPill type={type} filter="all" current={filter}>
            All ({allCount})
          </FilterPill>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 w-1/2">Resource</th>
              <th className="text-left px-4 py-2">Body length</th>
              <th className="text-right px-4 py-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  Nothing matches.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const editUrl = adminEditUrl(r.id, type, shopDomain);
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 truncate">
                        {r.title || r.handle || "(untitled)"}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {r.handle}
                      </div>
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          view on store ↗
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          r.bodyLen === 0
                            ? "text-red-600 font-semibold"
                            : r.bodyLen < THIN_THRESHOLD
                              ? "text-amber-600 font-semibold"
                              : "text-slate-700"
                        }
                      >
                        {r.bodyLen} chars
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editUrl ? (
                        <a
                          href={editUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                        >
                          Edit in admin ↗
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4 text-sm">
        <div className="text-slate-500">
          Page {page} of {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
        </div>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`?type=${type}&filter=${filter}&page=${page - 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Prev
            </Link>
          )}
          {hasNext && (
            <Link
              href={`?type=${type}&filter=${filter}&page=${page + 1}`}
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

function FilterPill({
  type,
  filter,
  current,
  children,
}: {
  type: string;
  filter: string;
  current: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`?type=${type}&filter=${filter}`}
      className={`px-3 py-1 text-xs rounded-full border ${
        current === filter
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

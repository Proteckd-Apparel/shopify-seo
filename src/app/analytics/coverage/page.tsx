// Coverage view: one row per resource with green/red dots showing whether
// each SEO field is set. The dashboard tiles answer "how many are missing
// X across the catalog" (per-field aggregate). This page answers "is THIS
// product fully optimized" (per-resource detail).
//
// Pure read-only — clicking a row's "Edit" button deep-links into the
// matching optimize page so you can fix it in one click.

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const THIN_THRESHOLD = 120;
const META_TITLE_MIN = 25;
const META_TITLE_MAX = 60;
const META_DESC_MIN = 70;
const META_DESC_MAX = 160;

type ResourceType = "product" | "collection" | "article" | "page";
type Filter = "all" | "incomplete";
type SortBy = "title" | "score" | "updated";

const TYPE_LABEL: Record<ResourceType, string> = {
  product: "Products",
  collection: "Collections",
  article: "Articles",
  page: "Pages",
};

function bodyTextLength(html: string | null | undefined): number {
  return (html ?? "").replace(/<[^>]+>/g, " ").trim().length;
}

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

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    filter?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const type: ResourceType = (
    ["product", "collection", "article", "page"] as const
  ).includes(sp.type as ResourceType)
    ? (sp.type as ResourceType)
    : "product";
  const filter: Filter = sp.filter === "incomplete" ? "incomplete" : "all";
  const sort: SortBy =
    sp.sort === "score" ? "score" : sp.sort === "updated" ? "updated" : "title";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  const [settings, resources] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.resource.findMany({
      where: { type },
      include: { images: true },
    }),
  ]);
  const shopDomain = settings?.shopDomain ?? null;

  // Annotate each resource with check status. Score = number of green checks
  // (out of 4 max), used for sorting + filtering.
  const annotated = resources.map((r) => {
    const hasMetaTitle = !!(r.seoTitle ?? "").trim();
    const hasMetaDesc = !!(r.seoDescription ?? "").trim();
    const totalImages = r.images.length;
    const imagesWithAlt = r.images.filter((i) =>
      (i.altText ?? "").trim(),
    ).length;
    const altOk = totalImages === 0 || imagesWithAlt === totalImages;
    const bodyLen = bodyTextLength(r.bodyHtml);
    const bodyOk = bodyLen >= THIN_THRESHOLD;

    const checks = {
      metaTitle: hasMetaTitle,
      metaDesc: hasMetaDesc,
      altText: altOk,
      body: bodyOk,
    };
    const score =
      Number(checks.metaTitle) +
      Number(checks.metaDesc) +
      Number(checks.altText) +
      Number(checks.body);
    return {
      ...r,
      checks,
      score,
      bodyLen,
      altsMissing: totalImages - imagesWithAlt,
      totalImages,
    };
  });

  let filtered = filter === "incomplete"
    ? annotated.filter((r) => r.score < 4)
    : annotated;

  if (sort === "score") {
    filtered = filtered.sort((a, b) => a.score - b.score);
  } else if (sort === "updated") {
    filtered = filtered.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } else {
    filtered = filtered.sort((a, b) =>
      (a.title ?? a.handle ?? "").localeCompare(b.title ?? b.handle ?? ""),
    );
  }

  const completeCount = annotated.filter((r) => r.score === 4).length;
  const incompleteCount = annotated.length - completeCount;
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasNext = filtered.length > page * PAGE_SIZE;

  return (
    <div>
      <PageHeader
        icon={ListChecks}
        title="SEO Coverage"
        description="One row per resource. Green = field is set. Red = empty / incomplete. Sort by score to surface the items still needing attention."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Fully optimized" value={completeCount} tone="good" />
        <Stat label="Incomplete" value={incompleteCount} tone={incompleteCount > 0 ? "bad" : "good"} />
        <Stat label="Total" value={annotated.length} tone="neutral" />
        <Stat
          label="Avg score"
          value={
            annotated.length > 0
              ? `${(
                  annotated.reduce((s, r) => s + r.score, 0) /
                  annotated.length
                ).toFixed(2)} / 4`
              : "—"
          }
          tone="neutral"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1">
          {(["product", "collection", "article", "page"] as const).map((t) => (
            <Link
              key={t}
              href={`?type=${t}&filter=${filter}&sort=${sort}`}
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
          <Pill href={`?type=${type}&filter=all&sort=${sort}`} active={filter === "all"}>
            All ({annotated.length})
          </Pill>
          <Pill
            href={`?type=${type}&filter=incomplete&sort=${sort}`}
            active={filter === "incomplete"}
          >
            Incomplete ({incompleteCount})
          </Pill>
        </div>
      </div>

      <div className="flex gap-2 mb-3 text-xs text-slate-500 items-center">
        <span>Sort:</span>
        <Pill href={`?type=${type}&filter=${filter}&sort=title`} active={sort === "title"}>
          A→Z
        </Pill>
        <Pill href={`?type=${type}&filter=${filter}&sort=score`} active={sort === "score"}>
          Score (worst first)
        </Pill>
        <Pill href={`?type=${type}&filter=${filter}&sort=updated`} active={sort === "updated"}>
          Recently updated
        </Pill>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2 w-1/3">Resource</th>
              <th className="text-center px-2 py-2" title={`Optimal ${META_TITLE_MIN}-${META_TITLE_MAX} chars`}>
                Meta title
              </th>
              <th className="text-center px-2 py-2" title={`Optimal ${META_DESC_MIN}-${META_DESC_MAX} chars`}>
                Meta desc
              </th>
              <th className="text-center px-2 py-2">Alt texts</th>
              <th className="text-center px-2 py-2" title={`Body must have >${THIN_THRESHOLD} chars`}>
                Body
              </th>
              <th className="text-center px-2 py-2">Score</th>
              <th className="text-right px-3 py-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  Nothing matches.
                </td>
              </tr>
            ) : (
              pageRows.map((r) => {
                const editUrl = adminEditUrl(r.id, type, shopDomain);
                return (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900 truncate max-w-[280px]">
                        {r.title || r.handle || "(untitled)"}
                      </div>
                      <div className="text-xs text-slate-500 truncate max-w-[280px]">
                        {r.handle}
                      </div>
                      {r.url && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          view ↗
                        </a>
                      )}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Dot ok={r.checks.metaTitle} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Dot ok={r.checks.metaDesc} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Dot
                        ok={r.checks.altText}
                        sub={
                          r.totalImages === 0
                            ? "no imgs"
                            : r.altsMissing > 0
                              ? `${r.altsMissing} missing`
                              : `${r.totalImages}/${r.totalImages}`
                        }
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Dot
                        ok={r.checks.body}
                        sub={`${r.bodyLen} chars`}
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded ${
                          r.score === 4
                            ? "bg-emerald-100 text-emerald-700"
                            : r.score === 0
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.score}/4
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {editUrl ? (
                        <a
                          href={editUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                        >
                          Edit ↗
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
              href={`?type=${type}&filter=${filter}&sort=${sort}&page=${page - 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Prev
            </Link>
          )}
          {hasNext && (
            <Link
              href={`?type=${type}&filter=${filter}&sort=${sort}&page=${page + 1}`}
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

function Dot({ ok, sub }: { ok: boolean; sub?: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <span
        className={`inline-block w-3 h-3 rounded-full ${
          ok ? "bg-emerald-500" : "bg-red-400"
        }`}
        aria-label={ok ? "set" : "missing"}
      />
      {sub && <span className="text-[9px] text-slate-400">{sub}</span>}
    </div>
  );
}

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 text-xs rounded-full border ${
        active
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "bad"
        ? "bg-red-50 border-red-200"
        : "bg-white border-slate-200";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-600 mt-1">{label}</div>
    </div>
  );
}

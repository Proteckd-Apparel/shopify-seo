import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { EditableCell } from "@/components/editable-cell";
import {
  bulkGenerateMetaTitles,
  generateSeoTitle,
  saveSeoTitle,
} from "../_actions";
import { BulkButton } from "@/components/bulk-button";
import {
  getTemplate,
  loadOptimizerConfig,
  type TemplateScopeKey,
} from "@/lib/optimizer-config";
import { MetaTitleTemplateMode } from "./template-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const PAGE_SIZE = 50;
const MIN = 25;
const MAX = 60;

export default async function MetaTitlesPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    type?: string;
    filter?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const mode = sp.mode ?? "template";
  const type = sp.type ?? "product";
  const filter = sp.filter ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  if (mode === "template") {
    const cfg = await loadOptimizerConfig();
    const initialTemplates: Record<TemplateScopeKey, ReturnType<typeof getTemplate>> = {
      products: getTemplate(cfg, "metaTitle", "products"),
      collections: getTemplate(cfg, "metaTitle", "collections"),
      articles: getTemplate(cfg, "metaTitle", "articles"),
      pages: getTemplate(cfg, "metaTitle", "pages"),
    };
    return (
      <div>
        <PageHeader
          icon={FileText}
          title="Meta Titles"
          description="Bulk generate via template OR edit row-by-row."
        />
        <div className="flex gap-1 mb-4">
          <ModeTab href="?mode=template" current={mode} value="template">
            Template
          </ModeTab>
          <ModeTab href="?mode=inline" current={mode} value="inline">
            Inline edit
          </ModeTab>
        </div>
        <MetaTitleTemplateMode initialTemplates={initialTemplates} />
      </div>
    );
  }

  const where: Record<string, unknown> = { type };
  if (filter === "missing") where.OR = [{ seoTitle: null }, { seoTitle: "" }];
  if (filter === "short") {
    // SQLite doesn't support LENGTH() in Prisma where, so we filter in JS below.
  }

  let resources = await prisma.resource.findMany({
    where,
    orderBy: { title: "asc" },
    take: filter === "short" || filter === "long" ? 5000 : PAGE_SIZE,
    skip: filter === "short" || filter === "long" ? 0 : (page - 1) * PAGE_SIZE,
  });

  if (filter === "short") {
    resources = resources.filter(
      (r) => (r.seoTitle ?? "").length > 0 && (r.seoTitle ?? "").length < MIN,
    );
  } else if (filter === "long") {
    resources = resources.filter((r) => (r.seoTitle ?? "").length > MAX);
  }
  if (filter === "short" || filter === "long") {
    resources = resources.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  const total = await prisma.resource.count({ where: { type } });
  const missingCount = await prisma.resource.count({
    where: { type, OR: [{ seoTitle: null }, { seoTitle: "" }] },
  });
  const allTitles = await prisma.resource.findMany({
    where: { type },
    select: { seoTitle: true },
  });
  const shortCount = allTitles.filter(
    (r) => (r.seoTitle ?? "").length > 0 && (r.seoTitle ?? "").length < MIN,
  ).length;
  const longCount = allTitles.filter((r) => (r.seoTitle ?? "").length > MAX).length;

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Meta Titles"
        description="Edit the SEO title (the <title> tag) for every resource. Saves write directly to Shopify."
      />

      <div className="flex gap-1 mb-4">
        <ModeTab href="?mode=template" current={mode} value="template">
          Template
        </ModeTab>
        <ModeTab href="?mode=inline" current={mode} value="inline">
          Inline edit
        </ModeTab>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <BulkButton
          label={`Generate missing meta titles (${type})`}
          action={bulkGenerateMetaTitles.bind(null, type, true)}
        />
        <BulkButton
          label={`Generate too-short meta titles (${type})`}
          action={bulkGenerateMetaTitles.bind(null, type, "short")}
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <TypeTabs current={type} filter={filter} />
        <div className="ml-auto flex gap-2">
          <FilterPill type={type} filter="all" current={filter}>
            All ({total})
          </FilterPill>
          <FilterPill type={type} filter="missing" current={filter}>
            Missing ({missingCount})
          </FilterPill>
          <FilterPill type={type} filter="short" current={filter}>
            Too short ({shortCount})
          </FilterPill>
          <FilterPill type={type} filter="long" current={filter}>
            Too long ({longCount})
          </FilterPill>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 w-1/3">Resource</th>
              <th className="text-left px-4 py-2">SEO Title</th>
            </tr>
          </thead>
          <tbody>
            {resources.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                  Nothing matches.
                </td>
              </tr>
            ) : (
              resources.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 align-top"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 truncate">
                      {r.title || r.handle}
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
                  <td className="px-4 py-3">
                    <EditableCell
                      rowId={r.id}
                      initialValue={r.seoTitle ?? ""}
                      save={saveSeoTitle}
                      generate={generateSeoTitle}
                      optimalMin={MIN}
                      optimalMax={MAX}
                      placeholder={r.title ?? ""}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        hasNext={resources.length === PAGE_SIZE}
        type={type}
        filter={filter}
        basePath="/optimize/meta-titles"
      />
    </div>
  );
}

function ModeTab({
  href,
  current,
  value,
  children,
}: {
  href: string;
  current: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 text-sm font-medium rounded ${
        current === value
          ? "bg-indigo-600 text-white"
          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

export function TypeTabs({
  current,
  filter,
}: {
  current: string;
  filter: string;
}) {
  const types = ["product", "collection", "page", "article"] as const;
  return (
    <div className="flex gap-1">
      {types.map((t) => (
        <Link
          key={t}
          href={`?mode=inline&type=${t}&filter=${filter}`}
          className={`px-3 py-1 text-xs rounded-full border ${
            current === t
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-white border-slate-300 hover:bg-slate-50"
          }`}
        >
          {t === "product"
            ? "Products"
            : t === "collection"
              ? "Collections"
              : t === "page"
                ? "Pages"
                : "Articles"}
        </Link>
      ))}
    </div>
  );
}

export function FilterPill({
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
      href={`?mode=inline&type=${type}&filter=${filter}`}
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

export function Pagination({
  page,
  hasNext,
  type,
  filter,
  basePath,
}: {
  page: number;
  hasNext: boolean;
  type: string;
  filter: string;
  basePath: string;
}) {
  return (
    <div className="flex justify-between items-center mt-4 text-sm">
      <div className="text-slate-500">Page {page}</div>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={`${basePath}?mode=inline&type=${type}&filter=${filter}&page=${page - 1}`}
            className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            Prev
          </Link>
        )}
        {hasNext && (
          <Link
            href={`${basePath}?mode=inline&type=${type}&filter=${filter}&page=${page + 1}`}
            className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            Next
          </Link>
        )}
      </div>
    </div>
  );
}

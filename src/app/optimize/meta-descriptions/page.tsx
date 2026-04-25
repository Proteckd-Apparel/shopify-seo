import Link from "next/link";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { EditableCell } from "@/components/editable-cell";
import {
  bulkGenerateMetaDescriptions,
  generateSeoDescription,
  saveSeoDescription,
} from "../_actions";
import { TypeTabs, FilterPill, Pagination } from "../meta-titles/page";
import { BulkButton } from "@/components/bulk-button";
import { BulkProgressBar } from "@/components/bulk-progress-bar";
import {
  getTemplate,
  loadOptimizerConfig,
  type TemplateScopeKey,
} from "@/lib/optimizer-config";
import { MetaDescTemplateMode } from "./template-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const PAGE_SIZE = 50;
const MIN = 70;
const MAX = 160;

export default async function MetaDescriptionsPage({
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
      products: getTemplate(cfg, "metaDescription", "products"),
      collections: getTemplate(cfg, "metaDescription", "collections"),
      articles: getTemplate(cfg, "metaDescription", "articles"),
      pages: getTemplate(cfg, "metaDescription", "pages"),
    };
    return (
      <div>
        <PageHeader
          icon={FileText}
          title="Meta Descriptions"
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
        <MetaDescTemplateMode initialTemplates={initialTemplates} />
      </div>
    );
  }

  const where: Record<string, unknown> = { type };
  if (filter === "missing")
    where.OR = [{ seoDescription: null }, { seoDescription: "" }];

  let resources = await prisma.resource.findMany({
    where,
    orderBy: { title: "asc" },
    take: filter === "short" || filter === "long" ? 5000 : PAGE_SIZE,
    skip: filter === "short" || filter === "long" ? 0 : (page - 1) * PAGE_SIZE,
  });

  if (filter === "short") {
    resources = resources.filter(
      (r) =>
        (r.seoDescription ?? "").length > 0 &&
        (r.seoDescription ?? "").length < MIN,
    );
  } else if (filter === "long") {
    resources = resources.filter((r) => (r.seoDescription ?? "").length > MAX);
  }
  if (filter === "short" || filter === "long") {
    resources = resources.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  const total = await prisma.resource.count({ where: { type } });
  const missingCount = await prisma.resource.count({
    where: { type, OR: [{ seoDescription: null }, { seoDescription: "" }] },
  });
  const allDescs = await prisma.resource.findMany({
    where: { type },
    select: { seoDescription: true },
  });
  const shortCount = allDescs.filter(
    (r) => (r.seoDescription ?? "").length > 0 && (r.seoDescription ?? "").length < MIN,
  ).length;
  const longCount = allDescs.filter((r) => (r.seoDescription ?? "").length > MAX).length;

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Meta Descriptions"
        description="Edit the meta description row-by-row. Switch to Template mode for bulk."
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
          label={`Generate missing meta descriptions (${type})`}
          action={bulkGenerateMetaDescriptions.bind(null, type, true)}
          costOp="meta_description"
          estimatedRows={missingCount}
        />
        <BulkButton
          label={`Generate too-short meta descriptions (${type})`}
          action={bulkGenerateMetaDescriptions.bind(null, type, "short")}
          costOp="meta_description"
          estimatedRows={shortCount}
        />
        <BulkButton
          label={`Regenerate ALL meta descriptions (${type})`}
          action={bulkGenerateMetaDescriptions.bind(null, type, "all")}
          costOp="meta_description"
          estimatedRows={total}
        />
      </div>
      <BulkProgressBar kind="meta_descriptions" />

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
              <th className="text-left px-4 py-2">Meta Description</th>
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
                      initialValue={r.seoDescription ?? ""}
                      save={saveSeoDescription}
                      generate={generateSeoDescription}
                      multiline
                      optimalMin={MIN}
                      optimalMax={MAX}
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
        basePath="/optimize/meta-descriptions"
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

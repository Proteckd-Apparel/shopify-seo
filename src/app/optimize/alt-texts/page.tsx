import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { EditableCell } from "@/components/editable-cell";
import {
  bulkGenerateAltText,
  generateAltTextAction,
  saveAltText,
} from "../_actions";
import { BulkButton } from "@/components/bulk-button";
import { BulkProgressBar } from "@/components/bulk-progress-bar";
import {
  getTemplate,
  loadOptimizerConfig,
  type TemplateScopeKey,
} from "@/lib/optimizer-config";
import { AltTextsTemplateMode } from "./template-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const PAGE_SIZE = 50;

export default async function AltTextsPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; filter?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const mode = sp.mode ?? "template";
  const filter = sp.filter ?? "missing";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  const cfg = await loadOptimizerConfig();
  const initialTemplates: Record<TemplateScopeKey, ReturnType<typeof getTemplate>> = {
    products: getTemplate(cfg, "altText", "products"),
    collections: getTemplate(cfg, "altText", "collections"),
    articles: getTemplate(cfg, "altText", "articles"),
    pages: getTemplate(cfg, "altText", "pages"),
  };

  return (
    <div>
      <PageHeader
        icon={ImageIcon}
        title="Alt Texts"
        description="Generate alt text by template (bulk) or edit row-by-row."
      />

      <div className="flex gap-1 mb-4">
        <ModeTab href="?mode=template" current={mode} value="template">
          Template
        </ModeTab>
        <ModeTab href="?mode=inline" current={mode} value="inline">
          Inline edit
        </ModeTab>
      </div>

      {mode === "template" ? (
        <AltTextsTemplateMode initialTemplates={initialTemplates} />
      ) : (
        <InlineEditMode filter={filter} page={page} />
      )}
    </div>
  );
}

async function InlineEditMode({
  filter,
  page,
}: {
  filter: string;
  page: number;
}) {
  const where =
    filter === "missing"
      ? { OR: [{ altText: null }, { altText: "" }] }
      : filter === "set"
        ? { altText: { not: null } }
        : {};

  const images = await prisma.image.findMany({
    where,
    include: { resource: true },
    orderBy: { id: "asc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });

  const totalMissing = await prisma.image.count({
    where: { OR: [{ altText: null }, { altText: "" }] },
  });
  const total = await prisma.image.count();

  return (
    <>
      <div className="mb-4">
        <BulkButton
          label="Generate missing alt texts (AI)"
          action={bulkGenerateAltText.bind(null, true)}
        />
      </div>
      <BulkProgressBar kind="alt_text" />

      <div className="flex gap-2 mb-4 items-center">
        <Pill href="?mode=inline&filter=missing" current={filter} value="missing">
          Missing ({totalMissing})
        </Pill>
        <Pill href="?mode=inline&filter=set" current={filter} value="set">
          Set ({total - totalMissing})
        </Pill>
        <Pill href="?mode=inline&filter=all" current={filter} value="all">
          All ({total})
        </Pill>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 w-24">Image</th>
              <th className="text-left px-4 py-2 w-1/3">Resource</th>
              <th className="text-left px-4 py-2">Alt Text</th>
            </tr>
          </thead>
          <tbody>
            {images.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  Nothing matches.
                </td>
              </tr>
            ) : (
              images.map((img) => (
                <tr key={img.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${img.src}&width=80`}
                      alt={img.altText ?? ""}
                      className="w-16 h-16 object-cover rounded border border-slate-200"
                      loading="lazy"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 truncate">
                      {img.resource?.title ?? img.resource?.handle ?? "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {img.width}×{img.height}
                    </div>
                    {img.resource?.url && (
                      <a
                        href={img.resource.url}
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
                      rowId={img.id}
                      initialValue={img.altText ?? ""}
                      save={saveAltText}
                      generate={generateAltTextAction}
                      placeholder="Describe what's in the image…"
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4 text-sm">
        <div className="text-slate-500">Page {page}</div>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`?mode=inline&filter=${filter}&page=${page - 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Prev
            </Link>
          )}
          {images.length === PAGE_SIZE && (
            <Link
              href={`?mode=inline&filter=${filter}&page=${page + 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </>
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

function Pill({
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
      className={`px-3 py-1 text-xs rounded-full border ${
        current === value
          ? "bg-slate-900 text-white border-slate-900"
          : "bg-white border-slate-300 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

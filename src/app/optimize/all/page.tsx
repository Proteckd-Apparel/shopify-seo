import Link from "next/link";
import { Rocket, CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import {
  loadOptimizerConfig,
  type OptimizerConfig,
  type ResourceConfig,
} from "@/lib/optimizer-config";

import { RunButton } from "./run-button";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

type ResourceKey = "products" | "collections" | "articles" | "pages";

const FIELDS: Array<{ key: keyof ResourceConfig; label: string }> = [
  { key: "metaTitles", label: "Update meta titles" },
  { key: "metaDescriptions", label: "Update meta descriptions" },
  { key: "altTexts", label: "Update photo alt texts" },
  { key: "htmlText", label: "Update HTML descriptions" },
  { key: "titles", label: "Update titles" },
  { key: "urls", label: "Update URLs" },
  { key: "tags", label: "Update tags" },
  { key: "jsonLd", label: "Update JSON-LD" },
  { key: "jsonLdFaq", label: "Update JSON-LD FAQ" },
  { key: "photoFilenames", label: "Rename photo filenames" },
  { key: "resizePhotos", label: "Resize photos" },
  { key: "compressPhotos", label: "Compress photos" },
  { key: "translations", label: "Translations" },
];

export default async function OptimizeAllPage() {
  const cfg = await loadOptimizerConfig();

  const counts = {
    products: await prisma.resource.count({ where: { type: "product" } }),
    collections: await prisma.resource.count({ where: { type: "collection" } }),
    articles: await prisma.resource.count({ where: { type: "article" } }),
    pages: await prisma.resource.count({ where: { type: "page" } }),
  };

  const drafts = {
    products: await prisma.resource.count({
      where: { type: "product", status: "draft" },
    }),
    collections: 0,
    articles: await prisma.resource.count({
      where: { type: "article", status: "draft" },
    }),
    pages: await prisma.resource.count({
      where: { type: "page", status: "draft" },
    }),
  };

  return (
    <div>
      <PageHeader
        icon={Rocket}
        title="Optimize All"
        description="Confirm your settings, then run the optimizer across your store."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-6xl">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
            Active features
          </h2>

          {(["products", "collections", "articles", "pages"] as ResourceKey[]).map(
            (rk) => {
              const rc = cfg[rk];
              const total = counts[rk];
              const draftCount = drafts[rk];
              const willProcess =
                rc.scope === "all"
                  ? total
                  : rc.scope === "drafts"
                    ? draftCount
                    : total - draftCount;

              return (
                <ResourceCard
                  key={rk}
                  rk={rk}
                  cfg={rc}
                  willProcess={willProcess}
                  totalDrafts={draftCount}
                />
              );
            },
          )}

          {cfg.themeImages.enabled && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900">Theme Images</h3>
                <CheckBadge on />
              </div>
              <div className="space-y-1 text-sm pl-1">
                {cfg.themeImages.alt && <Yes>Update theme image alt texts</Yes>}
                {cfg.themeImages.compress && <Yes>Compress theme images</Yes>}
                {cfg.themeImages.resize && <Yes>Resize theme images</Yes>}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="font-semibold text-slate-900 mb-3">Run optimizer</h3>
            <p className="text-xs text-slate-500 mb-4">
              The optimizer will use your <Link href="/optimize/settings" className="text-indigo-600 hover:underline">settings</Link> and your <Link href="/ai/settings" className="text-indigo-600 hover:underline">AI rules</Link> to fill in missing fields. Existing values are preserved unless you enable <span className="font-mono text-[10px] bg-red-100 text-red-700 px-1 py-px rounded">OVERWRITE</span> on a setting.
            </p>

            <RunButton disabled={!cfg.masterAutoOptimize} />
            {!cfg.masterAutoOptimize && (
              <div className="text-[11px] text-center text-amber-600 mt-2">
                Enable the auto-optimize master switch in{" "}
                <Link href="/optimize/settings" className="underline">
                  optimizer settings
                </Link>{" "}
                first.
              </div>
            )}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-900">
            <div className="font-semibold mb-1">Tip</div>
            For the safest first run, enable only <strong>Meta Titles</strong> and{" "}
            <strong>Meta Descriptions</strong> with overwrite OFF. Review the
            results in the{" "}
            <Link href="/optimize/meta-titles" className="text-indigo-600 hover:underline">
              optimizer tables
            </Link>
            , then turn on more features once happy.
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceCard({
  rk,
  cfg,
  willProcess,
  totalDrafts,
}: {
  rk: ResourceKey;
  cfg: ResourceConfig;
  willProcess: number;
  totalDrafts: number;
}) {
  const enabledFields = FIELDS.filter((f) => cfg[f.key]);
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-900 capitalize">{rk}</h3>
        <CheckBadge on={cfg.enabled} />
      </div>
      {cfg.enabled ? (
        <div className="space-y-1 text-sm">
          <Yes strong>
            Process {willProcess} {rk}
          </Yes>
          {cfg.scope === "published" && totalDrafts > 0 && (
            <Yes>Skip {totalDrafts} unpublished items</Yes>
          )}
          {enabledFields.map((f) => {
            const overwriteKey = `${String(f.key)}Overwrite` as keyof ResourceConfig;
            const isOverwrite = !!cfg[overwriteKey];
            return (
              <Yes key={String(f.key)}>
                {f.label}
                {isOverwrite && (
                  <span className="ml-2 text-[9px] uppercase font-bold px-1 py-px rounded bg-red-100 text-red-700">
                    Overwrite
                  </span>
                )}
              </Yes>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-slate-500">Disabled</div>
      )}
    </div>
  );
}

function CheckBadge({ on }: { on: boolean }) {
  return on ? (
    <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-medium">
      ON
    </span>
  ) : (
    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
      OFF
    </span>
  );
}

function Yes({
  children,
  strong = false,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
      <span className={strong ? "text-slate-900 font-medium" : "text-slate-700"}>
        {children}
      </span>
    </div>
  );
}

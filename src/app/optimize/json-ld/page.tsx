import Link from "next/link";
import { Code2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { loadOptimizerConfig } from "@/lib/optimizer-config";
import { listArticleBlogHandles } from "./actions";
import { ProductsTab } from "./products-tab";
import { CollectionsTab } from "./collections-tab";
import { LocalBusinessTab } from "./localbusiness-tab";
import { OtherTab } from "./other-tab";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const TABS = [
  { key: "products", label: "Products" },
  { key: "collections", label: "Collections" },
  { key: "localbusiness", label: "LocalBusiness" },
  { key: "other", label: "Other" },
] as const;

export default async function JsonLdPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab ?? "products";
  const cfg = await loadOptimizerConfig();
  // Only fetch blog handles when the Other tab is active — it's a DB scan
  // over every article and nobody on other tabs needs the list.
  const blogHandles = tab === "other" ? await listArticleBlogHandles() : [];

  return (
    <div>
      <PageHeader
        icon={Code2}
        title="JSON-LD"
        description="Add schema.org structured data to your store. Improves Google Search visibility and rich results."
      />

      <div className="flex justify-center gap-1 mb-4">
        {TABS.map((t) => {
          const active = tab === t.key;
          const status =
            t.key === "products"
              ? cfg.jsonLd.products.enabled
              : t.key === "collections"
                ? cfg.jsonLd.collections.enabled
                : t.key === "localbusiness"
                  ? cfg.jsonLd.localBusiness.enabled
                  : Object.values(cfg.jsonLd.other).some(
                      (v) => typeof v === "boolean" && v,
                    );
          return (
            <Link
              key={t.key}
              href={`?tab=${t.key}`}
              className={`relative px-4 py-2 text-sm font-medium rounded ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
              <span
                className={`ml-2 inline-block w-2 h-2 rounded-full ${
                  status ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
            </Link>
          );
        })}
      </div>

      {tab === "products" && <ProductsTab initial={cfg.jsonLd.products} />}
      {tab === "collections" && (
        <CollectionsTab initial={cfg.jsonLd.collections} />
      )}
      {tab === "localbusiness" && (
        <LocalBusinessTab initial={cfg.jsonLd.localBusiness} />
      )}
      {tab === "other" && (
        <OtherTab initial={cfg.jsonLd.other} blogHandles={blogHandles} />
      )}
    </div>
  );
}

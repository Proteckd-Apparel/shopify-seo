import Link from "next/link";
import { Code2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { loadOptimizerConfig } from "@/lib/optimizer-config";
import { ProductsTab } from "./products-tab";

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
                  : Object.values(cfg.jsonLd.other).some((v) => v);
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
        <Stub message="Collections schema lives here next pass." />
      )}
      {tab === "localbusiness" && (
        <Stub message="LocalBusiness form lives here next pass." />
      )}
      {tab === "other" && (
        <Stub message="WebSite / Organization / Article / Blog / Breadcrumb toggles live here next pass." />
      )}
    </div>
  );
}

function Stub({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 max-w-3xl">
      {message}
    </div>
  );
}

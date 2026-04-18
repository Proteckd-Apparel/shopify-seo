import Link from "next/link";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { BulkGenerateButton } from "./bulk-button";
import { RowActions } from "./row-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function MerchantCopyPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));

  const [products, activeCount] = await Promise.all([
    prisma.resource.findMany({
      where: { type: "product" },
      orderBy: { title: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      select: {
        id: true,
        title: true,
        handle: true,
        url: true,
        productType: true,
      },
    }),
    prisma.resource.count({
      where: { type: "product", status: { in: ["active", "ACTIVE"] } },
    }),
  ]);

  const feedUrl = "/feeds/google-shopping-supplemental.xml";

  return (
    <div>
      <PageHeader
        icon={ShieldCheck}
        title="Merchant Copy"
        description="Google-safe product copy for Merchant Center — keeps your website copy untouched."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4">
        <h3 className="font-semibold mb-1">How this works</h3>
        <p className="text-xs text-slate-600 mb-3">
          Google Merchant Center blocks products that make health-related
          claims (EMF Protection, Shield from radiation, etc.). This page
          generates clean, policy-compliant titles + descriptions per product
          and stores them on a Shopify metafield{" "}
          <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">
            custom.google_merchant_copy
          </code>
          . The{" "}
          <a
            href={feedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline inline-flex items-center gap-1"
          >
            supplemental feed <ExternalLink className="w-3 h-3" />
          </a>{" "}
          serves that copy to Merchant Center while your storefront keeps the
          original, brand-voice copy.
        </p>
        <div className="border-t border-slate-100 pt-3 mt-3">
          <div className="text-xs text-slate-600 mb-1">
            Supplemental feed URL (submit this in Merchant Center → Data
            sources → Add supplemental feed):
          </div>
          <code className="block text-xs font-mono text-slate-700 bg-slate-50 border border-slate-100 rounded px-2 py-1 break-all">
            https://www.proteckd.com/apps/proteckd-seo/feeds/google-shopping-supplemental.xml
          </code>
        </div>
      </div>

      <BulkGenerateButton productCount={activeCount} />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Product</th>
              <th className="text-left px-4 py-2 w-40">Type</th>
              <th className="text-left px-4 py-2 w-32">Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 truncate">
                    {p.title ?? p.handle ?? "—"}
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
                <td className="px-4 py-3 text-xs text-slate-500">
                  {p.productType ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <RowActions productId={p.id} />
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
              href={`?page=${page - 1}`}
              className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50"
            >
              Prev
            </Link>
          )}
          {products.length === PAGE_SIZE && (
            <Link
              href={`?page=${page + 1}`}
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

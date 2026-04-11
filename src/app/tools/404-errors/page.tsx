import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function FourOhFourPage() {
  // We approximate "404 errors" as resources that have a handle but no
  // online store URL — meaning Shopify can't render them. The richer source
  // would be GSC's coverage report (Phase 7).
  const orphans = await prisma.resource.findMany({
    where: {
      type: "product",
      OR: [{ url: null }, { url: "" }],
      status: "active",
    },
    take: 200,
    orderBy: { title: "asc" },
  });

  return (
    <div>
      <PageHeader
        icon={AlertCircle}
        title="404 Errors"
        description="Active products with no published storefront URL — these are likely returning 404s."
      />

      {orphans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No 404 candidates from local data. Connect Google Search Console
          (Phase 7) for the authoritative list.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden max-w-3xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Resource</th>
                <th className="text-left px-4 py-2">Handle</th>
              </tr>
            </thead>
            <tbody>
              {orphans.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{r.title ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.handle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

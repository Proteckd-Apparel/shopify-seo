import { AlertCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

const SEVERITY_CLASS: Record<string, string> = {
  error: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  info: "bg-slate-100 text-slate-600",
};

export default async function ScanIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; severity?: string }>;
}) {
  const sp = await searchParams;

  const issues = await prisma.issue.findMany({
    where: {
      ...(sp.category ? { category: sp.category } : {}),
      ...(sp.severity ? { severity: sp.severity } : {}),
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: { resource: true },
  });

  const counts = await prisma.issue.groupBy({
    by: ["category"],
    _count: true,
    orderBy: { category: "asc" },
  });

  return (
    <div>
      <PageHeader
        icon={AlertCircle}
        title="Scan Issues"
        description="Issues found in the latest scan, grouped by category."
      />

      {counts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No issues yet. Run a scan first.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            <a
              href="/analytics/scan-issues"
              className="text-xs px-2 py-1 rounded-full border border-slate-300 bg-white hover:bg-slate-50"
            >
              All ({counts.reduce((s, c) => s + c._count, 0)})
            </a>
            {counts.map((c) => (
              <a
                key={c.category}
                href={`/analytics/scan-issues?category=${c.category}`}
                className={`text-xs px-2 py-1 rounded-full border ${
                  sp.category === c.category
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "border-slate-300 bg-white hover:bg-slate-50"
                }`}
              >
                {c.category} ({c._count})
              </a>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Severity</th>
                  <th className="text-left px-4 py-2">Category</th>
                  <th className="text-left px-4 py-2">Resource</th>
                  <th className="text-left px-4 py-2">Message</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((i) => (
                  <tr
                    key={i.id}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2">
                      <span
                        className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${
                          SEVERITY_CLASS[i.severity] ?? ""
                        }`}
                      >
                        {i.severity}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{i.category}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {i.resource ? (
                        i.resource.url ? (
                          <a
                            href={i.resource.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline"
                          >
                            {i.resource.title ?? i.resource.handle}
                          </a>
                        ) : (
                          (i.resource.title ?? i.resource.handle ?? i.resource.id)
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{i.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {issues.length === 500 && (
            <div className="mt-3 text-xs text-slate-500">
              Showing first 500 issues. Filter by category to narrow.
            </div>
          )}
        </>
      )}
    </div>
  );
}

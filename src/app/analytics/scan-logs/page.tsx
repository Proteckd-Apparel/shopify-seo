import { ClipboardList } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ScanLogsPage() {
  const runs = await prisma.scanRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
  });

  return (
    <div>
      <PageHeader
        icon={ClipboardList}
        title="Scan Logs"
        description="History of every scan run."
      />

      {runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No scans yet.
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map((r) => (
            <details
              key={r.id}
              className="bg-white border border-slate-200 rounded-lg"
            >
              <summary className="cursor-pointer px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-slate-900">
                    {new Date(r.startedAt).toLocaleString()}
                  </span>
                  <span className="ml-2 text-xs uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {r.status}
                  </span>
                </div>
                <div className="text-slate-500">
                  {r.totalPages} resources · {r.totalIssues} issues
                </div>
              </summary>
              {r.log && (
                <pre className="text-xs bg-slate-50 border-t border-slate-100 p-3 overflow-x-auto whitespace-pre-wrap text-slate-600 max-h-80">
                  {r.log}
                </pre>
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

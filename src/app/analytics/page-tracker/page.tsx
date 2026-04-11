import { Eye } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

// Page Tracker shows the most-recently-modified resources, plus a list of
// recent optimizations from the audit log. Lets you eyeball what's been
// touched lately.

export default async function PageTrackerPage() {
  const [recentOpts, recentResources] = await Promise.all([
    prisma.optimization.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { resource: true },
    }),
    prisma.resource.findMany({
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div>
      <PageHeader
        icon={Eye}
        title="Page Tracker"
        description="Recent activity on your store: edits made by this app and the most recently changed resources."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
            Recent optimizations
          </h2>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Resource</th>
                  <th className="text-left px-3 py-2">Field</th>
                  <th className="text-left px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {recentOpts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      No optimizations yet.
                    </td>
                  </tr>
                ) : (
                  recentOpts.map((o) => (
                    <tr key={o.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 truncate max-w-[180px]">
                        {o.resource?.title ?? o.resource?.handle}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">{o.field}</td>
                      <td className="px-3 py-2 text-xs">
                        {o.source === "ai" ? (
                          <span className="text-violet-600">ai</span>
                        ) : (
                          o.source
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
            Recently updated resources
          </h2>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Resource</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentResources.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 truncate max-w-[200px]">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          {r.title ?? r.handle}
                        </a>
                      ) : (
                        (r.title ?? r.handle)
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.type}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {new Date(r.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

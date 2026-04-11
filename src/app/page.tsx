import Link from "next/link";
import { NAV } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Activity, Database, Image as ImageIcon, AlertCircle } from "lucide-react";

export default async function HomePage() {
  const [resourceCount, imageCount, lastScan, openIssues] = await Promise.all([
    prisma.resource.count(),
    prisma.image.count(),
    prisma.scanRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.issue.count({ where: { fixed: false } }),
  ]);

  const stats = [
    { label: "Resources", value: resourceCount, icon: Database },
    { label: "Images", value: imageCount, icon: ImageIcon },
    { label: "Open Issues", value: openIssues, icon: AlertCircle },
    {
      label: "Last Scan",
      value: lastScan ? new Date(lastScan.startedAt).toLocaleDateString() : "—",
      icon: Activity,
    },
  ];

  return (
    <div>
      <PageHeader
        title="SEO Dashboard"
        description="Headline numbers for your store. Run a scan to populate."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.label}
              className="bg-white rounded-lg border border-slate-200 p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-slate-500">
                  {s.label}
                </span>
                <Icon className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-2xl font-semibold mt-2">{s.value}</div>
            </div>
          );
        })}
      </div>

      <h2 className="text-lg font-semibold text-slate-900 mb-3">Modules</h2>
      <div className="space-y-6">
        {NAV.map((section) => {
          const SectionIcon = section.icon;
          return (
            <section key={section.slug}>
              <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-slate-700 uppercase tracking-wider">
                <SectionIcon className="w-4 h-4 text-indigo-600" />
                {section.title}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.slug}
                      href={`/${section.slug}/${item.slug}`}
                      className="group bg-white rounded-lg border border-slate-200 p-3 hover:border-indigo-400 hover:shadow-sm transition flex items-start gap-3"
                    >
                      <div className="w-8 h-8 rounded-md bg-indigo-50 grid place-items-center shrink-0 group-hover:bg-indigo-100">
                        <Icon className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {item.title}
                          {item.premium && (
                            <span className="ml-1 text-[9px] px-1 py-px rounded bg-amber-100 text-amber-700 font-semibold">
                              PRO
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 line-clamp-2">
                          {item.description}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

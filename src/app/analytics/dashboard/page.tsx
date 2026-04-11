import {
  Layout,
  AlertCircle,
  Database,
  Image as ImageIcon,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { computeStats, type StatCard } from "@/lib/stats";

export const dynamic = "force-dynamic";

const TONE_CLASS: Record<string, string> = {
  good: "bg-emerald-50 border-emerald-200",
  bad: "bg-red-50 border-red-200",
  neutral: "bg-white border-slate-200",
};

export default async function DashboardPage() {
  const [totalResources, totalImages, openIssues, lastScan, statGroups, issueByCategory] =
    await Promise.all([
      prisma.resource.count(),
      prisma.image.count(),
      prisma.issue.count({ where: { fixed: false } }),
      prisma.scanRun.findFirst({ orderBy: { startedAt: "desc" } }),
      computeStats(),
      prisma.issue.groupBy({
        by: ["category"],
        _count: true,
        orderBy: { _count: { category: "desc" } },
      }),
    ]);

  return (
    <div>
      <PageHeader
        icon={Layout}
        title="SEO Dashboard"
        description="Aggregate stats from your latest scan."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Total Resources" value={totalResources} icon={Database} />
        <Stat label="Images" value={totalImages} icon={ImageIcon} />
        <Stat label="Open Issues" value={openIssues} icon={AlertCircle} />
        <Stat
          label="Last Scan"
          value={
            lastScan
              ? new Date(lastScan.startedAt).toLocaleDateString()
              : "Never"
          }
          icon={Activity}
        />
      </div>

      {issueByCategory.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Issues by Category
          </h2>
          <div className="flex flex-wrap gap-2">
            {issueByCategory.map((c) => (
              <Link
                key={c.category}
                href={`/analytics/scan-issues?category=${c.category}`}
                className="text-xs px-3 py-1.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{c._count}</span>{" "}
                <span className="text-slate-600">{c.category}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-8">
        {statGroups.map((group) => {
          const grouped = groupCards(group.cards);
          return (
            <section key={group.scope}>
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-3">
                {group.scope}
              </h2>
              <div className="space-y-4">
                {Object.entries(grouped).map(([sub, cards]) => (
                  <div key={sub}>
                    {sub !== "_root" && (
                      <div className="text-xs uppercase text-slate-500 tracking-wider mb-2">
                        {sub}
                      </div>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {cards.map((c) => (
                        <CardCell key={c.label} card={c} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function groupCards(cards: StatCard[]): Record<string, StatCard[]> {
  const out: Record<string, StatCard[]> = { _root: [] };
  for (const c of cards) {
    const key = c.group ?? "_root";
    (out[key] ??= []).push(c);
  }
  return out;
}

function CardCell({ card }: { card: StatCard }) {
  const tone = TONE_CLASS[card.tone ?? "neutral"];
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="text-xl font-semibold text-slate-900">{card.value}</div>
      <div className="text-xs text-slate-600 mt-1 leading-tight">
        {card.label}
      </div>
      {card.hint && (
        <div className="text-[10px] text-slate-400 mt-1">{card.hint}</div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof Database;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">
          {label}
        </span>
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}

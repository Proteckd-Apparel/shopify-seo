import { ListChecks, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

type Check = {
  label: string;
  passed: boolean;
  warning?: boolean;
  detail: string;
  link?: string;
};

export default async function ChecklistPage() {
  const [
    settings,
    productCount,
    productsMissingTitle,
    productsMissingDesc,
    imagesMissingAlt,
    lowResImages,
    lastScan,
    hasRedirects,
    activeProducts,
  ] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.resource.count({ where: { type: "product" } }),
    prisma.resource.count({
      where: {
        type: "product",
        OR: [{ seoTitle: null }, { seoTitle: "" }],
      },
    }),
    prisma.resource.count({
      where: {
        type: "product",
        OR: [{ seoDescription: null }, { seoDescription: "" }],
      },
    }),
    prisma.image.count({ where: { OR: [{ altText: null }, { altText: "" }] } }),
    prisma.image.count({ where: { width: { lt: 800 } } }),
    prisma.scanRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.resource.count({ where: { type: "product", url: { not: null } } }),
    prisma.resource.count({ where: { type: "product", status: "active" } }),
  ]);

  const checks: Check[] = [
    {
      label: "Shopify connected",
      passed: !!settings?.shopDomain && !!settings?.shopifyToken,
      detail: settings?.shopDomain ?? "Not connected",
      link: "/settings",
    },
    {
      label: "Anthropic key set",
      passed: !!settings?.anthropicKey,
      warning: true,
      detail: settings?.anthropicKey ? "Configured" : "Optional but enables AI",
      link: "/settings",
    },
    {
      label: "Has scanned recently",
      passed:
        !!lastScan &&
        Date.now() - new Date(lastScan.startedAt).getTime() < 7 * 86400_000,
      detail: lastScan
        ? new Date(lastScan.startedAt).toLocaleString()
        : "Never scanned",
      link: "/analytics/scan",
    },
    {
      label: "All products have meta titles",
      passed: productsMissingTitle === 0,
      detail:
        productsMissingTitle === 0
          ? "All set"
          : `${productsMissingTitle} of ${productCount} missing`,
      link: "/optimize/meta-titles?filter=missing",
    },
    {
      label: "All products have meta descriptions",
      passed: productsMissingDesc === 0,
      detail:
        productsMissingDesc === 0
          ? "All set"
          : `${productsMissingDesc} of ${productCount} missing`,
      link: "/optimize/meta-descriptions?filter=missing",
    },
    {
      label: "All images have alt text",
      passed: imagesMissingAlt === 0,
      detail:
        imagesMissingAlt === 0
          ? "All set"
          : `${imagesMissingAlt} images missing alt`,
      link: "/optimize/alt-texts?mode=inline&filter=missing",
    },
    {
      label: "No low-resolution images",
      passed: lowResImages === 0,
      warning: true,
      detail:
        lowResImages === 0 ? "All ≥ 800px" : `${lowResImages} below 800px`,
      link: "/products/low-resolution-photos",
    },
    {
      label: "Active products are published",
      passed: activeProducts > 0,
      detail: `${activeProducts} active products`,
    },
    {
      label: "URL redirects in place",
      passed: hasRedirects > 0,
      warning: true,
      detail: "Add redirects for old URLs to preserve SEO juice",
      link: "/tools/redirects",
    },
  ];

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed && !c.warning).length;
  const warned = checks.filter((c) => !c.passed && c.warning).length;
  const score = Math.round((passed / checks.length) * 100);

  return (
    <div>
      <PageHeader
        icon={ListChecks}
        title="SEO Checklist"
        description="Health checks for your store. Click any item to fix it."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-6 max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-4xl font-bold text-slate-900">{score}%</div>
            <div className="text-sm text-slate-500">SEO health</div>
          </div>
          <div className="text-right text-xs space-y-1">
            <div className="text-emerald-700">{passed} passed</div>
            <div className="text-red-700">{failed} failed</div>
            <div className="text-amber-700">{warned} warnings</div>
          </div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      <div className="space-y-2 max-w-3xl">
        {checks.map((c, i) => {
          const Icon = c.passed
            ? CheckCircle2
            : c.warning
              ? AlertCircle
              : XCircle;
          const tone = c.passed
            ? "text-emerald-600 bg-emerald-50 border-emerald-200"
            : c.warning
              ? "text-amber-700 bg-amber-50 border-amber-200"
              : "text-red-700 bg-red-50 border-red-200";
          const inner = (
            <div
              className={`flex items-start gap-3 p-3 rounded-lg border ${tone}`}
            >
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900">{c.label}</div>
                <div className="text-xs text-slate-600">{c.detail}</div>
              </div>
            </div>
          );
          return c.link ? (
            <Link key={i} href={c.link} className="block hover:opacity-90">
              {inner}
            </Link>
          ) : (
            <div key={i}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

import { Search } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ScanButton } from "./scan-button";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function ScanPage() {
  const lastScan = await prisma.scanRun.findFirst({
    orderBy: { startedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        icon={Search}
        title="Scan"
        description="Crawl every product, collection, page and article and grade them."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-2xl">
        <h3 className="text-base font-semibold text-slate-900">Run a scan</h3>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Pulls every resource from Shopify, caches them locally, and detects
          missing/short SEO fields, missing alt text, low-resolution images,
          and thin content.
        </p>
        <ScanButton />

        {lastScan && (
          <div className="mt-6 border-t border-slate-100 pt-4 text-sm text-slate-600 space-y-1">
            <div>
              <span className="font-medium text-slate-900">Last scan:</span>{" "}
              {new Date(lastScan.startedAt).toLocaleString()} (
              {lastScan.status})
            </div>
            <div>
              <span className="font-medium text-slate-900">Resources:</span>{" "}
              {lastScan.totalPages} ·{" "}
              <span className="font-medium text-slate-900">Issues:</span>{" "}
              {lastScan.totalIssues}
            </div>
            <div className="pt-2 flex gap-3">
              <Link
                href="/analytics/scan-issues"
                className="text-indigo-600 hover:underline"
              >
                View issues →
              </Link>
              <Link
                href="/analytics/scan-logs"
                className="text-indigo-600 hover:underline"
              >
                View scan log →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

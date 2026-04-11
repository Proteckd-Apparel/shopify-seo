import Link from "next/link";
import { prisma } from "@/lib/prisma";

export async function TopBar() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const connected = !!(settings?.shopDomain && settings?.shopifyToken);

  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="text-sm text-slate-500">
        {connected ? (
          <span>
            Connected to{" "}
            <span className="font-medium text-slate-900">
              {settings?.shopDomain}
            </span>
          </span>
        ) : (
          <Link
            href="/settings"
            className="text-indigo-600 hover:underline font-medium"
          >
            Connect your Shopify store →
          </Link>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/analytics/scan"
          className="px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
        >
          Scan
        </Link>
        <Link
          href="/optimize/all"
          className="px-3 py-1.5 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:opacity-95"
        >
          Optimize All
        </Link>
      </div>
    </header>
  );
}

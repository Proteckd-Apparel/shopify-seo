import { ShoppingBag, ExternalLink, Copy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function GoogleShoppingPage() {
  const total = await prisma.resource.count({ where: { type: "product" } });
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  // Build the URL of our generated feed
  const feedUrl = "/feeds/google-shopping.xml";

  return (
    <div>
      <PageHeader
        icon={ShoppingBag}
        title="Google Shopping"
        description="Generates a Google Merchant Center XML feed from your product catalog."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4">
        <h3 className="font-semibold text-slate-900 mb-2">Your feed URL</h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs font-mono break-all">
            {settings?.shopDomain
              ? `https://shopify-seo-production.up.railway.app${feedUrl}`
              : "Configure Shopify in /settings first"}
          </code>
          <a
            href={feedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
          >
            <ExternalLink className="w-4 h-4" /> Open
          </a>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          {total} products will be included.
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl">
        <h3 className="font-semibold text-slate-900 mb-2">How to submit</h3>
        <ol className="text-sm text-slate-700 space-y-2 list-decimal list-inside">
          <li>
            Open{" "}
            <a
              href="https://merchants.google.com"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:underline"
            >
              Google Merchant Center
            </a>{" "}
            and click <strong>Products → Feeds → +</strong>
          </li>
          <li>Choose your country and language</li>
          <li>
            Choose <strong>Scheduled fetch</strong> as the input method
          </li>
          <li>Paste the feed URL above</li>
          <li>Set fetch frequency to <strong>Daily</strong></li>
          <li>Save — Google will pull your products on schedule</li>
        </ol>
      </div>
    </div>
  );
}

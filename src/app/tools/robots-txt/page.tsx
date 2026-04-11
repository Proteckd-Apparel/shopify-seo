import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function RobotsTxtPage() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const domain = settings?.shopDomain ?? "your-store.myshopify.com";
  let body = "Could not fetch — make sure /settings is configured.";
  try {
    const r = await fetch(`https://${domain}/robots.txt`, {
      cache: "no-store",
    });
    body = await r.text();
  } catch {}

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Robots.txt"
        description="View your live robots.txt and how to customize it."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-6">
        <h3 className="font-semibold mb-2">Current robots.txt</h3>
        <pre className="bg-slate-50 border border-slate-100 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-96">
          {body}
        </pre>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 max-w-3xl text-sm">
        <h3 className="font-semibold mb-2 text-amber-900">How to edit</h3>
        <p className="text-amber-800 mb-2">
          Shopify generates robots.txt automatically. To customize it, edit the{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">
            robots.txt.liquid
          </code>{" "}
          file in your theme:
        </p>
        <ol className="text-amber-800 list-decimal list-inside space-y-1">
          <li>Shopify admin → Online Store → Themes</li>
          <li>Actions → Edit code on your live theme</li>
          <li>
            Templates → Add a new template →{" "}
            <code className="font-mono bg-amber-100 px-1 rounded">robots</code>{" "}
            → Liquid
          </li>
          <li>Customize, save, and the live robots.txt updates immediately</li>
        </ol>
      </div>
    </div>
  );
}

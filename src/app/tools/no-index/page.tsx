import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function NoIndexPage() {
  return (
    <div>
      <PageHeader
        icon={Lock}
        title="No-Index"
        description="Mark pages as noindex via theme code."
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 max-w-3xl text-sm text-amber-900">
        <h3 className="font-semibold mb-2">Shopify and noindex</h3>
        <p className="mb-3">
          Shopify doesn&apos;t expose a per-resource noindex flag in the Admin
          API. To noindex a page, you have to add a Liquid conditional in your
          theme&apos;s <code className="font-mono bg-amber-100 px-1 rounded">theme.liquid</code> head:
        </p>
        <pre className="bg-amber-100 border border-amber-200 rounded p-3 text-xs font-mono overflow-x-auto">
{`{% if request.path contains '/pages/legal' %}
  <meta name="robots" content="noindex">
{% endif %}`}
        </pre>
        <p className="mt-3 text-xs">
          Or use a tag-based approach: tag products with{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">noindex</code>,
          then check{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">
            {"{% if product.tags contains 'noindex' %}"}
          </code>{" "}
          in your product template.
        </p>
      </div>
    </div>
  );
}

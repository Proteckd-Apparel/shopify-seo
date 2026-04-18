import { Zap, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { indexNowKeyLocation } from "@/lib/indexnow";
import { IndexNowControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function IndexNowPage() {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const keyLocation = indexNowKeyLocation();
  const keyPresent = Boolean(s?.indexNowKey);
  const lastSubmittedAt = s?.indexNowLastSubmittedAt;
  const lastCount = s?.indexNowLastSubmittedCount ?? null;
  const lastError = s?.indexNowLastError ?? null;
  const enabled = s?.indexNowEnabled ?? true;

  return (
    <div>
      <PageHeader
        icon={Zap}
        title="IndexNow"
        description="Notify Bing, Yandex, and Seznam the instant your store content changes."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4">
        <h3 className="font-semibold mb-2">How it works</h3>
        <p className="text-sm text-slate-600">
          IndexNow lets you push URL changes to participating search engines
          instead of waiting for them to crawl. On every scan completion we
          submit your active products, collections, pages and articles. You
          can also trigger a manual submission below.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4">
        <h3 className="font-semibold mb-3">Status</h3>
        <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">Enabled</dt>
          <dd className={enabled ? "text-emerald-600" : "text-slate-600"}>
            {enabled ? "Yes" : "No"}
          </dd>
          <dt className="text-slate-500">Key file</dt>
          <dd>
            {keyPresent && keyLocation ? (
              <a
                href={keyLocation}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-mono text-xs break-all"
              >
                {keyLocation}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            ) : keyPresent && !keyLocation ? (
              <span className="text-amber-600 text-xs">
                Set SHOPIFY_APP_PROXY_URL in Railway env so Bing can reach the
                key file.
              </span>
            ) : (
              <span className="text-slate-500 text-xs">
                Not generated yet — run a scan or click Submit now.
              </span>
            )}
          </dd>
          <dt className="text-slate-500">Last submission</dt>
          <dd className="text-slate-700">
            {lastSubmittedAt
              ? `${lastSubmittedAt.toLocaleString()} (${lastCount ?? 0} URLs)`
              : "Never"}
          </dd>
          {lastError && (
            <>
              <dt className="text-slate-500">Last error</dt>
              <dd className="text-red-600 text-xs font-mono">{lastError}</dd>
            </>
          )}
        </dl>
      </div>

      <IndexNowControls enabled={enabled} />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-3xl text-xs text-amber-900 mt-4">
        <strong>Setup:</strong> the key file is served via the existing
        App Proxy, so no new Shopify redirect is needed. Just make sure{" "}
        <code className="bg-amber-100 px-1 rounded font-mono">
          SHOPIFY_APP_PROXY_URL
        </code>{" "}
        is set in Railway (e.g.{" "}
        <code className="bg-amber-100 px-1 rounded font-mono">
          https://www.proteckd.com/apps/proteckd-seo
        </code>
        ).
      </div>
    </div>
  );
}

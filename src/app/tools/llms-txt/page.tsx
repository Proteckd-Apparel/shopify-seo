import { Brain, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function LlmsTxtPage() {
  const url = "/feeds/llms.txt";
  let preview = "";
  try {
    const r = await fetch(
      `${process.env.RAILWAY_STATIC_URL ? "https://" + process.env.RAILWAY_STATIC_URL : "http://localhost:3000"}${url}`,
      { cache: "no-store" },
    );
    preview = await r.text();
  } catch {}

  return (
    <div>
      <PageHeader
        icon={Brain}
        title="LLMs.txt"
        description="Generate an llms.txt file describing your store for LLM crawlers."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Generated llms.txt</h3>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
          >
            <ExternalLink className="w-4 h-4" /> Open
          </a>
        </div>
        <pre className="bg-slate-50 border border-slate-100 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-96">
          {preview.slice(0, 4000) || "Loading…"}
        </pre>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl text-sm text-slate-700 space-y-3">
        <h3 className="font-semibold text-slate-900">
          Serve this at /llms.txt on your store
        </h3>
        <p>
          LLM crawlers look for <code className="bg-slate-100 px-1 rounded font-mono">llms.txt</code> at
          your store&apos;s root. Your Shopify App Proxy is already configured
          (same one the sitemaps use), so just add a redirect:
        </p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            In Shopify admin → <strong>Online Store</strong> →{" "}
            <strong>Navigation</strong> → <strong>URL Redirects</strong>,
            create/update the redirect:
            <ul className="list-disc pl-5 mt-1 text-xs">
              <li>From: <code className="bg-slate-100 px-1 rounded font-mono">/llms.txt</code></li>
              <li>
                To:{" "}
                <code className="bg-slate-100 px-1 rounded font-mono">
                  /apps/proteckd-seo/feeds/llms.txt
                </code>
              </li>
            </ul>
          </li>
          <li>
            Verify at{" "}
            <code className="bg-slate-100 px-1 rounded font-mono">
              https://yourstore.com/llms.txt
            </code>
            . Once it loads, remove the IndexGPT app.
          </li>
        </ol>
        <p className="text-xs text-slate-500">
          The file regenerates on every request from your scanned Shopify data,
          so it stays current as catalog and blogs change.
        </p>
      </div>
    </div>
  );
}

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

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-3xl text-xs text-amber-900">
        To make LLM crawlers find this, you need to host it on your store
        domain. Either: (1) add a redirect from{" "}
        <code className="bg-amber-100 px-1 rounded font-mono">/llms.txt</code>{" "}
        on your Shopify store to this URL, or (2) copy the contents into a
        Shopify page at the path /pages/llms-txt and link to it from your
        footer / robots.txt.
      </div>
    </div>
  );
}

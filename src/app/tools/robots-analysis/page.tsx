import { Bot } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RobotsAnalysisRunner } from "./controls";

export const dynamic = "force-dynamic";

export default function RobotsAnalysisPage() {
  return (
    <div>
      <PageHeader
        icon={Bot}
        title="Robots.txt Analysis"
        description="Check whether AI crawlers like GPTBot, ClaudeBot, and PerplexityBot can access your store."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-900 mb-2">How it works</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Fetches your live robots.txt from the storefront domain.</li>
          <li>
            Parses it and simulates a request from each major AI crawler
            against representative paths (homepage, product, collection, page,
            blog article).
          </li>
          <li>
            Flags any crawler that&apos;s fully or partially blocked, and
            shows exactly which rule is blocking which path.
          </li>
        </ol>
      </div>

      <RobotsAnalysisRunner />
    </div>
  );
}

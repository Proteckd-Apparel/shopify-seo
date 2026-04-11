import { FileCode } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { loadOptimizerConfig } from "@/lib/optimizer-config";
import { CleanupForm } from "./cleanup-form";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function MainHtmlTextPage() {
  const cfg = await loadOptimizerConfig();
  return (
    <div>
      <PageHeader
        icon={FileCode}
        title="Main HTML Text"
        description="Clean up the body HTML of products / collections / articles / pages. Deterministic by default, AI rewrite optional."
      />
      <CleanupForm initial={cfg.htmlCleanup} />
    </div>
  );
}

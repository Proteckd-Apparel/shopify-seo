import { LinkIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  getTemplate,
  loadOptimizerConfig,
  type TemplateScopeKey,
  type UrlOptimizerConfig,
} from "@/lib/optimizer-config";
import { UrlForm } from "./url-form";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function UrlsPage() {
  const cfg = await loadOptimizerConfig();
  const initialTemplates: Record<TemplateScopeKey, ReturnType<typeof getTemplate>> = {
    products: getTemplate(cfg, "url", "products"),
    collections: getTemplate(cfg, "url", "collections"),
    articles: getTemplate(cfg, "url", "articles"),
    pages: getTemplate(cfg, "url", "pages"),
  };
  const initialConfigs: Record<TemplateScopeKey, UrlOptimizerConfig> = {
    products: cfg.urls.products,
    collections: cfg.urls.collections,
    articles: cfg.urls.articles,
    pages: cfg.urls.pages,
  };
  return (
    <div>
      <PageHeader
        icon={LinkIcon}
        title="URLs"
        description="Rewrite product / collection / article / page handles. Shopify auto-creates 301 redirects so old URLs keep working."
      />
      <UrlForm
        initialTemplates={initialTemplates}
        initialConfigs={initialConfigs}
      />
    </div>
  );
}

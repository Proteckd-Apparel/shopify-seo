import { FileText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  getTemplate,
  loadOptimizerConfig,
  type TemplateScopeKey,
  type TitleOptimizerConfig,
} from "@/lib/optimizer-config";
import { TitleForm } from "./title-form";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function TitlesPage() {
  const cfg = await loadOptimizerConfig();
  const initialTemplates: Record<TemplateScopeKey, ReturnType<typeof getTemplate>> = {
    products: getTemplate(cfg, "title", "products"),
    collections: getTemplate(cfg, "title", "collections"),
    articles: getTemplate(cfg, "title", "articles"),
    pages: getTemplate(cfg, "title", "pages"),
  };
  const initialConfigs: Record<TemplateScopeKey, TitleOptimizerConfig> = {
    products: cfg.titles.products,
    collections: cfg.titles.collections,
    articles: cfg.titles.articles,
    pages: cfg.titles.pages,
  };
  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Titles"
        description="Edit the REAL customer-visible titles (H1, product cards, cart, order emails) — not meta titles."
      />
      <TitleForm
        initialTemplates={initialTemplates}
        initialConfigs={initialConfigs}
      />
    </div>
  );
}

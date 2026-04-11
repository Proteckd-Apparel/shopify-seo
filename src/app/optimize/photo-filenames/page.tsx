import { FileImage } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  getTemplate,
  loadOptimizerConfig,
  type TemplateScopeKey,
} from "@/lib/optimizer-config";
import { PhotoFilenamesForm } from "./template-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

export default async function PhotoFilenamesPage() {
  const cfg = await loadOptimizerConfig();
  const initialTemplates: Record<TemplateScopeKey, ReturnType<typeof getTemplate>> = {
    products: getTemplate(cfg, "photoFilename", "products"),
    collections: getTemplate(cfg, "photoFilename", "collections"),
    articles: getTemplate(cfg, "photoFilename", "articles"),
    pages: getTemplate(cfg, "photoFilename", "pages"),
  };
  return (
    <div>
      <PageHeader
        icon={FileImage}
        title="Photo Filenames"
        description="Rename product images to SEO-friendly slugs based on a template. File swap pipeline included."
      />
      <PhotoFilenamesForm
        initialTemplates={initialTemplates}
        initialConfigs={{
          products: cfg.photoFilenames.products,
          collections: cfg.photoFilenames.collections,
          articles: cfg.photoFilenames.articles,
        }}
      />
    </div>
  );
}

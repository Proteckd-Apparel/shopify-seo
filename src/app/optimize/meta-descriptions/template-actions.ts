"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  loadOptimizerConfig,
  saveOptimizerConfig,
  setTemplate,
  type TemplateScopeKey,
} from "@/lib/optimizer-config";
import {
  renderTemplate,
  type TemplateConfig,
} from "@/lib/template-engine";
import { updateResourceSeo } from "@/lib/shopify-mutate";

const SINGULAR: Record<TemplateScopeKey, string> = {
  products: "product",
  collections: "collection",
  articles: "article",
  pages: "page",
};

export async function saveMetaDescTemplate(
  scope: TemplateScopeKey,
  template: TemplateConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await loadOptimizerConfig();
    const next = setTemplate(cfg, "metaDescription", scope, template);
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/meta-descriptions");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function previewMetaDescTemplate(
  scope: TemplateScopeKey,
  template: TemplateConfig,
): Promise<{
  ok: boolean;
  sample?: {
    resourceId: string;
    title: string;
    currentValue: string | null;
    newValue: string;
  };
  message?: string;
}> {
  try {
    const r = await prisma.resource.findFirst({
      where: { type: SINGULAR[scope] },
    });
    if (!r) return { ok: false, message: "No resources to preview" };
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const newValue = renderTemplate(template, {
      resource: r,
      shopName: settings?.shopDomain ?? "",
    });
    return {
      ok: true,
      sample: {
        resourceId: r.id,
        title: r.title ?? r.handle ?? "",
        currentValue: r.seoDescription,
        newValue,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export type BulkResult = {
  ok: boolean;
  processed: number;
  saved: number;
  failed: number;
  message: string;
};

export async function bulkApplyMetaDescTemplate(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  overwriteExisting: boolean,
  scopeFilter: "all" | "published" | "drafts",
): Promise<BulkResult> {
  let processed = 0;
  let saved = 0;
  let failed = 0;

  const where: Record<string, unknown> = { type: SINGULAR[scope] };
  if (scopeFilter === "published") where.status = { not: "draft" };
  else if (scopeFilter === "drafts") where.status = "draft";

  const skipRows = await prisma.skipPage.findMany({
    where: { type: SINGULAR[scope] },
    select: { resourceId: true },
  });
  const skippedIds = new Set(
    skipRows.map((s) => s.resourceId).filter(Boolean) as string[],
  );

  const resources = await prisma.resource.findMany({
    where,
    take: 5000,
  });

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  for (const r of resources) {
    if (skippedIds.has(r.id)) continue;
    const has = (r.seoDescription ?? "").trim().length > 0;
    if (has && !overwriteExisting) continue;
    processed++;
    try {
      const newValue = renderTemplate(template, {
        resource: r,
        shopName: settings?.shopDomain ?? "",
      });
      if (newValue) {
        await updateResourceSeo(
          r.id,
          r.type,
          { seoDescription: newValue },
          "rule",
        );
        saved++;
      }
    } catch {
      failed++;
    }
  }

  revalidatePath("/optimize/meta-descriptions");

  return {
    ok: failed === 0,
    processed,
    saved,
    failed,
    message: `Processed ${processed} (saved ${saved}, failed ${failed})`,
  };
}

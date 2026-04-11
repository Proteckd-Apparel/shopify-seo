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
  stringToTokens,
  tokensToString,
  type TemplateConfig,
} from "@/lib/template-engine";
import { updateImageAlt } from "@/lib/shopify-mutate";

const SINGULAR: Record<TemplateScopeKey, string> = {
  products: "product",
  collections: "collection",
  articles: "article",
  pages: "page",
};

export async function saveAltTemplate(
  scope: TemplateScopeKey,
  template: TemplateConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await loadOptimizerConfig();
    const next = setTemplate(cfg, "altText", scope, template);
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/alt-texts");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// Server-side preview: pick a sample resource and render the template.
export async function previewAltTemplate(
  scope: TemplateScopeKey,
  template: TemplateConfig,
): Promise<{
  ok: boolean;
  sample?: {
    resourceId: string;
    title: string;
    imageId: string;
    imageSrc: string;
    currentAlt: string | null;
    newAlt: string;
  };
  message?: string;
}> {
  try {
    const r = await prisma.resource.findFirst({
      where: { type: SINGULAR[scope] },
      include: { images: { take: 1 } },
    });
    if (!r || r.images.length === 0) {
      return { ok: false, message: "No resources with images to preview" };
    }
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const newAlt = renderTemplate(template, {
      resource: r,
      image: r.images[0],
      imagePosition: 1,
      shopName: settings?.shopDomain ?? "",
    });
    return {
      ok: true,
      sample: {
        resourceId: r.id,
        title: r.title ?? r.handle ?? "",
        imageId: r.images[0].id,
        imageSrc: r.images[0].src,
        currentAlt: r.images[0].altText,
        newAlt,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export type BulkAltResult = {
  ok: boolean;
  processed: number;
  saved: number;
  failed: number;
  message: string;
};

export async function bulkApplyAltTemplate(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  overwriteExisting: boolean,
  scopeFilter: "all" | "published" | "drafts",
): Promise<BulkAltResult> {
  let processed = 0;
  let saved = 0;
  let failed = 0;

  const where: Record<string, unknown> = { type: SINGULAR[scope] };
  if (scopeFilter === "published") where.status = { not: "draft" };
  else if (scopeFilter === "drafts") where.status = "draft";

  // Skip the resources marked as skipped
  const skipRows = await prisma.skipPage.findMany({
    where: { type: SINGULAR[scope] },
    select: { resourceId: true },
  });
  const skippedIds = new Set(
    skipRows.map((s) => s.resourceId).filter(Boolean) as string[],
  );

  const resources = await prisma.resource.findMany({
    where,
    include: { images: true },
    take: 1000,
  });

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  for (const r of resources) {
    if (skippedIds.has(r.id)) continue;
    for (let i = 0; i < r.images.length; i++) {
      const img = r.images[i];
      const has = (img.altText ?? "").trim().length > 0;
      if (has && !overwriteExisting) continue;
      processed++;
      try {
        const newAlt = renderTemplate(template, {
          resource: r,
          image: img,
          imagePosition: i + 1,
          shopName: settings?.shopDomain ?? "",
        });
        if (newAlt) {
          await updateImageAlt(img.id, newAlt, "rule");
          saved++;
        }
      } catch {
        failed++;
      }
    }
  }

  revalidatePath("/optimize/alt-texts");

  return {
    ok: failed === 0,
    processed,
    saved,
    failed,
    message: `Processed ${processed} (saved ${saved}, failed ${failed})`,
  };
}

// Re-export string helpers so the client form can convert.
export async function tokenizeServer(s: string) {
  return stringToTokens(s);
}
export async function stringifyServer(tokens: ReturnType<typeof stringToTokens>) {
  return tokensToString(tokens);
}

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

export type DescPreviewSample = {
  resourceId: string;
  title: string;
  imageUrl: string | null;
  currentValue: string | null;
  newValue: string;
  index: number;
  total: number;
};

export async function previewMetaDescTemplate(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  index = 0,
): Promise<{
  ok: boolean;
  sample?: DescPreviewSample;
  message?: string;
}> {
  try {
    const where = { type: SINGULAR[scope] };
    const total = await prisma.resource.count({ where });
    if (total === 0) return { ok: false, message: "No resources to preview" };
    const safe = ((index % total) + total) % total;
    const r = await prisma.resource.findFirst({
      where,
      orderBy: { title: "asc" },
      include: { images: { take: 1 } },
      skip: safe,
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
        imageUrl: r.images[0]?.src ?? null,
        currentValue: r.seoDescription,
        newValue,
        index: safe,
        total,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function previewMetaDescForResource(
  template: TemplateConfig,
  resourceId: string,
): Promise<{ ok: boolean; sample?: DescPreviewSample; message?: string }> {
  try {
    const r = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { images: { take: 1 } },
    });
    if (!r) return { ok: false, message: "Resource not found" };
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
        imageUrl: r.images[0]?.src ?? null,
        currentValue: r.seoDescription,
        newValue,
        index: 0,
        total: 1,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function applyMetaDescToOne(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  resourceId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r) return { ok: false, message: "Resource not found" };
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const newValue = renderTemplate(template, {
      resource: r,
      shopName: settings?.shopDomain ?? "",
    });
    if (!newValue) return { ok: false, message: "Template rendered empty" };
    await updateResourceSeo(
      r.id,
      r.type,
      { seoDescription: newValue },
      "rule",
    );
    revalidatePath("/optimize/meta-descriptions");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function restoreLastMetaDescRun(
  scope: TemplateScopeKey,
  windowMinutes = 60,
): Promise<{ ok: boolean; message: string; reverted: number; failed: number }> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const opts = await prisma.optimization.findMany({
      where: {
        field: "seoDescription",
        createdAt: { gte: since },
        resource: { type: SINGULAR[scope] },
      },
      orderBy: { createdAt: "desc" },
      include: { resource: true },
    });
    if (opts.length === 0) {
      return {
        ok: true,
        message: `No meta description changes in the last ${windowMinutes} min`,
        reverted: 0,
        failed: 0,
      };
    }
    const seen = new Set<string>();
    const dedup = opts.filter((o) => {
      if (seen.has(o.resourceId)) return false;
      seen.add(o.resourceId);
      return true;
    });
    let reverted = 0;
    let failed = 0;
    for (const o of dedup) {
      if (!o.resource) {
        failed++;
        continue;
      }
      try {
        await updateResourceSeo(
          o.resourceId,
          o.resource.type,
          { seoDescription: o.oldValue },
          "rule",
        );
        reverted++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/optimize/meta-descriptions");
    return {
      ok: failed === 0,
      message: `Restored ${reverted}, failed ${failed}`,
      reverted,
      failed,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed",
      reverted: 0,
      failed: 0,
    };
  }
}

export async function searchResourcesForDescPicker(
  scope: TemplateScopeKey,
  q: string,
) {
  if (q.length < 2) return [];
  const rows = await prisma.resource.findMany({
    where: {
      type: SINGULAR[scope],
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { handle: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 15,
    orderBy: { title: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    handle: r.handle ?? "",
  }));
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

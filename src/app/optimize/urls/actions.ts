"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  loadOptimizerConfig,
  saveOptimizerConfig,
  setTemplate,
  type TemplateScopeKey,
  type UrlOptimizerConfig,
} from "@/lib/optimizer-config";
import {
  renderTemplate,
  type TemplateConfig,
} from "@/lib/template-engine";
import { slugify } from "@/lib/filename-slug";
import { updateResourceHandle } from "@/lib/shopify-mutate";

const SINGULAR: Record<TemplateScopeKey, string> = {
  products: "product",
  collections: "collection",
  articles: "article",
  pages: "page",
};

// Map resource type to its storefront path so we can show full URLs in the
// preview (not just handles).
function resourcePath(type: string, handle: string): string {
  if (type === "product") return `/products/${handle}`;
  if (type === "collection") return `/collections/${handle}`;
  if (type === "article") return `/blogs/news/${handle}`;
  if (type === "page") return `/pages/${handle}`;
  return `/${handle}`;
}

// ---------- Settings ----------

export async function saveUrlSettings(
  scope: TemplateScopeKey,
  cfgPatch: Partial<UrlOptimizerConfig>,
  template: TemplateConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const full = await loadOptimizerConfig();
    const next = setTemplate(full, "url", scope, template);
    next.urls = {
      ...next.urls,
      [scope]: { ...next.urls[scope], ...cfgPatch },
    };
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/urls");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Preview ----------

export type UrlPreview = {
  resourceId: string;
  productTitle: string;
  imageUrl: string | null;
  currentUrl: string;
  newUrl: string;
  currentHandle: string;
  newHandle: string;
  index: number;
  total: number;
};

function buildSlug(
  templateOutput: string,
  cfg: UrlOptimizerConfig,
): string {
  return slugify(templateOutput, {
    maxChars: cfg.maxChars,
    removeDuplicateWords: cfg.removeDuplicateWords,
    removeSmallWords: cfg.removeSmallWords,
  });
}

export async function previewUrl(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  cfg: UrlOptimizerConfig,
  index = 0,
): Promise<{ ok: boolean; sample?: UrlPreview; message?: string }> {
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
    if (!r) return { ok: false, message: "No resources" };

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const baseUrl = `https://${settings?.shopDomain ?? "example.com"}`;
    const rendered =
      template.tokens.length > 0
        ? renderTemplate(template, {
            resource: r,
            shopName: settings?.shopDomain ?? "",
          })
        : (r.title ?? r.handle ?? "");
    const newSlug = buildSlug(rendered, cfg);

    return {
      ok: true,
      sample: {
        resourceId: r.id,
        productTitle: r.title ?? r.handle ?? "",
        imageUrl: r.images[0]?.src ?? null,
        currentUrl: `${baseUrl}${resourcePath(r.type, r.handle ?? "")}`,
        newUrl: `${baseUrl}${resourcePath(r.type, newSlug)}`,
        currentHandle: r.handle ?? "",
        newHandle: newSlug,
        index: safe,
        total,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function previewUrlForResource(
  template: TemplateConfig,
  cfg: UrlOptimizerConfig,
  resourceId: string,
): Promise<{ ok: boolean; sample?: UrlPreview; message?: string }> {
  try {
    const r = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { images: { take: 1 } },
    });
    if (!r) return { ok: false, message: "Resource not found" };
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const baseUrl = `https://${settings?.shopDomain ?? "example.com"}`;
    const rendered =
      template.tokens.length > 0
        ? renderTemplate(template, {
            resource: r,
            shopName: settings?.shopDomain ?? "",
          })
        : (r.title ?? r.handle ?? "");
    const newSlug = buildSlug(rendered, cfg);
    return {
      ok: true,
      sample: {
        resourceId: r.id,
        productTitle: r.title ?? r.handle ?? "",
        imageUrl: r.images[0]?.src ?? null,
        currentUrl: `${baseUrl}${resourcePath(r.type, r.handle ?? "")}`,
        newUrl: `${baseUrl}${resourcePath(r.type, newSlug)}`,
        currentHandle: r.handle ?? "",
        newHandle: newSlug,
        index: 0,
        total: 1,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply ----------

export async function applyUrlToOne(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  cfg: UrlOptimizerConfig,
  resourceId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r) return { ok: false, message: "Resource not found" };
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const rendered =
      template.tokens.length > 0
        ? renderTemplate(template, {
            resource: r,
            shopName: settings?.shopDomain ?? "",
          })
        : (r.title ?? r.handle ?? "");
    const newSlug = buildSlug(rendered, cfg);
    if (!newSlug) return { ok: false, message: "Template rendered empty" };
    if (newSlug === r.handle) return { ok: true, message: "No change needed" };
    await updateResourceHandle(r.id, r.type, newSlug, "rule");
    revalidatePath("/optimize/urls");
    return {
      ok: true,
      message: `Updated. Shopify auto-created a 301 from /${r.handle}.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Bulk apply ----------

export type BulkResult = {
  ok: boolean;
  message: string;
  processed: number;
  saved: number;
  failed: number;
  skipped: number;
};

export async function bulkApplyUrls(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  cfg: UrlOptimizerConfig,
): Promise<BulkResult> {
  if (!cfg.enabled)
    return {
      ok: false,
      message: "URLs tab is disabled — toggle Activate ON first",
      processed: 0,
      saved: 0,
      failed: 0,
      skipped: 0,
    };

  const where: Record<string, unknown> = { type: SINGULAR[scope] };
  if (cfg.scope === "published") where.status = { not: "draft" };
  else if (cfg.scope === "drafts") where.status = "draft";

  const skipRows = await prisma.skipPage.findMany({
    where: { type: SINGULAR[scope] },
    select: { resourceId: true },
  });
  const skippedIds = new Set(
    skipRows.map((s) => s.resourceId).filter(Boolean) as string[],
  );

  const resources = await prisma.resource.findMany({
    where,
    take: 200, // safety cap — handles changes are slow + irreversible cleanup
  });
  const items = resources.filter((r) => !skippedIds.has(r.id));

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  // Skip resources whose handle was changed in the last 30 days. Each
  // handle change creates a Shopify 301 from old → new; chaining a second
  // change creates 301a → 301b → current, which Google penalizes past 2
  // hops. Building the lookup map up front (one query) is cheaper than
  // querying per-resource inside the loop.
  const recentHandleChanges = await prisma.optimization.findMany({
    where: {
      field: "handle",
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      resourceId: { in: items.map((r) => r.id) },
    },
    select: { resourceId: true },
  });
  const recentlyChanged = new Set(recentHandleChanges.map((o) => o.resourceId));

  let processed = 0;
  let saved = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of items) {
    processed++;
    try {
      if (recentlyChanged.has(r.id)) {
        // Handle changed within the last 30 days — refuse to chain.
        skipped++;
        continue;
      }
      const rendered =
        template.tokens.length > 0
          ? renderTemplate(template, {
              resource: r,
              shopName: settings?.shopDomain ?? "",
            })
          : (r.title ?? r.handle ?? "");
      const newSlug = buildSlug(rendered, cfg);
      if (!newSlug) {
        skipped++;
        continue;
      }
      if (newSlug === r.handle) {
        skipped++;
        continue;
      }
      // Honor "Overwrite Existing" — if OFF, only rewrite handles that are
      // longer than the cap (i.e. need cleanup) instead of every handle.
      if (
        !cfg.overwriteExisting &&
        r.handle &&
        r.handle.length <= cfg.maxChars
      ) {
        skipped++;
        continue;
      }
      await updateResourceHandle(r.id, r.type, newSlug, "rule");
      saved++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/optimize/urls");
  return {
    ok: failed === 0,
    message: `Processed ${processed} (saved ${saved}, skipped ${skipped}, failed ${failed})${
      processed === 200 ? " — hit 200 cap, run again for more" : ""
    }. Shopify auto-created 301 redirects.`,
    processed,
    saved,
    failed,
    skipped,
  };
}

// ---------- Restore ----------

export async function restoreLastUrlRun(
  scope: TemplateScopeKey,
  windowMinutes = 60,
): Promise<{
  ok: boolean;
  message: string;
  reverted: number;
  failed: number;
}> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const opts = await prisma.optimization.findMany({
      where: {
        field: "handle",
        createdAt: { gte: since },
        resource: { type: SINGULAR[scope] },
      },
      orderBy: { createdAt: "desc" },
      include: { resource: true },
    });
    if (opts.length === 0) {
      return {
        ok: true,
        message: `No handle changes in the last ${windowMinutes} min`,
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
      if (!o.resource || !o.oldValue) {
        failed++;
        continue;
      }
      try {
        await updateResourceHandle(
          o.resourceId,
          o.resource.type,
          o.oldValue,
          "rule",
        );
        reverted++;
      } catch {
        failed++;
      }
    }
    revalidatePath("/optimize/urls");
    return {
      ok: failed === 0,
      message: `Restored ${reverted}, failed ${failed}. Shopify auto-created reverse redirects.`,
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

// ---------- Picker search ----------

export async function searchResourcesForUrlPicker(
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

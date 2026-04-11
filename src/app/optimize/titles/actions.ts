"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  loadOptimizerConfig,
  saveOptimizerConfig,
  setTemplate,
  type TemplateScopeKey,
  type TitleOptimizerConfig,
} from "@/lib/optimizer-config";
import {
  renderTemplate,
  type TemplateConfig,
} from "@/lib/template-engine";
import { updateResourceTitle } from "@/lib/shopify-mutate";
import { getAnthropic, MODELS } from "@/lib/anthropic";

const SINGULAR: Record<TemplateScopeKey, string> = {
  products: "product",
  collections: "collection",
  articles: "article",
  pages: "page",
};

// ---------- Cleanup helpers ----------

function cleanupTitle(input: string, cfg: TitleOptimizerConfig): string {
  let s = input;
  if (cfg.removeBrTags) {
    s = s.replace(/<br\s*\/?>/gi, " ");
    // Also strip any other HTML tags that snuck in
    s = s.replace(/<[^>]+>/g, " ");
  }
  if (cfg.clearWhitespace) {
    s = s.replace(/\s+/g, " ").trim();
  }
  return s;
}

async function aiRewriteTitle(
  current: string,
  resourceTitle: string,
  instructions: string,
): Promise<string> {
  const client = await getAnthropic();
  if (!client) throw new Error("Anthropic key not configured");
  const cfg = await loadOptimizerConfig();
  const brand = cfg.notes ? `\n\nBrand voice / rules:\n${cfg.notes}` : "";
  const system = `You rewrite ecommerce product titles for SEO. Output ONLY the new title — no quotes, no markdown, no commentary, no period at the end. Hard rules:
- Preserve all factual claims (sizes, colors, materials, brand, model numbers)
- Improve scannability and keyword placement
- Title case
- Do not invent features${brand}${instructions ? `\n\nExtra instructions:\n${instructions}` : ""}`;
  const user = `Current title: ${current}\nProduct context: ${resourceTitle}`;
  const res = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 200,
    system,
    messages: [{ role: "user", content: user }],
  });
  let out = "";
  for (const block of res.content) {
    if (block.type === "text") out += block.text;
  }
  return out
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .trim();
}

// ---------- Settings ----------

export async function saveTitleSettings(
  scope: TemplateScopeKey,
  cfgPatch: Partial<TitleOptimizerConfig>,
  template: TemplateConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const full = await loadOptimizerConfig();
    const next = setTemplate(full, "title", scope, template);
    next.titles = {
      ...next.titles,
      [scope]: { ...next.titles[scope], ...cfgPatch },
    };
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/titles");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Preview ----------

export type TitlePreview = {
  resourceId: string;
  productTitle: string;
  imageUrl: string | null;
  currentValue: string;
  newValue: string;
  index: number;
  total: number;
};

export async function previewTitle(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  cfg: TitleOptimizerConfig,
  index = 0,
): Promise<{ ok: boolean; sample?: TitlePreview; message?: string }> {
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
    const current = r.title ?? "";

    // Render template (if any tokens) → otherwise just clean up the existing title
    const rendered = template.tokens.length > 0
      ? renderTemplate(template, {
          resource: r,
          shopName: settings?.shopDomain ?? "",
        })
      : current;

    let next = cleanupTitle(rendered, cfg);

    if (cfg.aiRewrite) {
      try {
        next = await aiRewriteTitle(next, r.title ?? "", cfg.aiInstructions);
      } catch (e) {
        return {
          ok: false,
          message: `Cleanup OK but AI failed: ${e instanceof Error ? e.message : "?"}`,
        };
      }
    }

    return {
      ok: true,
      sample: {
        resourceId: r.id,
        productTitle: r.title ?? r.handle ?? "",
        imageUrl: r.images[0]?.src ?? null,
        currentValue: current,
        newValue: next,
        index: safe,
        total,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function previewTitleForResource(
  template: TemplateConfig,
  cfg: TitleOptimizerConfig,
  resourceId: string,
): Promise<{ ok: boolean; sample?: TitlePreview; message?: string }> {
  try {
    const r = await prisma.resource.findUnique({
      where: { id: resourceId },
      include: { images: { take: 1 } },
    });
    if (!r) return { ok: false, message: "Resource not found" };
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const current = r.title ?? "";
    const rendered = template.tokens.length > 0
      ? renderTemplate(template, {
          resource: r,
          shopName: settings?.shopDomain ?? "",
        })
      : current;
    let next = cleanupTitle(rendered, cfg);
    if (cfg.aiRewrite) {
      next = await aiRewriteTitle(next, r.title ?? "", cfg.aiInstructions);
    }
    return {
      ok: true,
      sample: {
        resourceId: r.id,
        productTitle: r.title ?? r.handle ?? "",
        imageUrl: r.images[0]?.src ?? null,
        currentValue: current,
        newValue: next,
        index: 0,
        total: 1,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply one ----------

export async function applyTitleToOne(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  cfg: TitleOptimizerConfig,
  resourceId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r) return { ok: false, message: "Resource not found" };
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const rendered = template.tokens.length > 0
      ? renderTemplate(template, {
          resource: r,
          shopName: settings?.shopDomain ?? "",
        })
      : r.title ?? "";
    let next = cleanupTitle(rendered, cfg);
    if (cfg.aiRewrite) {
      next = await aiRewriteTitle(next, r.title ?? "", cfg.aiInstructions);
    }
    if (!next) return { ok: false, message: "Rendered empty title" };
    if (next === r.title) return { ok: true, message: "No change needed" };
    await updateResourceTitle(
      r.id,
      r.type,
      next,
      cfg.aiRewrite ? "ai" : "rule",
      cfg.aiRewrite ? "claude-haiku-4-5" : undefined,
    );
    revalidatePath("/optimize/titles");
    return { ok: true, message: "Saved" };
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
};

export async function bulkApplyTitles(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  cfg: TitleOptimizerConfig,
): Promise<BulkResult> {
  if (!cfg.enabled)
    return {
      ok: false,
      message: "Titles tab is disabled — toggle Activate ON first",
      processed: 0,
      saved: 0,
      failed: 0,
    };

  const where: Record<string, unknown> = { type: SINGULAR[scope] };
  if (cfg.scope === "published") where.status = { not: "draft" };
  else if (cfg.scope === "drafts") where.status = "draft";

  const skipRows = await prisma.skipPage.findMany({
    where: { type: SINGULAR[scope] },
    select: { resourceId: true },
  });
  const skipped = new Set(
    skipRows.map((s) => s.resourceId).filter(Boolean) as string[],
  );

  const all = await prisma.resource.findMany({
    where,
    take: cfg.aiRewrite ? 100 : 5000,
  });
  const items = all.filter((r) => !skipped.has(r.id));

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  let processed = 0;
  let saved = 0;
  let failed = 0;

  for (const r of items) {
    processed++;
    try {
      const rendered = template.tokens.length > 0
        ? renderTemplate(template, {
            resource: r,
            shopName: settings?.shopDomain ?? "",
          })
        : r.title ?? "";
      let next = cleanupTitle(rendered, cfg);
      if (cfg.aiRewrite) {
        next = await aiRewriteTitle(next, r.title ?? "", cfg.aiInstructions);
      }
      if (!next || next === r.title) continue;
      await updateResourceTitle(
        r.id,
        r.type,
        next,
        cfg.aiRewrite ? "ai" : "rule",
        cfg.aiRewrite ? "claude-haiku-4-5" : undefined,
      );
      saved++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/optimize/titles");
  return {
    ok: failed === 0,
    message: `Processed ${processed} (saved ${saved}, failed ${failed})${
      cfg.aiRewrite && items.length === 100
        ? " — AI cap reached, run again for more"
        : ""
    }`,
    processed,
    saved,
    failed,
  };
}

// ---------- Restore ----------

export async function restoreLastTitleRun(
  scope: TemplateScopeKey,
  windowMinutes = 60,
): Promise<{ ok: boolean; message: string; reverted: number; failed: number }> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const opts = await prisma.optimization.findMany({
      where: {
        field: "title",
        createdAt: { gte: since },
        resource: { type: SINGULAR[scope] },
      },
      orderBy: { createdAt: "desc" },
      include: { resource: true },
    });
    if (opts.length === 0) {
      return {
        ok: true,
        message: `No title changes in the last ${windowMinutes} min`,
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
        await updateResourceTitle(
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
    revalidatePath("/optimize/titles");
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

// ---------- Picker search ----------

export async function searchResourcesForTitlePicker(
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

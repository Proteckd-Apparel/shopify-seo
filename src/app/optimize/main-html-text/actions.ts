"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  loadOptimizerConfig,
  saveOptimizerConfig,
  type HtmlCleanupConfig,
  type OptimizerConfig,
} from "@/lib/optimizer-config";
import { cleanupHtml } from "@/lib/html-cleanup";
import { updateResourceBodyHtml } from "@/lib/shopify-mutate";
import { getAnthropic, MODELS } from "@/lib/anthropic";

const SINGULAR: Record<string, string> = {
  products: "product",
  collections: "collection",
  articles: "article",
  pages: "page",
};

type Scope = keyof OptimizerConfig["htmlCleanup"];

export async function saveCleanupConfig(
  scope: Scope,
  patch: Partial<HtmlCleanupConfig>,
): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await loadOptimizerConfig();
    const next = {
      ...cfg,
      htmlCleanup: {
        ...cfg.htmlCleanup,
        [scope]: { ...cfg.htmlCleanup[scope], ...patch },
      },
    };
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/main-html-text");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

async function aiRewrite(
  resourceTitle: string,
  html: string,
  instructions: string,
): Promise<string> {
  const client = await getAnthropic();
  if (!client) throw new Error("Anthropic key not configured");
  const cfg = await loadOptimizerConfig();
  const brand = cfg.notes ? `\n\nBrand voice / rules:\n${cfg.notes}` : "";
  const system = `You are an SEO copywriter improving an ecommerce product description. Output ONLY the rewritten HTML — no markdown, no commentary, no code fences. Hard rules:
- Preserve the original meaning, all factual claims, all numbers, prices, sizes
- Keep the same HTML structure (headings, lists, paragraphs)
- Improve readability, scannability, keyword density
- Do not invent features that aren't already in the source${brand}${instructions ? `\n\nExtra instructions:\n${instructions}` : ""}`;
  const user = `Resource title: ${resourceTitle}\n\nOriginal HTML:\n${html}`;
  const res = await client.messages.create({
    model: MODELS.fast,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });
  let out = "";
  for (const block of res.content) {
    if (block.type === "text") out += block.text;
  }
  out = out.trim().replace(/^```(?:html)?/i, "").replace(/```$/i, "").trim();
  return out;
}

export type CleanupPreview = {
  ok: boolean;
  message?: string;
  resourceId?: string;
  title?: string;
  before?: string;
  after?: string;
  changes?: Record<string, number>;
};

export async function previewCleanup(
  scope: Scope,
  resourceId?: string,
): Promise<CleanupPreview> {
  try {
    const cfg = await loadOptimizerConfig();
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const shopHost = settings?.shopDomain ?? "";

    const where: Record<string, unknown> = { type: SINGULAR[scope] };
    if (cfg.htmlCleanup[scope].scope === "published")
      where.status = { not: "draft" };
    else if (cfg.htmlCleanup[scope].scope === "drafts") where.status = "draft";

    const r = resourceId
      ? await prisma.resource.findUnique({ where: { id: resourceId } })
      : await prisma.resource.findFirst({ where });
    if (!r || !r.bodyHtml) {
      return { ok: false, message: "No resource with body HTML found" };
    }

    let after = cleanupHtml(
      r.bodyHtml,
      cfg.htmlCleanup[scope],
      shopHost,
      r.title ?? "",
    );

    if (cfg.htmlCleanup[scope].aiRewrite) {
      try {
        const rewritten = await aiRewrite(
          r.title ?? "",
          after.html,
          cfg.htmlCleanup[scope].aiInstructions,
        );
        after = {
          html: rewritten,
          changes: { ...after.changes },
        };
      } catch (e) {
        return {
          ok: false,
          message: `Cleanup OK but AI rewrite failed: ${e instanceof Error ? e.message : "?"}`,
        };
      }
    }

    return {
      ok: true,
      resourceId: r.id,
      title: r.title ?? "",
      before: r.bodyHtml,
      after: after.html,
      changes: after.changes,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export type ApplyResult = {
  ok: boolean;
  message: string;
  processed?: number;
  saved?: number;
  failed?: number;
};

export async function applyCleanupToOne(
  scope: Scope,
  resourceId: string,
): Promise<ApplyResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const shopHost = settings?.shopDomain ?? "";

    const r = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r || !r.bodyHtml)
      return { ok: false, message: "Resource has no body HTML" };

    let result = cleanupHtml(
      r.bodyHtml,
      cfg.htmlCleanup[scope],
      shopHost,
      r.title ?? "",
    );

    if (cfg.htmlCleanup[scope].aiRewrite) {
      try {
        const rewritten = await aiRewrite(
          r.title ?? "",
          result.html,
          cfg.htmlCleanup[scope].aiInstructions,
        );
        result = { html: rewritten, changes: result.changes };
      } catch (e) {
        return {
          ok: false,
          message: `AI rewrite failed: ${e instanceof Error ? e.message : "?"}`,
        };
      }
    }

    if (result.html === r.bodyHtml) {
      return { ok: true, message: "No changes to apply" };
    }

    await updateResourceBodyHtml(
      r.id,
      r.type,
      result.html,
      cfg.htmlCleanup[scope].aiRewrite ? "ai" : "rule",
      cfg.htmlCleanup[scope].aiRewrite ? "claude-haiku-4-5" : undefined,
    );

    return { ok: true, message: "Updated", processed: 1, saved: 1, failed: 0 };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function applyCleanupToAll(scope: Scope): Promise<ApplyResult> {
  try {
    const cfg = await loadOptimizerConfig();
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const shopHost = settings?.shopDomain ?? "";
    const tcfg = cfg.htmlCleanup[scope];

    if (!tcfg.enabled)
      return { ok: false, message: `${scope} cleanup is disabled` };

    const where: Record<string, unknown> = { type: SINGULAR[scope] };
    if (tcfg.scope === "published") where.status = { not: "draft" };
    else if (tcfg.scope === "drafts") where.status = "draft";

    // Skip rules respect
    const skipRows = await prisma.skipPage.findMany({
      where: { type: SINGULAR[scope] },
      select: { resourceId: true },
    });
    const skipped = new Set(
      skipRows.map((s) => s.resourceId).filter(Boolean) as string[],
    );

    const all = await prisma.resource.findMany({
      where,
      take: tcfg.aiRewrite ? 100 : 5000, // safety cap on AI runs
    });
    const items = all.filter((r) => r.bodyHtml && !skipped.has(r.id));

    let saved = 0;
    let failed = 0;
    for (const r of items) {
      try {
        let result = cleanupHtml(
          r.bodyHtml ?? "",
          tcfg,
          shopHost,
          r.title ?? "",
        );
        if (tcfg.aiRewrite) {
          const rewritten = await aiRewrite(
            r.title ?? "",
            result.html,
            tcfg.aiInstructions,
          );
          result = { html: rewritten, changes: result.changes };
        }
        if (result.html === r.bodyHtml) continue;
        await updateResourceBodyHtml(
          r.id,
          r.type,
          result.html,
          tcfg.aiRewrite ? "ai" : "rule",
          tcfg.aiRewrite ? "claude-haiku-4-5" : undefined,
        );
        saved++;
      } catch {
        failed++;
      }
    }

    revalidatePath("/optimize/main-html-text");
    return {
      ok: failed === 0,
      message: `Processed ${items.length} (saved ${saved}, failed ${failed})${
        tcfg.aiRewrite && items.length === 100
          ? " — AI cap reached, run again for more"
          : ""
      }`,
      processed: items.length,
      saved,
      failed,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function searchResourcesForPicker(
  type: string,
  q: string,
): Promise<Array<{ id: string; title: string; handle: string }>> {
  if (q.length < 2) return [];
  const rows = await prisma.resource.findMany({
    where: {
      type,
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

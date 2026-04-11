"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { updateResourceSeo } from "@/lib/shopify-mutate";

export type SnRPreview = {
  ok: boolean;
  message: string;
  matches: Array<{
    id: string;
    type: string;
    title: string;
    field: string;
    before: string;
    after: string;
  }>;
};

const FIELDS = ["title", "seoTitle", "seoDescription", "bodyHtml"] as const;
type Field = (typeof FIELDS)[number];

export async function previewSearchReplace(
  find: string,
  replace: string,
  scope: { product: boolean; collection: boolean; page: boolean; article: boolean },
  caseSensitive: boolean,
): Promise<SnRPreview> {
  if (!find) return { ok: false, message: "Find text required", matches: [] };

  const types: string[] = [];
  if (scope.product) types.push("product");
  if (scope.collection) types.push("collection");
  if (scope.page) types.push("page");
  if (scope.article) types.push("article");

  const resources = await prisma.resource.findMany({
    where: { type: { in: types } },
    take: 5000,
  });

  const flags = caseSensitive ? "g" : "gi";
  const re = new RegExp(escapeRegExp(find), flags);

  const matches: SnRPreview["matches"] = [];
  for (const r of resources) {
    for (const f of FIELDS) {
      const v = (r as Record<string, unknown>)[f] as string | null;
      if (!v) continue;
      if (re.test(v)) {
        re.lastIndex = 0;
        const after = v.replace(re, replace);
        matches.push({
          id: r.id,
          type: r.type,
          title: r.title ?? r.handle ?? "—",
          field: f,
          before: v.length > 200 ? v.slice(0, 200) + "…" : v,
          after: after.length > 200 ? after.slice(0, 200) + "…" : after,
        });
      }
    }
  }

  return {
    ok: true,
    message: `${matches.length} matches`,
    matches: matches.slice(0, 200),
  };
}

export async function applySearchReplace(
  find: string,
  replace: string,
  scope: { product: boolean; collection: boolean; page: boolean; article: boolean },
  caseSensitive: boolean,
): Promise<{ ok: boolean; message: string; saved: number; failed: number }> {
  const preview = await previewSearchReplace(find, replace, scope, caseSensitive);
  if (!preview.ok) return { ok: false, message: preview.message, saved: 0, failed: 0 };

  let saved = 0;
  let failed = 0;
  // Apply per-resource — group matches by resource id
  const byResource = new Map<string, SnRPreview["matches"]>();
  for (const m of preview.matches) {
    const arr = byResource.get(m.id) ?? [];
    arr.push(m);
    byResource.set(m.id, arr);
  }

  for (const [resourceId, ms] of byResource) {
    const r = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r) continue;
    const flags = caseSensitive ? "g" : "gi";
    const re = new RegExp(escapeRegExp(find), flags);
    const patch: { seoTitle?: string; seoDescription?: string } = {};
    if (ms.some((m) => m.field === "seoTitle") && r.seoTitle)
      patch.seoTitle = r.seoTitle.replace(re, replace);
    if (ms.some((m) => m.field === "seoDescription") && r.seoDescription)
      patch.seoDescription = r.seoDescription.replace(re, replace);

    if (Object.keys(patch).length > 0) {
      try {
        await updateResourceSeo(r.id, r.type, patch, "rule");
        saved++;
      } catch {
        failed++;
      }
    }
  }

  revalidatePath("/tools/search-and-replace");
  return {
    ok: failed === 0,
    message: `Saved ${saved}, failed ${failed}. (Title and bodyHtml field edits not yet writable — only SEO fields.)`,
    saved,
    failed,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

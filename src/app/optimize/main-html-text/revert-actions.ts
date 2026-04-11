"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { updateResourceBodyHtml } from "@/lib/shopify-mutate";

export type RevertResult = {
  ok: boolean;
  message: string;
  reverted?: number;
  failed?: number;
};

const SINGULAR: Record<string, string> = {
  products: "product",
  collections: "collection",
  articles: "article",
  pages: "page",
};

// Find the most recent bodyHtml optimization per resource and revert it.
// Filters by resource type (products / collections / articles / pages) and
// optionally by a time window (only revert changes made in the last N minutes).
export async function revertLastBulkRun(
  scope: "products" | "collections" | "articles" | "pages",
  windowMinutes = 60,
): Promise<RevertResult> {
  try {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const opts = await prisma.optimization.findMany({
      where: {
        field: "bodyHtml",
        createdAt: { gte: since },
        resource: { type: SINGULAR[scope] },
      },
      orderBy: { createdAt: "desc" },
      include: { resource: true },
    });

    if (opts.length === 0) {
      return {
        ok: true,
        message: `No bodyHtml changes found in the last ${windowMinutes} minutes for ${scope}`,
        reverted: 0,
        failed: 0,
      };
    }

    // Keep only the FIRST (most recent) optimization per resource so we revert
    // each resource exactly once even if it was edited multiple times.
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
        await updateResourceBodyHtml(
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

    revalidatePath("/optimize/main-html-text");
    return {
      ok: failed === 0,
      message: `Reverted ${reverted}, failed ${failed}`,
      reverted,
      failed,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function countRecentBulkChanges(
  scope: "products" | "collections" | "articles" | "pages",
  windowMinutes = 60,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const count = await prisma.optimization.count({
    where: {
      field: "bodyHtml",
      createdAt: { gte: since },
      resource: { type: SINGULAR[scope] },
    },
  });
  return count;
}

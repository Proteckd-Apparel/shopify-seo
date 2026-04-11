// The Optimize All engine. Reads OptimizerConfig from settings and runs the
// enabled per-resource fields against every applicable Resource in the local
// DB. Each successful AI generation writes back to Shopify and is recorded.

import { prisma } from "./prisma";
import {
  generateAltText,
  generateMetaDescription,
  generateMetaTitle,
} from "./ai-generate";
import { loadOptimizerConfig, type ResourceConfig } from "./optimizer-config";
import { updateImageAlt, updateResourceSeo } from "./shopify-mutate";

type ResourceKey = "products" | "collections" | "articles" | "pages";
const SINGULAR: Record<ResourceKey, string> = {
  products: "product",
  collections: "collection",
  articles: "article",
  pages: "page",
};

export type OptimizeAllResult = {
  jobId: string;
  totalProcessed: number;
  totalSaved: number;
  totalFailed: number;
  log: string[];
};

export async function runOptimizeAll(
  onProgress?: (s: { processed: number; saved: number; failed: number; phase: string }) => void,
): Promise<OptimizeAllResult> {
  const cfg = await loadOptimizerConfig();
  if (!cfg.masterAutoOptimize) {
    throw new Error(
      "Master auto-optimize switch is OFF. Enable it in /optimize/settings.",
    );
  }

  const job = await prisma.jobRun.create({
    data: {
      kind: "optimize_all",
      status: "running",
      startedAt: new Date(),
    },
  });

  const log: string[] = [];
  let processed = 0;
  let saved = 0;
  let failed = 0;

  function pushLog(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    log.push(line);
  }

  const resourceKeys: ResourceKey[] = [
    "products",
    "collections",
    "articles",
    "pages",
  ];

  for (const rk of resourceKeys) {
    const rc = cfg[rk];
    if (!rc.enabled) {
      pushLog(`Skipping ${rk}: disabled`);
      continue;
    }

    const where: Record<string, unknown> = { type: SINGULAR[rk] };
    if (rc.scope === "published") where.status = { not: "draft" };
    else if (rc.scope === "drafts") where.status = "draft";

    const skipped = await prisma.skipPage.findMany({
      where: { type: SINGULAR[rk] },
      select: { resourceId: true },
    });
    const skippedIds = new Set(
      skipped.map((s) => s.resourceId).filter(Boolean) as string[],
    );

    const all = await prisma.resource.findMany({
      where,
      include: { images: true },
    });
    const resources = all.filter((r) => !skippedIds.has(r.id));

    pushLog(
      `Processing ${resources.length} ${rk}${skippedIds.size ? ` (${skippedIds.size} skipped)` : ""}`,
    );

    for (const r of resources) {
      // Skip rules
      if (
        rk === "products" &&
        cfg.skipProductsByVendor.length > 0 &&
        r.vendor &&
        cfg.skipProductsByVendor.includes(r.vendor)
      ) {
        continue;
      }
      if (
        rk === "products" &&
        cfg.skipProductsWithTags.length > 0 &&
        r.tags &&
        cfg.skipProductsWithTags.some((t) => r.tags!.includes(t))
      ) {
        continue;
      }
      if (
        rk === "pages" &&
        cfg.skipPagesPatterns.length > 0 &&
        r.handle &&
        cfg.skipPagesPatterns.some((p) =>
          new RegExp(`^${p.replace(/\*/g, ".*")}$`).test(`/pages/${r.handle}`),
        )
      ) {
        continue;
      }

      const aiArgs = {
        title: r.title ?? r.handle ?? "",
        bodyHtml: r.bodyHtml,
        vendor: r.vendor,
        productType: r.productType,
        tags: r.tags,
        type: r.type,
      };

      // Meta title
      if (rc.metaTitles) {
        const has = (r.seoTitle ?? "").trim().length > 0;
        if (!has || rc.metaTitlesOverwrite) {
          processed++;
          try {
            const value = await generateMetaTitle(aiArgs);
            await updateResourceSeo(
              r.id,
              r.type,
              { seoTitle: value },
              "ai",
              "claude-haiku-4-5",
            );
            saved++;
          } catch (e) {
            failed++;
            pushLog(`Title fail ${r.id}: ${e instanceof Error ? e.message : "?"}`);
          }
          onProgress?.({ processed, saved, failed, phase: `${rk}:title` });
        }
      }

      // Meta description
      if (rc.metaDescriptions) {
        const has = (r.seoDescription ?? "").trim().length > 0;
        if (!has || rc.metaDescriptionsOverwrite) {
          processed++;
          try {
            const value = await generateMetaDescription(aiArgs);
            await updateResourceSeo(
              r.id,
              r.type,
              { seoDescription: value },
              "ai",
              "claude-haiku-4-5",
            );
            saved++;
          } catch (e) {
            failed++;
            pushLog(`Desc fail ${r.id}: ${e instanceof Error ? e.message : "?"}`);
          }
          onProgress?.({ processed, saved, failed, phase: `${rk}:desc` });
        }
      }

      // Alt text on images
      if (rc.altTexts && r.images.length > 0) {
        for (let i = 0; i < r.images.length; i++) {
          const img = r.images[i];
          const has = (img.altText ?? "").trim().length > 0;
          if (!has || rc.altTextsOverwrite) {
            processed++;
            try {
              const value = await generateAltText({
                productTitle: r.title ?? "",
                productType: r.productType,
                vendor: r.vendor,
                position: i + 1,
              });
              await updateImageAlt(img.id, value, "ai", "claude-haiku-4-5");
              saved++;
            } catch (e) {
              failed++;
              pushLog(
                `Alt fail ${img.id}: ${e instanceof Error ? e.message : "?"}`,
              );
            }
            onProgress?.({
              processed,
              saved,
              failed,
              phase: `${rk}:alt`,
            });
          }
        }
      }
    }
  }

  pushLog(`Done. processed=${processed} saved=${saved} failed=${failed}`);
  await prisma.jobRun.update({
    where: { id: job.id },
    data: {
      status: "done",
      finishedAt: new Date(),
      progress: processed,
      total: processed,
      error: failed > 0 ? `${failed} failures (see log)` : null,
    },
  });

  return {
    jobId: job.id,
    totalProcessed: processed,
    totalSaved: saved,
    totalFailed: failed,
    log,
  };
}

export type FieldsBeingTouched = {
  [k in ResourceKey]: Array<keyof ResourceConfig>;
};

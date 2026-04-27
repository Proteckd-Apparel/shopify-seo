"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  loadOptimizerConfig,
  saveOptimizerConfig,
  setTemplate,
  type PhotoFilenameConfig,
  type TemplateScopeKey,
} from "@/lib/optimizer-config";
import {
  renderTemplate,
  type TemplateConfig,
} from "@/lib/template-engine";
import {
  filenameFromUrl,
  isWebp,
  slugify,
} from "@/lib/filename-slug";
import { renameProductImage } from "@/lib/shopify-file-swap";

const SINGULAR: Record<TemplateScopeKey, string> = {
  products: "product",
  collections: "collection",
  articles: "article",
  pages: "page",
};

// ---------- Settings persistence ----------

export async function savePhotoFilenameSettings(
  scope: TemplateScopeKey,
  patch: Partial<PhotoFilenameConfig>,
  template: TemplateConfig,
): Promise<{ ok: boolean; message: string }> {
  try {
    const cfg = await loadOptimizerConfig();
    const next = setTemplate(cfg, "photoFilename", scope, template);
    if (scope === "pages") {
      // No pages tab for photos
    } else if (scope === "products" || scope === "collections" || scope === "articles") {
      next.photoFilenames = {
        ...next.photoFilenames,
        [scope]: { ...next.photoFilenames[scope], ...patch },
      };
    }
    await saveOptimizerConfig(next);
    revalidatePath("/optimize/photo-filenames");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Preview ----------

export type FilenamePreviewSample = {
  resourceId: string;
  imageId: string;
  imageUrl: string;
  productTitle: string;
  currentFilename: string;
  newFilename: string;
  ext: string;
  index: number;
  total: number;
};

export async function previewFilenameTemplate(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  cfg: PhotoFilenameConfig,
  index = 0,
): Promise<{
  ok: boolean;
  sample?: FilenamePreviewSample;
  message?: string;
}> {
  try {
    const where = { type: SINGULAR[scope] };
    const total = await prisma.image.count({ where: { resource: where } });
    if (total === 0) return { ok: false, message: "No images to preview" };
    const safe = ((index % total) + total) % total;
    const img = await prisma.image.findFirst({
      where: { resource: where },
      include: { resource: true },
      orderBy: { id: "asc" },
      skip: safe,
    });
    if (!img || !img.resource)
      return { ok: false, message: "No image found" };

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const renderedText = renderTemplate(template, {
      resource: img.resource,
      shopName: settings?.shopDomain ?? "",
    });
    const newSlug = slugify(renderedText, {
      maxChars: cfg.maxChars,
      removeDuplicateWords: cfg.removeDuplicateWords,
      removeSmallWords: cfg.removeSmallWords,
    });
    const { base: currentFilename, ext } = filenameFromUrl(img.src);

    return {
      ok: true,
      sample: {
        resourceId: img.resource.id,
        imageId: img.id,
        imageUrl: img.src,
        productTitle: img.resource.title ?? img.resource.handle ?? "",
        currentFilename: `${currentFilename}.${ext}`,
        newFilename: `${newSlug}.${ext}`,
        ext,
        index: safe,
        total,
      },
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: rename one image ----------

export type RenameResult = {
  ok: boolean;
  message: string;
  newUrl?: string;
};

export async function renameOneImage(
  scope: TemplateScopeKey,
  imageId: string,
  template: TemplateConfig,
  cfg: PhotoFilenameConfig,
): Promise<RenameResult> {
  try {
    const img = await prisma.image.findUnique({
      where: { id: imageId },
      include: { resource: true },
    });
    if (!img || !img.resource)
      return { ok: false, message: "Image not found" };
    if (scope !== "products" && scope !== "collections" && scope !== "articles")
      return { ok: false, message: "Photo Filenames only supports products / collections / articles" };

    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const renderedText = renderTemplate(template, {
      resource: img.resource,
      shopName: settings?.shopDomain ?? "",
    });
    const newSlug = slugify(renderedText, {
      maxChars: cfg.maxChars,
      removeDuplicateWords: cfg.removeDuplicateWords,
      removeSmallWords: cfg.removeSmallWords,
    });
    if (!newSlug) return { ok: false, message: "Template rendered empty" };

    const { base } = filenameFromUrl(img.src);
    if (cfg.doNotReoptimize && base === newSlug) {
      return { ok: true, message: "Filename already optimized" };
    }

    if (scope !== "products") {
      // Collection / article images use a different attach mechanism that we
      // haven't wired yet. Surface that honestly instead of pretending.
      return {
        ok: false,
        message: `Renaming ${scope} images is not yet supported in this build — only product images.`,
      };
    }

    const result = await renameProductImage({
      productId: img.resource.id,
      oldImageUrl: img.src,
      newFilename: newSlug,
      altText: img.altText,
    });

    // Update local cache so the next preview reflects the new state
    await prisma.image.update({
      where: { id: img.id },
      data: { src: result.newUrl, filename: `${newSlug}.${img.src.split(".").pop()?.split("?")[0]}` },
    });
    await prisma.optimization.create({
      data: {
        resourceId: img.resource.id,
        field: "photoFilename",
        oldValue: img.src,
        newValue: result.newUrl,
        source: "rule",
      },
    });

    revalidatePath("/optimize/photo-filenames");
    return { ok: true, message: "Renamed", newUrl: result.newUrl };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Bulk apply ----------

export type BulkRenameResult = {
  ok: boolean;
  message: string;
  processed: number;
  saved: number;
  failed: number;
  skipped: number;
};

export async function bulkRenameImages(
  scope: TemplateScopeKey,
  template: TemplateConfig,
  cfg: PhotoFilenameConfig,
): Promise<BulkRenameResult> {
  if (scope !== "products") {
    return {
      ok: false,
      message: `Bulk rename is only supported for products in this build`,
      processed: 0,
      saved: 0,
      failed: 0,
      skipped: 0,
    };
  }
  if (!cfg.enabled) {
    return {
      ok: false,
      message: "Disabled — toggle Activate ON first",
      processed: 0,
      saved: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const where: Record<string, unknown> = { type: SINGULAR[scope] };
  if (cfg.scope === "published") where.status = { not: "draft" };
  else if (cfg.scope === "drafts") where.status = "draft";

  // Honor skip rules
  const skipRows = await prisma.skipPage.findMany({
    where: { type: SINGULAR[scope] },
    select: { resourceId: true },
  });
  const skipped = new Set(
    skipRows.map((s) => s.resourceId).filter(Boolean) as string[],
  );

  const resources = await prisma.resource.findMany({
    where,
    include: { images: true },
    take: 5000,
  });

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });

  let processed = 0;
  let saved = 0;
  let failed = 0;
  let skippedCount = 0;
  const cap = 200; // safety cap per click — file swaps are slow

  for (const r of resources) {
    if (skipped.has(r.id)) continue;
    if (saved >= cap) break;
    for (const img of r.images) {
      if (saved >= cap) break;
      processed++;
      try {
        const renderedText = renderTemplate(template, {
          resource: r,
          shopName: settings?.shopDomain ?? "",
        });
        const newSlug = slugify(renderedText, {
          maxChars: cfg.maxChars,
          removeDuplicateWords: cfg.removeDuplicateWords,
          removeSmallWords: cfg.removeSmallWords,
        });
        if (!newSlug) {
          skippedCount++;
          continue;
        }
        const { base } = filenameFromUrl(img.src);
        if (cfg.doNotReoptimize && base === newSlug) {
          skippedCount++;
          continue;
        }
        const result = await renameProductImage({
          productId: r.id,
          oldImageUrl: img.src,
          newFilename: newSlug,
          altText: img.altText,
        });
        await prisma.image.update({
          where: { id: img.id },
          data: { src: result.newUrl },
        });
        await prisma.optimization.create({
          data: {
            resourceId: r.id,
            field: "photoFilename",
            oldValue: img.src,
            newValue: result.newUrl,
            source: "rule",
          },
        });
        saved++;
      } catch {
        failed++;
      }
    }
  }

  revalidatePath("/optimize/photo-filenames");
  return {
    ok: failed === 0,
    message: `Processed ${processed} (saved ${saved}, failed ${failed}, skipped ${skippedCount})${
      saved >= cap ? ` — hit ${cap} cap, run again for more` : ""
    }`,
    processed,
    saved,
    failed,
    skipped: skippedCount,
  };
}

// ---------- Picker search ----------

export async function searchImagesForPicker(
  scope: TemplateScopeKey,
  q: string,
): Promise<
  Array<{
    imageId: string;
    productTitle: string;
    handle: string;
    src: string;
  }>
> {
  if (q.length < 2) return [];
  const rows = await prisma.image.findMany({
    where: {
      resource: {
        type: SINGULAR[scope],
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { handle: { contains: q, mode: "insensitive" } },
        ],
      },
    },
    take: 15,
    include: { resource: true },
  });
  return rows.map((img) => ({
    imageId: img.id,
    productTitle: img.resource?.title ?? "",
    handle: img.resource?.handle ?? "",
    src: img.src,
  }));
}

// ---------- Detect WebP for the badge ----------

export async function imageIsWebp(imageId: string): Promise<boolean> {
  const img = await prisma.image.findUnique({ where: { id: imageId } });
  if (!img) return false;
  return isWebp(img.src);
}

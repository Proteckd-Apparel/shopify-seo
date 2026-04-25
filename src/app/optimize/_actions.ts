"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { updateImageAlt, updateResourceSeo } from "@/lib/shopify-mutate";
import {
  generateForImage,
  generateForResource,
  generateMetaDescription,
  generateMetaTitle,
  generateAltText,
} from "@/lib/ai-generate";

export type SaveResult = { ok: boolean; message: string };
export type GenerateResult = { ok: boolean; value?: string; message?: string };

// ---------- Save (manual edit) ----------

export async function saveSeoTitle(
  resourceId: string,
  value: string,
): Promise<SaveResult> {
  try {
    const r = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r) return { ok: false, message: "Resource not found" };
    await updateResourceSeo(resourceId, r.type, { seoTitle: value });
    revalidatePath("/optimize/meta-titles");
    revalidatePath("/optimize/titles");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function saveSeoDescription(
  resourceId: string,
  value: string,
): Promise<SaveResult> {
  try {
    const r = await prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r) return { ok: false, message: "Resource not found" };
    await updateResourceSeo(resourceId, r.type, { seoDescription: value });
    revalidatePath("/optimize/meta-descriptions");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function saveAltText(
  imageId: string,
  value: string,
): Promise<SaveResult> {
  try {
    await updateImageAlt(imageId, value);
    revalidatePath("/optimize/alt-texts");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Generate (AI, draft only — does NOT save) ----------

export async function generateSeoTitle(
  resourceId: string,
): Promise<GenerateResult> {
  try {
    const v = await generateForResource(resourceId, "seoTitle");
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function generateSeoDescription(
  resourceId: string,
): Promise<GenerateResult> {
  try {
    const v = await generateForResource(resourceId, "seoDescription");
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function generateAltTextAction(
  imageId: string,
): Promise<GenerateResult> {
  try {
    const v = await generateForImage(imageId);
    return { ok: true, value: v };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Bulk generate + save ----------

export type BulkResult = {
  ok: boolean;
  processed: number;
  saved: number;
  failed: number;
  message: string;
};

export async function bulkGenerateMetaTitles(
  type: string,
  onlyMissing = true,
): Promise<BulkResult> {
  return bulkResource(type, "seoTitle", onlyMissing);
}

export async function bulkGenerateMetaDescriptions(
  type: string,
  onlyMissing = true,
): Promise<BulkResult> {
  return bulkResource(type, "seoDescription", onlyMissing);
}

async function bulkResource(
  type: string,
  field: "seoTitle" | "seoDescription",
  onlyMissing: boolean,
): Promise<BulkResult> {
  let processed = 0;
  let saved = 0;
  let failed = 0;

  const where: Record<string, unknown> = { type };
  if (onlyMissing) {
    where.OR = [
      { [field]: null },
      { [field]: "" },
    ];
  }

  const resources = await prisma.resource.findMany({
    where,
    take: 200, // safety cap per click
  });

  for (const r of resources) {
    processed++;
    try {
      const args = {
        title: r.title ?? r.handle ?? "",
        bodyHtml: r.bodyHtml,
        vendor: r.vendor,
        productType: r.productType,
        tags: r.tags,
        type: r.type,
      };
      const value =
        field === "seoTitle"
          ? await generateMetaTitle(args)
          : await generateMetaDescription(args);
      await updateResourceSeo(
        r.id,
        r.type,
        field === "seoTitle" ? { seoTitle: value } : { seoDescription: value },
        "ai",
        "claude-haiku-4-5",
      );
      saved++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/optimize/meta-titles");
  revalidatePath("/optimize/meta-descriptions");

  return {
    ok: failed === 0,
    processed,
    saved,
    failed,
    message: `Processed ${processed} (saved ${saved}, failed ${failed}). ${
      processed === 200 ? "Hit the 200-row safety cap — click again." : ""
    }`,
  };
}

export async function bulkGenerateAltText(
  onlyMissing = true,
): Promise<BulkResult> {
  let processed = 0;
  let saved = 0;
  let failed = 0;
  let firstError: string | null = null;

  const images = await prisma.image.findMany({
    where: onlyMissing
      ? { OR: [{ altText: null }, { altText: "" }] }
      : undefined,
    include: { resource: true },
    take: 200,
  });

  for (const img of images) {
    processed++;
    try {
      const siblings = await prisma.image.findMany({
        where: { resourceId: img.resourceId },
        orderBy: { id: "asc" },
        select: { id: true },
      });
      const position = siblings.findIndex((s) => s.id === img.id) + 1;
      const value = await generateAltText({
        productTitle: img.resource?.title ?? "",
        productType: img.resource?.productType,
        vendor: img.resource?.vendor,
        position,
      });
      await updateImageAlt(img.id, value, "ai", "claude-haiku-4-5");
      saved++;
    } catch (e) {
      failed++;
      if (!firstError) {
        firstError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  revalidatePath("/optimize/alt-texts");

  return {
    ok: failed === 0,
    processed,
    saved,
    failed,
    message: `Processed ${processed} (saved ${saved}, failed ${failed}). ${
      firstError ? `First error: ${firstError}. ` : ""
    }${
      processed === 200 ? "Hit the 200-row safety cap — click again." : ""
    }`,
  };
}

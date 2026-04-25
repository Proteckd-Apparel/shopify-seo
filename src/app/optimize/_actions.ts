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
import {
  finishJob,
  setProgress,
  startJob,
  type JobKind,
} from "@/lib/bulk-job";

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
  scope: boolean | "missing" | "short" | "all" = true,
): Promise<BulkResult> {
  return bulkResource(type, "seoTitle", scope);
}

export async function bulkGenerateMetaDescriptions(
  type: string,
  scope: boolean | "missing" | "short" | "all" = true,
): Promise<BulkResult> {
  return bulkResource(type, "seoDescription", scope);
}

async function bulkResource(
  type: string,
  field: "seoTitle" | "seoDescription",
  scope: boolean | "missing" | "short" | "all",
): Promise<BulkResult> {
  let processed = 0;
  let saved = 0;
  let failed = 0;
  let firstError: string | null = null;

  // seoTitle short = under 25 chars, seoDescription short = under 70 chars.
  const SHORT_THRESHOLD = field === "seoTitle" ? 25 : 70;
  const onlyMissing = scope === true || scope === "missing";
  const onlyShort = scope === "short";

  const where: Record<string, unknown> = { type };
  if (onlyMissing) {
    where.OR = [
      { [field]: null },
      { [field]: "" },
    ];
  }

  // orderBy updatedAt asc ensures repeat clicks PROGRESS through the
  // remainder instead of re-hitting the same 1000 rows. After each
  // successful update Resource.updatedAt = now, so processed rows sink
  // to the bottom of the queue and untouched rows bubble up.
  let resources = await prisma.resource.findMany({
    where,
    orderBy: { updatedAt: "asc" },
    take: onlyShort ? 5000 : 1000,
  });

  if (onlyShort) {
    // Prisma lacks LENGTH() on SQLite, so filter in-memory then cap to 1000.
    resources = resources
      .filter((r) => {
        const v = (r[field] as string | null) ?? "";
        return v.length > 0 && v.length < SHORT_THRESHOLD;
      })
      .slice(0, 1000);
  }

  // Track this run as a JobRun so the BulkProgressBar (and the global
  // running-job pill in the topbar) can poll progress.
  const jobKind: JobKind = field === "seoTitle" ? "meta_titles" : "meta_descriptions";
  const job = await startJob(jobKind, resources.length);

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
    } catch (e) {
      failed++;
      if (!firstError) firstError = e instanceof Error ? e.message : String(e);
    }
    await setProgress(job.id, processed);
  }
  await finishJob(job.id, { ok: failed === 0, error: firstError ?? undefined });

  revalidatePath("/optimize/meta-titles");
  revalidatePath("/optimize/meta-descriptions");

  return {
    ok: failed === 0,
    processed,
    saved,
    failed,
    message: `Processed ${processed} (saved ${saved}, failed ${failed}). ${
      processed === 1000 ? "Hit the 1000-row safety cap — click again." : ""
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
    take: 1000,
  });

  const job = await startJob("alt_text", images.length);

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
    await setProgress(job.id, processed);
  }
  await finishJob(job.id, { ok: failed === 0, error: firstError ?? undefined });

  revalidatePath("/optimize/alt-texts");

  return {
    ok: failed === 0,
    processed,
    saved,
    failed,
    message: `Processed ${processed} (saved ${saved}, failed ${failed}). ${
      firstError ? `First error: ${firstError}. ` : ""
    }${
      processed === 1000 ? "Hit the 1000-row safety cap — click again." : ""
    }`,
  };
}

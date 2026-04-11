"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { upscaleImage, testReplicate } from "@/lib/replicate";
import { backupImage } from "@/lib/image-backup";
import { fetchOriginalBytes } from "@/lib/image-compress";
import { filenameFromUrl } from "@/lib/filename-slug";
import { replaceProductImageFromUrl } from "@/lib/shopify-file-swap";

// ---------- List low-res images ----------

export type LowResRow = {
  imageId: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  src: string;
  width: number | null;
  height: number | null;
  hasAlpha: boolean; // we don't actually detect this from local data, but track for the UI
};

export async function listLowResImages(
  threshold: number,
): Promise<{ ok: boolean; rows?: LowResRow[]; message?: string }> {
  try {
    const images = await prisma.image.findMany({
      where: {
        width: { lt: threshold },
        resource: { type: "product" },
      },
      include: { resource: true },
      orderBy: { width: "asc" },
      take: 200,
    });
    return {
      ok: true,
      rows: images.map((img) => ({
        imageId: img.id,
        productId: img.resourceId,
        productTitle: img.resource?.title ?? "",
        productHandle: img.resource?.handle ?? "",
        src: img.src,
        width: img.width,
        height: img.height,
        hasAlpha:
          img.src.split("?")[0].toLowerCase().endsWith(".png") ||
          img.src.split("?")[0].toLowerCase().endsWith(".webp"),
      })),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Replicate connection test ----------

export async function pingReplicate() {
  return testReplicate();
}

// ---------- Upscale one (test mode — no swap) ----------

export type TestUpscaleResult = {
  ok: boolean;
  message: string;
  upscaledUrl?: string;
  originalWidth?: number | null;
  originalHeight?: number | null;
};

export async function testUpscaleOne(
  imageId: string,
  scale: 2 | 4,
): Promise<TestUpscaleResult> {
  try {
    const img = await prisma.image.findUnique({
      where: { id: imageId },
      include: { resource: true },
    });
    if (!img) return { ok: false, message: "Image not found" };
    const cleanUrl = img.src.split("?")[0];
    const result = await upscaleImage(cleanUrl, scale);
    return {
      ok: true,
      message: `Upscaled ${scale}× — preview ready`,
      upscaledUrl: result.url,
      originalWidth: img.width,
      originalHeight: img.height,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply upscale (full swap) ----------

export type UpscaleResult = {
  ok: boolean;
  message: string;
  newUrl?: string;
};

export async function upscaleAndApply(
  imageId: string,
  scale: 2 | 4,
  skipTransparent: boolean,
): Promise<UpscaleResult> {
  try {
    const img = await prisma.image.findUnique({
      where: { id: imageId },
      include: { resource: true },
    });
    if (!img || !img.resource)
      return { ok: false, message: "Image not found" };
    if (img.resource.type !== "product")
      return {
        ok: false,
        message: "Only product images supported in this build",
      };

    const lowerUrl = img.src.split("?")[0].toLowerCase();
    const isPng = lowerUrl.endsWith(".png");
    if (skipTransparent && isPng) {
      return { ok: true, message: "Skipped (transparent photo, off by setting)" };
    }

    // 1. Backup original bytes BEFORE the swap
    const original = await fetchOriginalBytes(img.src);
    const { base } = filenameFromUrl(img.src);
    await backupImage({
      resourceId: img.resource.id,
      url: img.src,
      filename: base,
      contentType:
        "image/" + (img.src.split(".").pop()?.split("?")[0] ?? "jpeg"),
      bytes: original.buffer,
      width: img.width ?? undefined,
      height: img.height ?? undefined,
    });

    // 2. Call Replicate ESRGAN
    const cleanUrl = img.src.split("?")[0];
    const upscale = await upscaleImage(cleanUrl, scale);

    // 3. Swap into the product via the file swap pipeline
    const result = await replaceProductImageFromUrl({
      productId: img.resource.id,
      oldImageUrl: img.src,
      newImageUrl: upscale.url,
      newFilename: `${base}-upscaled-${scale}x`,
      altText: img.altText,
    });

    // 4. Update local cache + audit log
    await prisma.image.update({
      where: { id: img.id },
      data: {
        src: result.newUrl,
        width: img.width ? img.width * scale : null,
        height: img.height ? img.height * scale : null,
      },
    });
    await prisma.optimization.create({
      data: {
        resourceId: img.resource.id,
        field: "upscalePhoto",
        oldValue: img.src,
        newValue: result.newUrl,
        source: "ai",
        model: "real-esrgan",
      },
    });

    revalidatePath("/optimize/upscale-photos");
    return {
      ok: true,
      message: `Upscaled ${scale}× and applied`,
      newUrl: result.newUrl,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Bulk apply ----------

export async function upscaleAllLowRes(
  threshold: number,
  scale: 2 | 4,
  skipTransparent: boolean,
): Promise<{
  ok: boolean;
  message: string;
  saved: number;
  failed: number;
  skipped: number;
}> {
  const list = await listLowResImages(threshold);
  if (!list.ok || !list.rows)
    return {
      ok: false,
      message: list.message ?? "Could not list",
      saved: 0,
      failed: 0,
      skipped: 0,
    };

  const cap = 50;
  let saved = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < Math.min(list.rows.length, cap); i++) {
    const row = list.rows[i];
    try {
      const r = await upscaleAndApply(row.imageId, scale, skipTransparent);
      if (r.ok) {
        if (r.message.startsWith("Skipped")) skipped++;
        else saved++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  revalidatePath("/optimize/upscale-photos");
  return {
    ok: failed === 0,
    message: `Upscaled ${saved}, skipped ${skipped}, failed ${failed}${
      list.rows.length > cap ? ` — hit ${cap} cap, run again for more` : ""
    }`,
    saved,
    failed,
    skipped,
  };
}

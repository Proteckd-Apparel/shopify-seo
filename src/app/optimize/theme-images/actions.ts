"use server";

import { revalidatePath } from "next/cache";
import {
  getMainTheme,
  isThemeImage,
  listThemeAssets,
  readThemeAssetBytes,
  writeThemeBinaryAsset,
  type ThemeAsset,
} from "@/lib/shopify-theme";
import { compressImage } from "@/lib/image-compress";

export type ThemeImageRow = {
  filename: string;
  size: number;
  contentType: string;
};

// ---------- List ----------

export async function listThemeImages(): Promise<{
  ok: boolean;
  message?: string;
  images?: ThemeImageRow[];
  themeId?: string;
}> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme found" };
    const all = await listThemeAssets(theme.id);
    const images = all
      .filter(isThemeImage)
      .map((a: ThemeAsset) => ({
        filename: a.filename,
        size: a.size,
        contentType: a.contentType,
      }));
    // Log any implausibly-large size so we can diagnose Shopify
    // returning the wrong unit for certain assets (>500 MB on a
    // theme image is almost certainly bogus).
    for (const img of images) {
      if (img.size > 500 * 1024 * 1024) {
        console.warn(
          `[theme-images] suspicious size from Shopify for ${img.filename}: ${img.size} bytes (~${(img.size / 1024 / 1024).toFixed(0)} MB)`,
        );
      }
    }
    return { ok: true, images, themeId: theme.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Test compress (no write) ----------

export type TestCompressResult = {
  ok: boolean;
  message: string;
  originalBytes?: number;
  compressedBytes?: number;
  savedPercent?: number;
  width?: number;
  height?: number;
};

export async function testCompressThemeImage(
  filename: string,
  format: "webp" | "avif" | "jpeg",
  quality: number,
  maxWidth: number,
): Promise<TestCompressResult> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme found" };
    const asset = await readThemeAssetBytes(theme.id, filename);
    if (!asset)
      return { ok: false, message: "Could not read asset" };
    const result = await compressImage(asset.buffer, format, quality, maxWidth);
    const savedPercent = Math.round(
      ((asset.buffer.length - result.bytes) / asset.buffer.length) * 100,
    );
    return {
      ok: true,
      message: `${(asset.buffer.length / 1024).toFixed(0)} KB → ${(result.bytes / 1024).toFixed(0)} KB`,
      originalBytes: asset.buffer.length,
      compressedBytes: result.bytes,
      savedPercent,
      width: result.width,
      height: result.height,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: compress one image (writes to theme) ----------

export type ApplyResult = {
  ok: boolean;
  message: string;
  saved?: number;
  failed?: number;
  totalBefore?: number;
  totalAfter?: number;
};

export async function compressOneThemeImage(
  filename: string,
  format: "webp" | "avif" | "jpeg",
  quality: number,
  maxWidth: number,
): Promise<ApplyResult> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme found" };
    const asset = await readThemeAssetBytes(theme.id, filename);
    if (!asset) return { ok: false, message: "Could not read asset" };
    const result = await compressImage(asset.buffer, format, quality, maxWidth);
    if (result.bytes >= asset.buffer.length) {
      return {
        ok: true,
        message: "Already optimal — no change",
      };
    }
    // Replace the asset bytes in place (same filename keeps Liquid references valid)
    await writeThemeBinaryAsset(theme.id, filename, result.buffer);
    revalidatePath("/optimize/theme-images");
    return {
      ok: true,
      message: `Saved ${(asset.buffer.length / 1024).toFixed(0)} KB → ${(result.bytes / 1024).toFixed(0)} KB`,
      totalBefore: asset.buffer.length,
      totalAfter: result.bytes,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Bulk apply ----------

export async function compressAllThemeImages(
  format: "webp" | "avif" | "jpeg",
  quality: number,
  maxWidth: number,
): Promise<ApplyResult> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme found" };
    const all = await listThemeAssets(theme.id);
    const images = all.filter(isThemeImage);

    let saved = 0;
    let failed = 0;
    let totalBefore = 0;
    let totalAfter = 0;

    for (const img of images) {
      try {
        const asset = await readThemeAssetBytes(theme.id, img.filename);
        if (!asset) {
          failed++;
          continue;
        }
        const result = await compressImage(
          asset.buffer,
          format,
          quality,
          maxWidth,
        );
        totalBefore += asset.buffer.length;
        if (result.bytes >= asset.buffer.length) {
          // No improvement, leave it alone
          totalAfter += asset.buffer.length;
          continue;
        }
        await writeThemeBinaryAsset(theme.id, img.filename, result.buffer);
        totalAfter += result.bytes;
        saved++;
      } catch {
        failed++;
      }
    }

    revalidatePath("/optimize/theme-images");
    const savedPercent =
      totalBefore > 0
        ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100)
        : 0;
    return {
      ok: failed === 0,
      message: `Compressed ${saved}, failed ${failed}. Total ${(totalBefore / 1024).toFixed(0)} KB → ${(totalAfter / 1024).toFixed(0)} KB (${savedPercent}% smaller)`,
      saved,
      failed,
      totalBefore,
      totalAfter,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

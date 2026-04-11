"use server";

import { revalidatePath } from "next/cache";
import { compressImage, fetchOriginalBytes } from "@/lib/image-compress";

export type TestCompressResult = {
  ok: boolean;
  message: string;
  originalBytes?: number;
  compressedBytes?: number;
  savedPercent?: number;
  width?: number;
  height?: number;
  format?: string;
};

export async function testCompress(
  imageUrl: string,
  format: "webp" | "avif" | "jpeg" = "webp",
  quality = 80,
): Promise<TestCompressResult> {
  try {
    const { bytes: originalBytes, buffer } = await fetchOriginalBytes(imageUrl);
    const r = await compressImage(buffer, format, quality);
    const savedPercent = Math.round(((originalBytes - r.bytes) / originalBytes) * 100);
    revalidatePath("/tools/compress-photos");
    return {
      ok: true,
      message: `${(originalBytes / 1024).toFixed(0)} KB → ${(r.bytes / 1024).toFixed(0)} KB`,
      originalBytes,
      compressedBytes: r.bytes,
      savedPercent,
      width: r.width,
      height: r.height,
      format,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

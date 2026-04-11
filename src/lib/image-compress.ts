// Image compression module. Uses sharp to re-encode images at quality 80
// (JPEG/WebP/AVIF) and strip EXIF. Returns the compressed buffer + new bytes.
//
// This is the "Path A" implementation. Path B (CDN width hints) is in the
// theme/HTML rewriter — separate file because it's pure text manipulation.

import sharp from "sharp";

export type CompressFormat = "webp" | "avif" | "jpeg";

export type CompressResult = {
  format: CompressFormat;
  bytes: number;
  width: number;
  height: number;
  buffer: Buffer;
};

export async function compressImage(
  src: ArrayBuffer | Buffer,
  format: CompressFormat = "webp",
  quality = 80,
  maxWidth = 2000,
): Promise<CompressResult> {
  const input = Buffer.isBuffer(src) ? src : Buffer.from(src);
  let pipeline = sharp(input).rotate(); // honor EXIF rotation, then strip
  const meta = await pipeline.metadata();

  if (meta.width && meta.width > maxWidth) {
    pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
  }

  let buffer: Buffer;
  if (format === "webp") {
    buffer = await pipeline.webp({ quality }).toBuffer();
  } else if (format === "avif") {
    buffer = await pipeline.avif({ quality }).toBuffer();
  } else {
    buffer = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  const out = await sharp(buffer).metadata();
  return {
    format,
    bytes: buffer.length,
    width: out.width ?? 0,
    height: out.height ?? 0,
    buffer,
  };
}

export async function fetchOriginalBytes(url: string): Promise<{
  bytes: number;
  buffer: Buffer;
}> {
  // Strip Shopify's `?width=` resize param so we get the original
  const cleanUrl = url.split("?")[0];
  const res = await fetch(cleanUrl);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const arr = await res.arrayBuffer();
  return { bytes: arr.byteLength, buffer: Buffer.from(arr) };
}

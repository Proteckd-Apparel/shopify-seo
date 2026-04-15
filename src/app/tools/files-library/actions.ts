"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import {
  listImageFiles,
  replaceStandaloneFile,
  type ImageFileRow,
} from "@/lib/shopify-files";

// Shopify's CDN serves the original when we strip the ?width= query param.
async function fetchFileBytes(url: string): Promise<Buffer> {
  const clean = url.split("?")[0];
  const res = await fetch(clean);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function extFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function mimeForExt(ext: string): string {
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function listFilesForUI(): Promise<{
  ok: boolean;
  rows?: ImageFileRow[];
  message?: string;
}> {
  try {
    const rows = await listImageFiles(250);
    rows.sort((a, b) => b.size - a.size);
    return { ok: true, rows };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to list files",
    };
  }
}

export type CompressFileResult = {
  fileId: string;
  ok: boolean;
  message: string;
  before?: number;
  after?: number;
  saved?: number;
  newUrl?: string;
  oldDeleted?: boolean;
};

// Compress a single Files-library image, re-encoding in the same format so
// references (if any) that rely on the extension don't break. We don't touch
// SVGs, animated images, or files under 4KB.
export async function compressOneFile(
  fileId: string,
  url: string,
  filename: string,
): Promise<CompressFileResult> {
  try {
    const ext = extFromFilename(filename);
    if (ext === "svg") {
      return { fileId, ok: false, message: "skipped: svg" };
    }
    if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
      return { fileId, ok: false, message: `skipped: ${ext || "unknown"}` };
    }

    const input = await fetchFileBytes(url);
    const before = input.length;
    if (before < 4096) {
      return { fileId, ok: false, message: "skipped: too small", before };
    }

    const meta = await sharp(input, { animated: true }).metadata();
    if ((meta.pages ?? 1) > 1) {
      return { fileId, ok: false, message: "skipped: animated", before };
    }

    let pipeline = sharp(input).rotate();
    if (meta.width && meta.width > 2400) {
      pipeline = pipeline.resize({ width: 2400, withoutEnlargement: true });
    }

    let out: Buffer;
    if (ext === "png") {
      out = await pipeline
        .png({ compressionLevel: 9, palette: true, quality: 80 })
        .toBuffer();
    } else if (ext === "webp") {
      out = await pipeline.webp({ quality: 80 }).toBuffer();
    } else if (ext === "gif") {
      out = await pipeline.gif().toBuffer();
    } else {
      out = await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    }

    if (out.length >= before) {
      return {
        fileId,
        ok: false,
        message: "no savings",
        before,
        after: out.length,
      };
    }

    const result = await replaceStandaloneFile({
      oldFileId: fileId,
      newBytes: out,
      newFilename: filename,
      mimeType: mimeForExt(ext),
    });

    return {
      fileId,
      ok: true,
      message: result.oldDeleted
        ? "compressed + old deleted"
        : `compressed (old kept: ${result.oldDeleteError ?? "in use"})`,
      before,
      after: out.length,
      saved: before - out.length,
      newUrl: result.newUrl,
      oldDeleted: result.oldDeleted,
    };
  } catch (e) {
    return {
      fileId,
      ok: false,
      message: e instanceof Error ? e.message : "failed",
    };
  }
}

// Bulk compress every image in the Files library, biggest first. Capped at
// 50 per invocation so a single run can't run away — user can click again
// for another batch.
export async function compressAllFiles(): Promise<{
  ok: boolean;
  message: string;
  results: CompressFileResult[];
  totalSaved: number;
}> {
  const list = await listFilesForUI();
  if (!list.ok || !list.rows) {
    return {
      ok: false,
      message: list.message ?? "Could not list files",
      results: [],
      totalSaved: 0,
    };
  }

  const cap = 50;
  const results: CompressFileResult[] = [];
  let totalSaved = 0;
  let processed = 0;

  for (const row of list.rows) {
    if (processed >= cap) break;
    const r = await compressOneFile(row.id, row.url, row.filename);
    results.push(r);
    if (r.ok && r.saved) totalSaved += r.saved;
    processed++;
  }

  revalidatePath("/tools/files-library");

  const okCount = results.filter((r) => r.ok).length;
  const capNote = processed >= cap ? " (hit 50-file cap, run again for more)" : "";
  return {
    ok: true,
    message: `Compressed ${okCount}/${results.length} — saved ${(totalSaved / 1024).toFixed(1)} KB${capNote}`,
    results,
    totalSaved,
  };
}

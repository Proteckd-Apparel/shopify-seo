"use server";

import sharp from "sharp";
import { revalidatePath } from "next/cache";
import {
  getMainTheme,
  listThemeAssets,
  isThemeImage,
  readThemeAssetBytes,
  writeThemeBinaryAsset,
} from "@/lib/shopify-theme";

export type AssetRow = {
  filename: string;
  size: number;
  contentType: string;
  skipReason?: string;
};

// Filename patterns we never touch — likely UI chrome that breaks if recompressed.
const SKIP_PATTERNS = [
  /favicon/i,
  /apple-touch/i,
  /sprite/i,
];

function isSkippedByName(filename: string): string | undefined {
  if (filename.endsWith(".svg")) return "svg";
  for (const re of SKIP_PATTERNS) {
    if (re.test(filename)) return "system";
  }
  return undefined;
}

export async function listAssetImages(): Promise<{
  ok: boolean;
  rows?: AssetRow[];
  themeName?: string;
  message?: string;
}> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { ok: false, message: "No main theme found" };
    const all = await listThemeAssets(theme.id);
    const images = all
      .filter((a) => isThemeImage(a) || a.filename.endsWith(".svg"))
      .map((a) => ({
        filename: a.filename,
        size: a.size,
        contentType: a.contentType,
        skipReason: isSkippedByName(a.filename),
      }))
      .sort((a, b) => b.size - a.size);
    return { ok: true, rows: images, themeName: theme.name };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export type CompressOneResult = {
  filename: string;
  ok: boolean;
  message: string;
  before?: number;
  after?: number;
  saved?: number;
};

// Compress a single theme asset in place. Re-encodes to the same format
// (jpg→jpg, png→png, webp→webp) so theme references don't break.
export async function compressOneAsset(
  filename: string,
): Promise<CompressOneResult> {
  try {
    const theme = await getMainTheme();
    if (!theme) return { filename, ok: false, message: "No main theme" };

    const skip = isSkippedByName(filename);
    if (skip) return { filename, ok: false, message: `skipped: ${skip}` };

    const data = await readThemeAssetBytes(theme.id, filename);
    if (!data) return { filename, ok: false, message: "could not read" };
    const before = data.buffer.length;

    // Animated detection — sharp.metadata().pages > 1 means animated GIF/WebP.
    const meta = await sharp(data.buffer, { animated: true }).metadata();
    if ((meta.pages ?? 1) > 1) {
      return { filename, ok: false, message: "skipped: animated" };
    }

    // Tiny files aren't worth re-encoding (icons usually).
    if (before < 4096) {
      return { filename, ok: false, message: "skipped: too small" };
    }

    let pipeline = sharp(data.buffer).rotate();
    if (meta.width && meta.width > 2400) {
      pipeline = pipeline.resize({ width: 2400, withoutEnlargement: true });
    }

    const lower = filename.toLowerCase();
    let out: Buffer;
    if (lower.endsWith(".png")) {
      out = await pipeline
        .png({ compressionLevel: 9, palette: true, quality: 80 })
        .toBuffer();
    } else if (lower.endsWith(".webp")) {
      out = await pipeline.webp({ quality: 80 }).toBuffer();
    } else if (lower.endsWith(".gif")) {
      // Static gifs — re-encode as gif
      out = await pipeline.gif().toBuffer();
    } else {
      out = await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    }

    if (out.length >= before) {
      return {
        filename,
        ok: false,
        message: "no savings",
        before,
        after: out.length,
      };
    }

    await writeThemeBinaryAsset(theme.id, filename, out);
    return {
      filename,
      ok: true,
      message: "compressed",
      before,
      after: out.length,
      saved: before - out.length,
    };
  } catch (e) {
    return {
      filename,
      ok: false,
      message: e instanceof Error ? e.message : "failed",
    };
  }
}

export async function compressAllAssets(): Promise<{
  ok: boolean;
  message: string;
  results: CompressOneResult[];
  totalSaved: number;
}> {
  const list = await listAssetImages();
  if (!list.ok || !list.rows) {
    return {
      ok: false,
      message: list.message ?? "Could not list",
      results: [],
      totalSaved: 0,
    };
  }
  const results: CompressOneResult[] = [];
  let totalSaved = 0;
  for (const row of list.rows) {
    if (row.skipReason) {
      results.push({
        filename: row.filename,
        ok: false,
        message: `skipped: ${row.skipReason}`,
      });
      continue;
    }
    const r = await compressOneAsset(row.filename);
    if (r.ok && r.saved) totalSaved += r.saved;
    results.push(r);
  }
  revalidatePath("/tools/assets-folder");
  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: true,
    message: `Compressed ${okCount}/${results.length} — saved ${(totalSaved / 1024).toFixed(1)} KB`,
    results,
    totalSaved,
  };
}

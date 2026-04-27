// Snapshot original image bytes before any compress/rename so we can revert
// later. Backed by the ImageBackup Postgres model.

import { prisma } from "./prisma";

// How long to keep image backups before the cron cleanup drops them. Storing
// full image BYTEA in Postgres bloats the DB fast — revert-after-90-days is
// the practical window customers use compress/revert in. Override with
// IMAGE_BACKUP_TTL_DAYS if you need a longer rollback window.
export const IMAGE_BACKUP_TTL_DAYS = Number(
  process.env.IMAGE_BACKUP_TTL_DAYS || 90,
);

export async function backupImage(args: {
  resourceId: string;
  url: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
  width?: number;
  height?: number;
}): Promise<void> {
  await prisma.imageBackup.create({
    data: {
      resourceId: args.resourceId,
      originalUrl: args.url,
      filename: args.filename,
      contentType: args.contentType,
      bytes: new Uint8Array(args.bytes),
      width: args.width ?? null,
      height: args.height ?? null,
    },
  });
}

// Fetch original bytes from a CDN URL and write an ImageBackup row. Used
// by every destructive image-replace path so the original bytes are
// recoverable even after Shopify drops the old CDN object. Throws on
// fetch / DB failure — callers should treat this as a hard prerequisite
// for any destructive op so we never silently lose data.
export async function backupImageFromUrl(args: {
  resourceId: string;
  url: string;
}): Promise<void> {
  const clean = args.url.split("?")[0];
  const res = await fetch(clean);
  if (!res.ok) {
    throw new Error(`backupImageFromUrl: fetch ${res.status} for ${clean}`);
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = clean.split("/").pop() ?? "image";
  await backupImage({
    resourceId: args.resourceId,
    url: args.url,
    filename,
    contentType,
    bytes: buffer,
  });
}

// Snapshot a theme text file (Liquid, robots.txt, JSON-LD snippet, etc.)
// into the same ImageBackup table the image flows use. We don't have a
// dedicated themeFileBackup model, so the existing schema is overloaded:
// resourceId encodes a synthetic key "theme-file:<themeId>:<filename>"
// and bytes holds the UTF-8 encoded source. Pulled out as its own helper
// so every theme-file write site uses the same convention.
export async function backupThemeFileText(args: {
  themeId: string;
  filename: string;
  content: string;
  // Optional readable content type for the restore UI (e.g. "text/x-liquid").
  contentType?: string;
}): Promise<void> {
  const buffer = Buffer.from(args.content, "utf-8");
  await backupImage({
    resourceId: `theme-file:${args.themeId}:${args.filename}`,
    url: `theme-file://${args.themeId}/${args.filename}`,
    filename: args.filename,
    contentType: args.contentType ?? "text/plain",
    bytes: buffer,
  });
}

export async function getMostRecentBackup(resourceId: string) {
  return prisma.imageBackup.findFirst({
    where: { resourceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBackupsSince(since: Date) {
  return prisma.imageBackup.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteBackup(id: string) {
  await prisma.imageBackup.delete({ where: { id } });
}

// Drop backups older than IMAGE_BACKUP_TTL_DAYS. Called from the cron cleanup
// route. Returns the number of rows deleted.
export async function pruneOldBackups(): Promise<number> {
  const cutoff = new Date(
    Date.now() - IMAGE_BACKUP_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await prisma.imageBackup.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

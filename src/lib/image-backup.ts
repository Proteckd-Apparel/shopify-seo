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

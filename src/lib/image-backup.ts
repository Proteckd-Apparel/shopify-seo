// Snapshot original image bytes before any compress/rename so we can revert
// later. Backed by the ImageBackup Postgres model.

import { prisma } from "./prisma";

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

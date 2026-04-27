"use server";

import { revalidatePath } from "next/cache";
import {
  listBackups,
  restoreManyBackups,
  type BackupRow,
  type ListBackupsOptions,
  type RestoreManyReport,
} from "@/lib/image-restore";

export async function loadBackups(opts: ListBackupsOptions): Promise<{
  ok: boolean;
  rows?: BackupRow[];
  message?: string;
}> {
  try {
    const rows = await listBackups(opts);
    return { ok: true, rows };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Failed to list backups",
    };
  }
}

export async function restoreBackups(backupIds: string[]): Promise<{
  ok: boolean;
  report?: RestoreManyReport;
  message?: string;
}> {
  try {
    if (backupIds.length === 0) {
      return { ok: false, message: "No backups selected" };
    }
    const report = await restoreManyBackups(backupIds);
    revalidatePath("/tools/restore-backups");
    return { ok: true, report };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Restore failed",
    };
  }
}

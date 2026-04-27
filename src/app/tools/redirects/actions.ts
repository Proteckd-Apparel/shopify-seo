"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  createRedirect,
  deleteRedirect,
  readRedirect,
  type ShopifyRedirect,
} from "@/lib/shopify-redirects";
import { backupThemeFileText } from "@/lib/image-backup";

export async function addRedirectAction(
  path: string,
  target: string,
): Promise<{ ok: boolean; message: string; redirect?: ShopifyRedirect }> {
  try {
    const r = await createRedirect(path, target);
    revalidatePath("/tools/redirects");
    return { ok: true, message: "Created", redirect: r };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

export async function deleteRedirectAction(
  id: string,
  force = false,
): Promise<{
  ok: boolean;
  message: string;
  needsConfirm?: boolean;
  trafficCount?: number;
}> {
  try {
    // Read the redirect first so we can snapshot it AND cross-check the
    // 404 log. A redirect that's currently soaking up real customer
    // traffic probably means Google still has the source URL in its
    // index — deleting it sends those customers to a 404 page instead.
    const existing = await readRedirect(id);
    if (!existing) {
      return { ok: false, message: "Redirect not found" };
    }

    if (!force) {
      // Match on the path against our 404 log. Same-path + last 30 days +
      // not-yet-resolved is a strong signal that real traffic is hitting
      // the redirect.
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const trafficCount = await prisma.notFound.count({
        where: {
          url: { contains: existing.path },
          lastSeen: { gte: since },
          resolved: false,
        },
      });
      if (trafficCount > 0) {
        return {
          ok: false,
          needsConfirm: true,
          trafficCount,
          message: `${trafficCount} 404 hit(s) on this path in the last 30 days. Delete will send those customers to a 404 instead. Confirm to proceed.`,
        };
      }
    }

    // Snapshot the redirect into ImageBackup as a "theme-file:redirect:..."
    // synthetic id so re-creation is recoverable from the restore-backups
    // tool. Stored as JSON so the user/restore tool can read both fields.
    try {
      await backupThemeFileText({
        themeId: "redirect",
        filename: `${existing.id.replace(/[^a-zA-Z0-9]/g, "_")}.json`,
        content: JSON.stringify(
          { id: existing.id, path: existing.path, target: existing.target },
          null,
          2,
        ),
        contentType: "application/json",
      });
    } catch {
      // Backup is best-effort; don't block the delete on a snapshot failure.
    }

    await deleteRedirect(id);
    revalidatePath("/tools/redirects");
    return { ok: true, message: "Deleted" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

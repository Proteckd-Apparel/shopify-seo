// Centralized handling of "Shopify says this thing no longer exists" errors.
// When a local Resource or Image row points to a Shopify GID that's been
// deleted (product archived, image removed, etc.), the next mutation that
// targets it fails with one of several error shapes depending on which
// admin mutation was used. We sniff them all here so every bulk loop can
// react the same way: count it as skipped, prune the local row, keep going.

import { prisma } from "./prisma";

// All the ways Shopify says "that GID doesn't point to anything":
//   - metafieldsSet: "Owner does not exist" (INVALID_VALUE)
//   - fileUpdate:    "invalid id" with extensions.code RESOURCE_NOT_FOUND
//   - productUpdate / collectionUpdate / articleUpdate: "Resource not found"
//   - pageUpdate:    "Page does not exist"
//   - generic null parent: "<x> does not exist"
const STALE_PATTERNS = [
  /Owner does not exist/i,
  /Resource not found/i,
  /RESOURCE_NOT_FOUND/i,
  /invalid id/i,
  /does not exist/i,
  /could not be found/i,
];

export function isStaleOwnerError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return STALE_PATTERNS.some((rx) => rx.test(msg));
}

// Best-effort prune of a stale local Resource row. Image rows cascade via
// the schema's onDelete rule. Swallow errors (concurrent delete, foreign
// key races) — the next scan will reconcile.
export async function pruneStaleResource(id: string): Promise<void> {
  try {
    await prisma.resource.delete({ where: { id } });
  } catch {}
}

// Best-effort prune of a single stale Image row. Used when a resource is
// still valid but one of its images was deleted in Shopify (e.g. user
// removed a product photo without re-uploading). Leaves the parent
// Resource intact.
export async function pruneStaleImage(id: string): Promise<void> {
  try {
    await prisma.image.delete({ where: { id } });
  } catch {}
}

// Resolve a product's primary collection for breadcrumb display.
// Used by JSON-LD generation so breadcrumbs read "Home → Men's Shorts →
// PhaseX Running Shorts" instead of the generic "Home → Products → ...".
//
// The match is intentionally exact (slugified productType === slugified
// collection title/handle). Fuzzier matching creates ambiguous picks when
// multiple collections could claim a product.

import { prisma } from "./prisma";
import { slugify } from "./filename-slug";

export type PrimaryCollection = { handle: string; title: string };

export async function buildProductTypeToCollectionMap(): Promise<
  Map<string, PrimaryCollection>
> {
  const collections = await prisma.resource.findMany({
    where: { type: "collection" },
    select: { handle: true, title: true },
  });
  const map = new Map<string, PrimaryCollection>();
  for (const c of collections) {
    if (!c.handle || !c.title) continue;
    const titleKey = slugify(c.title);
    if (titleKey && !map.has(titleKey)) {
      map.set(titleKey, { handle: c.handle, title: c.title });
    }
    const handleKey = slugify(c.handle);
    if (handleKey && !map.has(handleKey)) {
      map.set(handleKey, { handle: c.handle, title: c.title });
    }
  }
  return map;
}

export function resolvePrimaryCollection(
  productType: string | null,
  map: Map<string, PrimaryCollection>,
): PrimaryCollection | null {
  if (!productType) return null;
  return map.get(slugify(productType)) ?? null;
}

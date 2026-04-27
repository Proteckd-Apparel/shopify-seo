// Restore the original bytes saved in ImageBackup back to Shopify, no
// matter what kind of resource the backup belongs to.
//
// Resource type is keyed off the resourceId shape:
//   gid://shopify/Product/...        — products use the productCreateMedia
//                                      pipeline with optional swap of the
//                                      current compressed media.
//   gid://shopify/Article/...        — articleUpdate with a new image src.
//   gid://shopify/Collection/...     — collectionUpdate with a new image
//                                      src.
//   theme:<themeId>:<filename>        — synthetic id used by the theme
//                                      assets compressor; restored via
//                                      writeThemeBinaryAsset.

import { prisma } from "./prisma";
import { shopifyGraphQL } from "./shopify";
import { stageBytes } from "./shopify-file-swap";
import { writeThemeBinaryAsset } from "./shopify-theme";

export type RestoreResult = {
  ok: boolean;
  message: string;
  newUrl?: string;
};

export type BackupRow = {
  id: string;
  resourceId: string;
  originalUrl: string;
  filename: string;
  contentType: string;
  bytesLen: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
  // Best-effort label so the UI can show something more useful than a
  // raw GID. Resolved by joining ImageBackup -> Resource for matching
  // GIDs, otherwise null.
  resourceTitle: string | null;
  resourceType: "product" | "article" | "collection" | "theme" | "unknown";
};

function classifyResourceId(
  resourceId: string,
): "product" | "article" | "collection" | "theme" | "unknown" {
  if (resourceId.startsWith("gid://shopify/Product/")) return "product";
  if (
    resourceId.startsWith("gid://shopify/Article/") ||
    resourceId.startsWith("gid://shopify/OnlineStoreArticle/")
  )
    return "article";
  if (resourceId.startsWith("gid://shopify/Collection/")) return "collection";
  if (resourceId.startsWith("theme:")) return "theme";
  return "unknown";
}

function parseThemeResourceId(
  resourceId: string,
): { themeId: string; filename: string } | null {
  if (!resourceId.startsWith("theme:")) return null;
  const rest = resourceId.slice(6);
  // Theme GIDs contain colons themselves (gid://shopify/OnlineStoreTheme/123),
  // so we need to find the LAST colon to split themeId from filename.
  const lastColon = rest.lastIndexOf(":");
  if (lastColon < 0) return null;
  return {
    themeId: rest.slice(0, lastColon),
    filename: rest.slice(lastColon + 1),
  };
}

export type ListBackupsOptions = {
  sinceHours?: number; // default: all
  resourceType?: "product" | "article" | "collection" | "theme" | "all";
  limit?: number;
};

export async function listBackups(
  opts: ListBackupsOptions = {},
): Promise<BackupRow[]> {
  const where: Record<string, unknown> = {};
  if (opts.sinceHours && opts.sinceHours > 0) {
    where.createdAt = {
      gte: new Date(Date.now() - opts.sinceHours * 60 * 60 * 1000),
    };
  }
  const rows = await prisma.imageBackup.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 500,
  });
  // Resolve resource titles in one query for the GID-shaped ids.
  const resourceIds = Array.from(
    new Set(
      rows
        .map((r) => r.resourceId)
        .filter((id) => id.startsWith("gid://shopify/")),
    ),
  );
  const resources = resourceIds.length
    ? await prisma.resource.findMany({
        where: { id: { in: resourceIds } },
        select: { id: true, title: true },
      })
    : [];
  const titleByGid = new Map(resources.map((r) => [r.id, r.title]));
  let mapped = rows.map((r) => ({
    id: r.id,
    resourceId: r.resourceId,
    originalUrl: r.originalUrl,
    filename: r.filename,
    contentType: r.contentType,
    bytesLen: r.bytes.length,
    width: r.width,
    height: r.height,
    createdAt: r.createdAt,
    resourceTitle: titleByGid.get(r.resourceId) ?? null,
    resourceType: classifyResourceId(r.resourceId),
  }));
  if (opts.resourceType && opts.resourceType !== "all") {
    mapped = mapped.filter((m) => m.resourceType === opts.resourceType);
  }
  return mapped;
}

// ---------- Restore implementations ----------

async function restoreArticle(
  resourceId: string,
  resourceUrl: string,
): Promise<RestoreResult> {
  const data = await shopifyGraphQL<{
    articleUpdate: {
      article: { id: string; image: { url: string } | null } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    /* GraphQL */ `
      mutation ArticleRestore($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id image { url } }
          userErrors { field message }
        }
      }
    `,
    { id: resourceId, article: { image: { src: resourceUrl } } },
  );
  if (data.articleUpdate.userErrors?.length) {
    throw new Error(
      data.articleUpdate.userErrors.map((e) => e.message).join("; "),
    );
  }
  return {
    ok: true,
    message: "Restored article featured image",
    newUrl: data.articleUpdate.article?.image?.url,
  };
}

async function restoreCollection(
  resourceId: string,
  resourceUrl: string,
): Promise<RestoreResult> {
  const data = await shopifyGraphQL<{
    collectionUpdate: {
      collection: { id: string; image: { url: string } | null } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    /* GraphQL */ `
      mutation CollectionRestore($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id image { url } }
          userErrors { field message }
        }
      }
    `,
    { input: { id: resourceId, image: { src: resourceUrl } } },
  );
  if (data.collectionUpdate.userErrors?.length) {
    throw new Error(
      data.collectionUpdate.userErrors.map((e) => e.message).join("; "),
    );
  }
  return {
    ok: true,
    message: "Restored collection image",
    newUrl: data.collectionUpdate.collection?.image?.url,
  };
}

async function restoreProduct(
  resourceId: string,
  resourceUrl: string,
): Promise<RestoreResult> {
  // Try to find the current "compressed" media so we can swap it. If we
  // can't, we fall back to attaching the restored image as new media,
  // which is non-destructive but leaves the old (compressed) one in
  // place — the user can manually delete from Shopify admin.
  const localImage = await prisma.image.findFirst({
    where: { resourceId, compressedAt: { not: null } },
    orderBy: { updatedAt: "desc" },
  });

  let oldMediaId: string | null = null;
  let oldPosition = 0;
  if (localImage) {
    const data = await shopifyGraphQL<{
      product: {
        media: {
          nodes: Array<{
            id: string;
            mediaContentType: string;
            image: { id: string; url: string } | null;
          }>;
        };
      } | null;
    }>(
      /* GraphQL */ `
        query ProductMediaForRestore($id: ID!) {
          product(id: $id) {
            media(first: 250) {
              nodes {
                id
                mediaContentType
                ... on MediaImage { image { id url } }
              }
            }
          }
        }
      `,
      { id: resourceId },
    );
    const nodes = data.product?.media?.nodes ?? [];
    const cleanCurrent = localImage.src.split("?")[0];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].mediaContentType !== "IMAGE") continue;
      const u = nodes[i].image?.url?.split("?")[0];
      if (u && u === cleanCurrent) {
        oldMediaId = nodes[i].id;
        oldPosition = i;
        break;
      }
    }
  }

  const created = await shopifyGraphQL<{
    productCreateMedia: {
      media: Array<{
        id: string;
        image: { id: string; url: string } | null;
      }>;
      mediaUserErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    /* GraphQL */ `
      mutation ProductCreateMediaRestore(
        $productId: ID!
        $media: [CreateMediaInput!]!
      ) {
        productCreateMedia(productId: $productId, media: $media) {
          media {
            id
            ... on MediaImage { image { id url } }
          }
          mediaUserErrors { field message }
        }
      }
    `,
    {
      productId: resourceId,
      media: [{ originalSource: resourceUrl, mediaContentType: "IMAGE" }],
    },
  );
  if (created.productCreateMedia.mediaUserErrors?.length) {
    throw new Error(
      created.productCreateMedia.mediaUserErrors
        .map((e) => e.message)
        .join("; "),
    );
  }
  const newMedia = created.productCreateMedia.media[0];
  if (!newMedia) throw new Error("productCreateMedia returned no media");
  const newUrl = newMedia.image?.url ?? "";

  // Brief wait for processing before reordering / deleting
  await new Promise((r) => setTimeout(r, 1500));

  if (oldMediaId) {
    try {
      await shopifyGraphQL(
        /* GraphQL */ `
          mutation ReorderMediaRestore($id: ID!, $moves: [MoveInput!]!) {
            productReorderMedia(id: $id, moves: $moves) {
              userErrors { message }
            }
          }
        `,
        {
          id: resourceId,
          moves: [{ id: newMedia.id, newPosition: String(oldPosition) }],
        },
      );
    } catch {}
    await shopifyGraphQL(
      /* GraphQL */ `
        mutation DeleteMediaRestore($productId: ID!, $mediaIds: [ID!]!) {
          productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
            mediaUserErrors { message }
          }
        }
      `,
      { productId: resourceId, mediaIds: [oldMediaId] },
    );
  }

  // Update local Image cache so optimize-all stops thinking it's still the
  // compressed version.
  if (localImage) {
    await prisma.image.update({
      where: { id: localImage.id },
      data: {
        src: newUrl,
        compressedAt: null,
      },
    });
  }

  return {
    ok: true,
    message: oldMediaId
      ? "Restored over compressed media"
      : "Restored as new product media (couldn't find compressed version to swap; old media still attached)",
    newUrl,
  };
}

async function restoreTheme(
  resourceId: string,
  bytes: Buffer,
): Promise<RestoreResult> {
  const parsed = parseThemeResourceId(resourceId);
  if (!parsed) throw new Error(`Bad theme resourceId: ${resourceId}`);
  await writeThemeBinaryAsset(parsed.themeId, parsed.filename, bytes);
  return {
    ok: true,
    message: `Restored theme asset ${parsed.filename}`,
  };
}

// ---------- Public entry points ----------

export async function restoreOneBackup(
  backupId: string,
): Promise<RestoreResult> {
  const b = await prisma.imageBackup.findUnique({ where: { id: backupId } });
  if (!b) return { ok: false, message: "Backup not found" };
  const bytes = Buffer.from(b.bytes);
  const kind = classifyResourceId(b.resourceId);

  try {
    if (kind === "theme") {
      return await restoreTheme(b.resourceId, bytes);
    }

    // All Shopify-resource paths start with stageBytes -> resourceUrl
    const { resourceUrl } = await stageBytes(bytes, b.filename, b.contentType);
    if (kind === "article") {
      return await restoreArticle(b.resourceId, resourceUrl);
    }
    if (kind === "collection") {
      return await restoreCollection(b.resourceId, resourceUrl);
    }
    if (kind === "product") {
      return await restoreProduct(b.resourceId, resourceUrl);
    }
    return {
      ok: false,
      message: `Unknown resource type for ${b.resourceId}`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Restore failed",
    };
  }
}

export type RestoreManyReport = {
  ok: boolean;
  restored: number;
  failed: number;
  errors: Array<{ backupId: string; message: string }>;
};

export async function restoreManyBackups(
  backupIds: string[],
): Promise<RestoreManyReport> {
  let restored = 0;
  let failed = 0;
  const errors: Array<{ backupId: string; message: string }> = [];
  for (const id of backupIds) {
    const r = await restoreOneBackup(id);
    if (r.ok) restored++;
    else {
      failed++;
      errors.push({ backupId: id, message: r.message });
    }
  }
  return { ok: failed === 0, restored, failed, errors };
}

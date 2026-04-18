"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  compressImage,
  fetchOriginalBytes,
} from "@/lib/image-compress";
import { renameProductImage } from "@/lib/shopify-file-swap";
import { backupImage } from "@/lib/image-backup";
import { describeImageWithVision } from "@/lib/vision-ai";
import { updateImageAlt } from "@/lib/shopify-mutate";
import { filenameFromUrl, slugify } from "@/lib/filename-slug";
import type { CompressSettings, TestResult } from "./config";

export type { CompressSettings, TestResult } from "./config";

// ---------- Test on one image (no write) ----------

export async function testCompressOne(
  imageId: string,
  settings: CompressSettings,
): Promise<TestResult> {
  try {
    const img = await prisma.image.findUnique({
      where: { id: imageId },
      include: { resource: true },
    });
    if (!img || !img.resource)
      return { ok: false, message: "Image not found" };

    const { buffer, bytes: originalBytes } = await fetchOriginalBytes(img.src);
    const r = await compressImage(
      buffer,
      settings.format,
      settings.quality,
      settings.maxWidth,
    );
    const savedPercent = Math.round(
      ((originalBytes - r.bytes) / originalBytes) * 100,
    );

    let visionAlt: string | undefined;
    let visionFilename: string | undefined;
    if (settings.visionAlt || settings.visionRename) {
      try {
        const v = await describeImageWithVision(
          img.src,
          {
            title: img.resource.title,
            vendor: img.resource.vendor,
            productType: img.resource.productType,
          },
          { alt: settings.visionAlt, filename: settings.visionRename },
        );
        visionAlt = v.altText;
        visionFilename = v.filenameSlug;
      } catch (e) {
        return {
          ok: false,
          message: `Compress OK but Vision AI failed: ${e instanceof Error ? e.message : "?"}`,
          imageId: img.id,
          imageUrl: img.src,
          productTitle: img.resource.title ?? "",
          originalBytes,
          compressedBytes: r.bytes,
          savedPercent,
          width: r.width,
          height: r.height,
        };
      }
    }

    return {
      ok: true,
      message: `${(originalBytes / 1024).toFixed(0)} KB → ${(r.bytes / 1024).toFixed(0)} KB`,
      imageId: img.id,
      imageUrl: img.src,
      productTitle: img.resource.title ?? "",
      originalBytes,
      compressedBytes: r.bytes,
      savedPercent,
      width: r.width,
      height: r.height,
      visionAlt,
      visionFilename,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// ---------- Apply: compress + (optionally rename) one image ----------

export type ApplyResult = {
  ok: boolean;
  message: string;
  newUrl?: string;
};

export async function compressOne(
  imageId: string,
  settings: CompressSettings,
): Promise<ApplyResult> {
  try {
    const img = await prisma.image.findUnique({
      where: { id: imageId },
      include: { resource: true },
    });
    if (!img || !img.resource)
      return { ok: false, message: "Image not found" };
    if (img.resource.type !== "product")
      return {
        ok: false,
        message: "Only product images supported in this build",
      };

    const { buffer, bytes: originalBytes } = await fetchOriginalBytes(img.src);

    // Save backup BEFORE doing anything destructive
    const { base } = filenameFromUrl(img.src);
    await backupImage({
      resourceId: img.resource.id,
      url: img.src,
      filename: base,
      contentType: "image/" + (img.src.split(".").pop()?.split("?")[0] ?? "jpeg"),
      bytes: buffer,
      width: img.width ?? undefined,
      height: img.height ?? undefined,
    });

    // Compress locally
    const compressed = await compressImage(
      buffer,
      settings.format,
      settings.quality,
      settings.maxWidth,
    );

    // Vision AI for alt + filename if requested (BEFORE the swap)
    let visionAlt: string | undefined;
    let visionFilename: string | undefined;
    if (settings.visionAlt || settings.visionRename) {
      const v = await describeImageWithVision(
        img.src,
        {
          title: img.resource.title,
          vendor: img.resource.vendor,
          productType: img.resource.productType,
        },
        { alt: settings.visionAlt, filename: settings.visionRename },
      );
      visionAlt = v.altText;
      visionFilename = v.filenameSlug;
    }

    // Determine the new filename
    const newSlug = visionFilename
      ? slugify(visionFilename, { maxChars: 90 })
      : settings.format === "webp"
        ? base // keep filename, just change extension
        : base;

    // Use the file swap pipeline with the COMPRESSED bytes — but our current
    // renameProductImage downloads from the original URL. We need a variant
    // that takes raw bytes. Inline the logic here for now using lower-level
    // helpers.
    const newUrl = await replaceImageWithBytes({
      productId: img.resource.id,
      oldImageUrl: img.src,
      newFilename: newSlug,
      newExt: settings.format === "jpeg" ? "jpg" : settings.format,
      bytes: compressed.buffer,
      altText: visionAlt ?? img.altText,
    });

    // Update local cache
    await prisma.image.update({
      where: { id: img.id },
      data: {
        src: newUrl,
        altText: visionAlt ?? img.altText,
        width: compressed.width || img.width,
        height: compressed.height || img.height,
      },
    });

    // Audit log
    await prisma.optimization.create({
      data: {
        resourceId: img.resource.id,
        field: "compressPhoto",
        oldValue: img.src,
        newValue: newUrl,
        source: settings.visionAlt || settings.visionRename ? "ai" : "rule",
      },
    });
    if (visionAlt && visionAlt !== img.altText) {
      await prisma.optimization.create({
        data: {
          resourceId: img.resource.id,
          field: "altText",
          oldValue: img.altText,
          newValue: visionAlt,
          source: "ai",
          model: "claude-haiku-4-5",
        },
      });
    }

    revalidatePath("/optimize/compress-photos");
    return {
      ok: true,
      message: `Compressed ${Math.round(((originalBytes - compressed.bytes) / originalBytes) * 100)}% smaller`,
      newUrl,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

// Helper that wraps the pieces of file-swap with raw bytes (instead of
// downloading from the old URL). Mirrors renameProductImage but uses bytes
// the caller already has.
async function replaceImageWithBytes(args: {
  productId: string;
  oldImageUrl: string;
  newFilename: string;
  newExt: string;
  bytes: Buffer;
  altText?: string | null;
}): Promise<string> {
  const { shopifyGraphQL } = await import("@/lib/shopify");

  const fullFilename = `${args.newFilename}.${args.newExt}`;
  const contentType = args.newExt === "jpg" || args.newExt === "jpeg"
    ? "image/jpeg"
    : `image/${args.newExt}`;

  // Stage upload
  const stage = (await shopifyGraphQL(
    /* GraphQL */ `
      mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { message }
        }
      }
    `,
    {
      input: [
        {
          filename: fullFilename,
          mimeType: contentType,
          resource: "FILE",
          httpMethod: "POST",
          fileSize: String(args.bytes.length),
        },
      ],
    },
  )) as {
    stagedUploadsCreate: {
      stagedTargets: Array<{
        url: string;
        resourceUrl: string;
        parameters: Array<{ name: string; value: string }>;
      }>;
      userErrors: Array<{ message: string }>;
    };
  };
  if (stage.stagedUploadsCreate.userErrors?.length) {
    throw new Error(
      stage.stagedUploadsCreate.userErrors.map((e) => e.message).join("; "),
    );
  }
  const target = stage.stagedUploadsCreate.stagedTargets[0];

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append(
    "file",
    new Blob([args.bytes as unknown as ArrayBuffer], { type: contentType }),
    fullFilename,
  );
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok && upload.status !== 201) {
    throw new Error(`Staged upload failed: ${upload.status}`);
  }

  // Find the existing media position
  const productMedia = (await shopifyGraphQL(
    /* GraphQL */ `
      query ProductMedia($id: ID!) {
        product(id: $id) {
          media(first: 250) {
            nodes {
              id
              mediaContentType
              ... on MediaImage {
                image { id url }
              }
            }
          }
        }
      }
    `,
    { id: args.productId },
  )) as {
    product: {
      media: {
        nodes: Array<{
          id: string;
          mediaContentType: string;
          image?: { id: string; url: string } | null;
        }>;
      };
    } | null;
  };

  const cleanOld = args.oldImageUrl.split("?")[0];
  const nodes = productMedia.product?.media?.nodes ?? [];
  let oldMediaId: string | null = null;
  let oldPosition = 0;
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].mediaContentType !== "IMAGE") continue;
    if (nodes[i].image?.url?.split("?")[0] === cleanOld) {
      oldMediaId = nodes[i].id;
      oldPosition = i;
      break;
    }
  }

  // Attach the new media
  const created = (await shopifyGraphQL(
    /* GraphQL */ `
      mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media {
            id
            ... on MediaImage {
              image { id url }
            }
          }
          mediaUserErrors { message }
        }
      }
    `,
    {
      productId: args.productId,
      media: [
        {
          originalSource: target.resourceUrl,
          mediaContentType: "IMAGE",
          alt: args.altText ?? undefined,
        },
      ],
    },
  )) as {
    productCreateMedia: {
      media: Array<{
        id: string;
        image?: { id: string; url: string } | null;
      }>;
      mediaUserErrors: Array<{ message: string }>;
    };
  };
  if (created.productCreateMedia.mediaUserErrors?.length) {
    throw new Error(
      created.productCreateMedia.mediaUserErrors
        .map((e) => e.message)
        .join("; "),
    );
  }
  const newMedia = created.productCreateMedia.media[0];
  const newUrl = newMedia.image?.url ?? "";

  // Brief wait for processing
  await new Promise((r) => setTimeout(r, 1500));

  // Move to old position
  if (oldMediaId) {
    try {
      await shopifyGraphQL(
        /* GraphQL */ `
          mutation ReorderMedia($id: ID!, $moves: [MoveInput!]!) {
            productReorderMedia(id: $id, moves: $moves) {
              userErrors { message }
            }
          }
        `,
        {
          id: args.productId,
          moves: [{ id: newMedia.id, newPosition: String(oldPosition) }],
        },
      );
    } catch {}
    // Delete old
    await shopifyGraphQL(
      /* GraphQL */ `
        mutation DeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
          productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
            mediaUserErrors { message }
          }
        }
      `,
      { productId: args.productId, mediaIds: [oldMediaId] },
    );
  }

  return newUrl;
}

// ---------- Bulk apply ----------

export async function compressAll(
  settings: CompressSettings,
): Promise<{
  ok: boolean;
  message: string;
  saved: number;
  failed: number;
  totalBefore: number;
  totalAfter: number;
}> {
  const cap = 100;
  const PAGE = 200;

  // Honor skip rules
  const skipRows = await prisma.skipPage.findMany({
    where: { type: "product" },
    select: { resourceId: true },
  });
  const skipped = new Set(
    skipRows.map((s) => s.resourceId).filter(Boolean) as string[],
  );

  let saved = 0;
  let failed = 0;
  const totalBefore = 0;
  const totalAfter = 0;

  // Page through products instead of loading them all at once. The per-run
  // cap still stops us at `cap` compressions, but pagination means catalogs
  // >5k products don't leave tail items unreachable across repeated runs.
  let skip = 0;
  outer: for (;;) {
    const products = await prisma.resource.findMany({
      where: { type: "product", status: "active" },
      include: { images: true },
      orderBy: { id: "asc" },
      take: PAGE,
      skip,
    });
    if (products.length === 0) break;
    for (const p of products) {
      if (skipped.has(p.id)) continue;
      for (const img of p.images) {
        if (saved >= cap) break outer;
        try {
          const result = await compressOne(img.id, settings);
          if (result.ok) saved++;
          else failed++;
        } catch {
          failed++;
        }
      }
    }
    if (products.length < PAGE) break;
    skip += PAGE;
  }

  revalidatePath("/optimize/compress-photos");
  return {
    ok: failed === 0,
    message: `Compressed ${saved} images, failed ${failed}.${
      saved >= cap ? " Hit 100-image cap, run again for more." : ""
    }`,
    saved,
    failed,
    totalBefore,
    totalAfter,
  };
}

// ---------- Restore ----------

export async function restoreFromBackup(): Promise<{
  ok: boolean;
  message: string;
  restored: number;
  failed: number;
}> {
  // Find every backup created in the last 60 minutes and restore each one.
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const backups = await prisma.imageBackup.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });

  if (backups.length === 0) {
    return {
      ok: true,
      message: "No backups in the last 60 minutes",
      restored: 0,
      failed: 0,
    };
  }

  // Dedup by resourceId+originalUrl so we only restore the OLDEST backup per
  // image (the original-original, not a backup-of-a-backup)
  const seen = new Set<string>();
  const dedup: typeof backups = [];
  for (const b of [...backups].reverse()) {
    const key = `${b.resourceId}::${b.originalUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(b);
  }

  let restored = 0;
  let failed = 0;

  for (const b of dedup) {
    try {
      // Re-upload the original bytes as a new file with the original filename
      const ext =
        b.contentType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") ??
        "jpg";
      const newUrl = await replaceImageWithBytes({
        productId: b.resourceId,
        oldImageUrl: b.originalUrl, // best effort — may already be deleted
        newFilename: b.filename,
        newExt: ext,
        bytes: Buffer.from(b.bytes),
      });
      // Update the local Image row that currently points at the new (post-compress) URL
      const localImage = await prisma.image.findFirst({
        where: { resourceId: b.resourceId },
      });
      if (localImage) {
        await prisma.image.update({
          where: { id: localImage.id },
          data: {
            src: newUrl,
            width: b.width,
            height: b.height,
          },
        });
      }
      restored++;
    } catch {
      failed++;
    }
  }

  revalidatePath("/optimize/compress-photos");
  return {
    ok: failed === 0,
    message: `Restored ${restored}, failed ${failed}`,
    restored,
    failed,
  };
}

// ---------- Picker search ----------

export async function searchImagesForCompressPicker(q: string) {
  if (q.length < 2) return [];
  const rows = await prisma.image.findMany({
    where: {
      resource: {
        type: "product",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { handle: { contains: q, mode: "insensitive" } },
        ],
      },
    },
    take: 15,
    include: { resource: true },
  });
  return rows.map((img) => ({
    imageId: img.id,
    productTitle: img.resource?.title ?? "",
    handle: img.resource?.handle ?? "",
    src: img.src,
  }));
}

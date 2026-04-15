// File swap pipeline. Used by Photo Filenames and (later) Compress Photos.
//
// Renaming a Shopify image is a 6-step dance because Shopify has no
// "rename" mutation:
//
//   1. Download the original from the CDN
//   2. fileCreate with the new filename + downloaded bytes
//   3. Poll until Shopify finishes processing the new file
//   4. Find the matching ProductMedia for the old image
//   5. Detach old media + attach new media
//   6. Match position so the gallery order is preserved
//
// Each step throws on failure so the caller can decide whether to abort the
// whole batch or just skip this image.

import { shopifyGraphQL } from "./shopify";

export type StagedUpload = {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
};

const STAGED_UPLOADS_CREATE = /* GraphQL */ `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`;

const FILE_CREATE = /* GraphQL */ `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        ... on MediaImage {
          image { url width height }
        }
      }
      userErrors { field message }
    }
  }
`;

const FILE_NODE_QUERY = /* GraphQL */ `
  query FileNode($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        id
        fileStatus
        image { url width height }
      }
    }
  }
`;

const PRODUCT_MEDIA_QUERY = /* GraphQL */ `
  query ProductMedia($id: ID!) {
    product(id: $id) {
      id
      media(first: 250) {
        nodes {
          id
          mediaContentType
          ... on MediaImage {
            image { id url }
            alt
          }
        }
      }
    }
  }
`;

const PRODUCT_CREATE_MEDIA = /* GraphQL */ `
  mutation ProductCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        id
        mediaContentType
        ... on MediaImage {
          image { id url }
        }
      }
      mediaUserErrors { field message }
    }
  }
`;

const PRODUCT_DELETE_MEDIA = /* GraphQL */ `
  mutation ProductDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
    productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
      deletedMediaIds
      mediaUserErrors { field message }
    }
  }
`;

const PRODUCT_REORDER_MEDIA = /* GraphQL */ `
  mutation ProductReorderMedia($id: ID!, $moves: [MoveInput!]!) {
    productReorderMedia(id: $id, moves: $moves) {
      job { id done }
      userErrors { field message }
    }
  }
`;

function throwUserErrors(
  errs: Array<{ field?: string[] | null; message: string }> | undefined,
) {
  if (errs && errs.length > 0) {
    throw new Error(errs.map((e) => e.message).join("; "));
  }
}

async function downloadImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const cleanUrl = url.split("?")[0];
  const res = await fetch(cleanUrl);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const arr = await res.arrayBuffer();
  return { buffer: Buffer.from(arr), contentType };
}

// Stage + upload bytes to Shopify, returns the resource URL we then pass to
// fileCreate.
export async function stageBytes(
  bytes: Buffer,
  filename: string,
  contentType: string,
): Promise<{ resourceUrl: string }> {
  const stage = await shopifyGraphQL<{
    stagedUploadsCreate: {
      stagedTargets: StagedUpload[];
      userErrors: Array<{ message: string }>;
    };
  }>(STAGED_UPLOADS_CREATE, {
    input: [
      {
        filename,
        mimeType: contentType,
        resource: "FILE",
        httpMethod: "POST",
        fileSize: String(bytes.length),
      },
    ],
  });
  throwUserErrors(stage.stagedUploadsCreate.userErrors);
  const target = stage.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("No staged upload target returned");

  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  // Append the file LAST per Shopify's contract
  form.append(
    "file",
    new Blob([bytes as unknown as ArrayBuffer], { type: contentType }),
    filename,
  );

  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok && upload.status !== 201) {
    throw new Error(
      `Staged upload failed: ${upload.status} ${await upload.text().then((t) => t.slice(0, 200))}`,
    );
  }
  return { resourceUrl: target.resourceUrl };
}

async function createFileFromStaged(
  resourceUrl: string,
  filename: string,
  alt?: string,
): Promise<{ id: string }> {
  const data = await shopifyGraphQL<{
    fileCreate: {
      files: Array<{
        id: string;
        fileStatus: string;
        image?: { url?: string } | null;
      }>;
      userErrors: Array<{ message: string }>;
    };
  }>(FILE_CREATE, {
    files: [
      {
        originalSource: resourceUrl,
        filename,
        alt: alt ?? undefined,
        contentType: "IMAGE",
      },
    ],
  });
  throwUserErrors(data.fileCreate.userErrors);
  const file = data.fileCreate.files[0];
  if (!file) throw new Error("fileCreate returned no file");
  return { id: file.id };
}

export async function pollFileReady(
  fileId: string,
  attempts = 30,
  delayMs = 1500,
): Promise<{ url: string; width?: number; height?: number }> {
  for (let i = 0; i < attempts; i++) {
    const data = await shopifyGraphQL<{
      node: {
        id: string;
        fileStatus: string;
        image?: { url?: string; width?: number; height?: number } | null;
      } | null;
    }>(FILE_NODE_QUERY, { id: fileId });
    const node = data.node;
    if (node?.fileStatus === "READY" && node.image?.url) {
      return {
        url: node.image.url,
        width: node.image.width ?? undefined,
        height: node.image.height ?? undefined,
      };
    }
    if (node?.fileStatus === "FAILED") {
      throw new Error("Shopify file processing failed");
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("Timed out waiting for file to be processed");
}

// Find the productMedia entry that wraps a given image URL (matched on the
// path, ignoring CDN query strings).
async function findProductMediaIdForImage(
  productId: string,
  oldImageUrl: string,
): Promise<{
  mediaId: string;
  position: number;
  alt: string | null;
} | null> {
  const data = await shopifyGraphQL<{
    product: {
      media: {
        nodes: Array<{
          id: string;
          mediaContentType: string;
          alt?: string | null;
          image?: { id: string; url: string } | null;
        }>;
      };
    } | null;
  }>(PRODUCT_MEDIA_QUERY, { id: productId });
  const nodes = data.product?.media?.nodes ?? [];
  const cleanOld = oldImageUrl.split("?")[0];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.mediaContentType !== "IMAGE") continue;
    const url = n.image?.url?.split("?")[0];
    if (url && url === cleanOld) {
      return { mediaId: n.id, position: i, alt: n.alt ?? null };
    }
  }
  return null;
}

async function attachMediaToProduct(
  productId: string,
  resourceUrl: string,
  alt?: string | null,
): Promise<{ mediaId: string; imageUrl: string }> {
  const data = await shopifyGraphQL<{
    productCreateMedia: {
      media: Array<{
        id: string;
        mediaContentType: string;
        image?: { id: string; url: string } | null;
      }>;
      mediaUserErrors: Array<{ message: string }>;
    };
  }>(PRODUCT_CREATE_MEDIA, {
    productId,
    media: [
      {
        originalSource: resourceUrl,
        mediaContentType: "IMAGE",
        alt: alt ?? undefined,
      },
    ],
  });
  throwUserErrors(data.productCreateMedia.mediaUserErrors);
  const media = data.productCreateMedia.media[0];
  if (!media) throw new Error("productCreateMedia returned no media");
  return {
    mediaId: media.id,
    imageUrl: media.image?.url ?? "",
  };
}

async function detachProductMedia(productId: string, mediaIds: string[]) {
  if (mediaIds.length === 0) return;
  const data = await shopifyGraphQL<{
    productDeleteMedia: {
      deletedMediaIds: string[] | null;
      mediaUserErrors: Array<{ message: string }>;
    };
  }>(PRODUCT_DELETE_MEDIA, { productId, mediaIds });
  throwUserErrors(data.productDeleteMedia.mediaUserErrors);
}

async function moveMediaToPosition(
  productId: string,
  mediaId: string,
  newPosition: number,
) {
  // We can't directly set position; productReorderMedia takes moves of
  // (id, newPosition). One move is enough.
  await shopifyGraphQL(PRODUCT_REORDER_MEDIA, {
    id: productId,
    moves: [{ id: mediaId, newPosition: String(newPosition) }],
  });
}

// ---------- Public: rename a single product image ----------

export type SwapResult = {
  oldImageId: string;
  newImageId: string;
  oldUrl: string;
  newUrl: string;
};

// Replace a product image with a new one downloaded from a remote URL.
// Used by the Upscale Photos feature — we send Replicate's upscaled output
// URL and Shopify ingests it directly. Same swap dance as renameProductImage.
export async function replaceProductImageFromUrl(args: {
  productId: string;
  oldImageUrl: string;
  newImageUrl: string;
  newFilename: string;
  altText?: string | null;
}): Promise<SwapResult> {
  const existing = await findProductMediaIdForImage(
    args.productId,
    args.oldImageUrl,
  );
  if (!existing)
    throw new Error("Could not find product media for image URL");

  // Download the new image so we can re-stage with our preferred filename
  const res = await fetch(args.newImageUrl);
  if (!res.ok)
    throw new Error(`Failed to fetch upscaled image: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  const arr = await res.arrayBuffer();
  const buffer = Buffer.from(arr);
  const ext =
    (contentType.split("/")[1]?.split(";")[0] ?? "png").replace("jpeg", "jpg");
  const fullFilename = `${args.newFilename}.${ext}`;

  const { resourceUrl } = await stageBytes(buffer, fullFilename, contentType);
  const { mediaId: newMediaId, imageUrl: newUrl } =
    await attachMediaToProduct(
      args.productId,
      resourceUrl,
      args.altText ?? existing.alt,
    );

  await new Promise((r) => setTimeout(r, 1500));

  try {
    await moveMediaToPosition(args.productId, newMediaId, existing.position);
  } catch {}
  await detachProductMedia(args.productId, [existing.mediaId]);

  return {
    oldImageId: existing.mediaId,
    newImageId: newMediaId,
    oldUrl: args.oldImageUrl,
    newUrl,
  };
}

export async function renameProductImage(args: {
  productId: string;
  oldImageUrl: string;
  newFilename: string; // without extension
  altText?: string | null;
}): Promise<SwapResult> {
  const { productId, oldImageUrl, newFilename, altText } = args;

  // 1. Locate the existing media so we know its position + alt
  const existing = await findProductMediaIdForImage(productId, oldImageUrl);
  if (!existing) throw new Error("Could not find product media for image URL");

  // 2. Download the original bytes
  const { buffer, contentType } = await downloadImage(oldImageUrl);

  // 3. Build the full filename (preserve original extension)
  const ext = oldImageUrl.split("?")[0].split(".").pop() ?? "jpg";
  const fullFilename = `${newFilename}.${ext}`;

  // 4. Stage + upload to Shopify
  const { resourceUrl } = await stageBytes(buffer, fullFilename, contentType);

  // 5. Attach the new file as new media on the product
  const { mediaId: newMediaId, imageUrl: newImageUrl } =
    await attachMediaToProduct(productId, resourceUrl, altText ?? existing.alt);

  // 6. Wait briefly for it to process before reordering / deleting
  // (productCreateMedia returns synchronously but the image URL may still be
  // a placeholder until Shopify finishes ingesting.)
  await new Promise((r) => setTimeout(r, 1500));

  // 7. Move new media to the old position
  try {
    await moveMediaToPosition(productId, newMediaId, existing.position);
  } catch {
    // Position move is best-effort
  }

  // 8. Delete the old media
  await detachProductMedia(productId, [existing.mediaId]);

  return {
    oldImageId: existing.mediaId,
    newImageId: newMediaId,
    oldUrl: oldImageUrl,
    newUrl: newImageUrl,
  };
}

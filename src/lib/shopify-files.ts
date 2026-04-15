import { shopifyGraphQL } from "./shopify";
import { pollFileReady, stageBytes } from "./shopify-file-swap";

const FILES_QUERY = /* GraphQL */ `
  query Files($first: Int!) {
    files(first: $first, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
        fileStatus
        alt
        createdAt
        preview {
          image { url width height }
        }
      }
    }
  }
`;

export async function listFiles(first = 50) {
  const data: {
    files: {
      nodes: Array<{
        id: string;
        fileStatus: string;
        alt: string | null;
        createdAt: string;
        preview: { image: { url: string; width: number; height: number } | null } | null;
      }>;
    };
  } = await shopifyGraphQL(FILES_QUERY, { first });
  return data.files.nodes.map((n) => ({
    id: n.id,
    fileStatus: n.fileStatus,
    alt: n.alt,
    createdAt: n.createdAt,
    preview: n.preview?.image?.url ?? null,
  }));
}

// ---------- Image-files-with-size query used by the Files Library compressor ----------
//
// Shopify's File union includes MediaImage | GenericFile | Video | ExternalVideo.
// We only care about MediaImage entries, and we need the original bytes' size
// so the compressor can rank by "biggest savings first". The query filter
// `media_type:IMAGE` trims the result set on Shopify's side.

const IMAGE_FILES_QUERY = /* GraphQL */ `
  query ImageFiles($first: Int!, $after: String) {
    files(
      first: $first
      after: $after
      query: "media_type:IMAGE"
      sortKey: CREATED_AT
      reverse: true
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        fileStatus
        alt
        createdAt
        ... on MediaImage {
          mimeType
          image {
            url
            width
            height
          }
          originalSource {
            fileSize
          }
        }
      }
    }
  }
`;

export type ImageFileRow = {
  id: string;
  url: string;
  filename: string;
  alt: string | null;
  size: number;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  fileStatus: string;
  createdAt: string;
};

export function filenameFromFileUrl(url: string, fallbackId: string): string {
  const clean = url.split("?")[0];
  const last = clean.split("/").pop() ?? "";
  return last || fallbackId;
}

export async function listImageFiles(max = 250): Promise<ImageFileRow[]> {
  const rows: ImageFileRow[] = [];
  let after: string | null = null;
  const pageSize = 50;

  while (rows.length < max) {
    const data: {
      files: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          id: string;
          fileStatus: string;
          alt: string | null;
          createdAt: string;
          mimeType?: string | null;
          image?: {
            url: string | null;
            width: number | null;
            height: number | null;
          } | null;
          originalSource?: { fileSize: number | null } | null;
        }>;
      };
    } = await shopifyGraphQL(IMAGE_FILES_QUERY, { first: pageSize, after });

    for (const n of data.files.nodes) {
      const url = n.image?.url ?? "";
      if (!url) continue;
      rows.push({
        id: n.id,
        url,
        filename: filenameFromFileUrl(url, n.id),
        alt: n.alt,
        size: n.originalSource?.fileSize ?? 0,
        width: n.image?.width ?? null,
        height: n.image?.height ?? null,
        mimeType: n.mimeType ?? null,
        fileStatus: n.fileStatus,
        createdAt: n.createdAt,
      });
      if (rows.length >= max) break;
    }

    if (!data.files.pageInfo.hasNextPage) break;
    after = data.files.pageInfo.endCursor;
    if (!after) break;
  }

  return rows;
}

// ---------- Replace a standalone Files-library image ----------
//
// Shopify has no "update bytes" for a File, so the only way to swap content is:
//   1. stageBytes → POST new bytes to Shopify's temp bucket
//   2. fileCreate — Shopify mints a new File id + CDN url
//   3. pollFileReady until Shopify finishes processing
//   4. fileDelete the old File — fails if it is referenced somewhere, in
//      which case we leave both copies in place and surface the error.

const FILE_DELETE = /* GraphQL */ `
  mutation FileDelete($fileIds: [ID!]!) {
    fileDelete(fileIds: $fileIds) {
      deletedFileIds
      userErrors { field message }
    }
  }
`;

const FILE_CREATE_STANDALONE = /* GraphQL */ `
  mutation FileCreateStandalone($files: [FileCreateInput!]!) {
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

export type ReplaceStandaloneFileResult = {
  newFileId: string;
  newUrl: string;
  oldDeleted: boolean;
  oldDeleteError?: string;
};

export async function replaceStandaloneFile(args: {
  oldFileId: string;
  newBytes: Buffer;
  newFilename: string;
  mimeType: string;
  alt?: string | null;
}): Promise<ReplaceStandaloneFileResult> {
  const { resourceUrl } = await stageBytes(
    args.newBytes,
    args.newFilename,
    args.mimeType,
  );

  const createData = await shopifyGraphQL<{
    fileCreate: {
      files: Array<{
        id: string;
        fileStatus: string;
        image?: { url?: string | null } | null;
      }>;
      userErrors: Array<{ field?: string[] | null; message: string }>;
    };
  }>(FILE_CREATE_STANDALONE, {
    files: [
      {
        originalSource: resourceUrl,
        filename: args.newFilename,
        alt: args.alt ?? undefined,
        contentType: "IMAGE",
      },
    ],
  });
  if (createData.fileCreate.userErrors?.length) {
    throw new Error(
      createData.fileCreate.userErrors.map((e) => e.message).join("; "),
    );
  }
  const newFile = createData.fileCreate.files[0];
  if (!newFile) throw new Error("fileCreate returned no file");

  const ready = await pollFileReady(newFile.id);

  let oldDeleted = false;
  let oldDeleteError: string | undefined;
  try {
    const delData = await shopifyGraphQL<{
      fileDelete: {
        deletedFileIds: string[] | null;
        userErrors: Array<{ field?: string[] | null; message: string }>;
      };
    }>(FILE_DELETE, { fileIds: [args.oldFileId] });
    if (delData.fileDelete.userErrors?.length) {
      oldDeleteError = delData.fileDelete.userErrors
        .map((e) => e.message)
        .join("; ");
    } else if ((delData.fileDelete.deletedFileIds ?? []).length > 0) {
      oldDeleted = true;
    }
  } catch (e) {
    oldDeleteError = e instanceof Error ? e.message : "Delete failed";
  }

  return {
    newFileId: newFile.id,
    newUrl: ready.url,
    oldDeleted,
    oldDeleteError,
  };
}

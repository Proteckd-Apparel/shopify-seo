import { shopifyGraphQL } from "./shopify";

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

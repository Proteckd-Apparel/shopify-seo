// Shopify Asset API client. Used to read theme files (so we can detect
// existing JSON-LD scripts) and write theme files (so we can comment them
// out or inject our snippet).
//
// Theme editing is genuinely risky — every theme is different. We touch as
// little as possible: only commenting out script tags, never deleting code.

import { shopifyGraphQL } from "./shopify";

export type ShopifyTheme = {
  id: string;
  name: string;
  role: string;
};

// ---------- Theme asset listing ----------

const THEME_ASSETS_QUERY = /* GraphQL */ `
  query ThemeAssets($id: ID!, $cursor: String) {
    theme(id: $id) {
      files(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          filename
          size
          contentType
        }
      }
    }
  }
`;

export type ThemeAsset = {
  filename: string;
  size: number;
  contentType: string;
};

// Returns every file in the theme, paginated. Caller filters for images.
export async function listThemeAssets(themeId: string): Promise<ThemeAsset[]> {
  const out: ThemeAsset[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: {
      theme: {
        files: {
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
          nodes: Array<{
            filename: string;
            size: number;
            contentType: string;
          }>;
        };
      } | null;
    } = await shopifyGraphQL(THEME_ASSETS_QUERY, { id: themeId, cursor });
    const nodes = data.theme?.files?.nodes ?? [];
    for (const n of nodes) out.push(n);
    if (!data.theme?.files?.pageInfo?.hasNextPage) break;
    cursor = data.theme.files.pageInfo.endCursor;
  }
  return out;
}

export function isThemeImage(asset: ThemeAsset): boolean {
  if (!asset.filename.startsWith("assets/")) return false;
  return /\.(jpe?g|png|webp|gif|avif)$/i.test(asset.filename);
}

// Read a single theme asset and return its raw bytes by following the
// CDN URL Shopify exposes via the file body. We use a separate query that
// returns the asset's URL.
const THEME_ASSET_URL_QUERY = /* GraphQL */ `
  query ThemeAssetUrl($id: ID!, $filename: String!) {
    theme(id: $id) {
      file(filename: $filename) {
        filename
        body {
          ... on OnlineStoreThemeFileBodyText { content }
          ... on OnlineStoreThemeFileBodyUrl { url }
        }
      }
    }
  }
`;

export async function readThemeAssetBytes(
  themeId: string,
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const data: {
    theme: {
      file: {
        body: { content?: string; url?: string };
      } | null;
    } | null;
  } = await shopifyGraphQL(THEME_ASSET_URL_QUERY, {
    id: themeId,
    filename,
  });
  const body = data.theme?.file?.body;
  if (!body?.url) return null;
  const res = await fetch(body.url);
  if (!res.ok) return null;
  const arr = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arr),
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
  };
}

// Upload a new theme asset (binary). Reuses the themeFilesUpsert mutation
// already in this file but with a base64 body for binary content.
const THEME_BINARY_UPSERT = /* GraphQL */ `
  mutation ThemeFilesUpsert(
    $themeId: ID!
    $files: [OnlineStoreThemeFilesUpsertFileInput!]!
  ) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { code field message }
    }
  }
`;

export async function writeThemeBinaryAsset(
  themeId: string,
  filename: string,
  bytes: Buffer,
): Promise<void> {
  const base64 = bytes.toString("base64");
  const data: {
    themeFilesUpsert: {
      userErrors: Array<{ code: string; field: string[]; message: string }>;
    };
  } = await shopifyGraphQL(THEME_BINARY_UPSERT, {
    themeId,
    files: [
      {
        filename,
        body: { type: "BASE64", value: base64 },
      },
    ],
  });
  if (data.themeFilesUpsert.userErrors?.length) {
    throw new Error(
      data.themeFilesUpsert.userErrors.map((e) => e.message).join("; "),
    );
  }
}

const THEMES_QUERY = /* GraphQL */ `
  query Themes {
    themes(first: 20) {
      nodes { id name role }
    }
  }
`;

export async function listThemes(): Promise<ShopifyTheme[]> {
  const data: { themes: { nodes: ShopifyTheme[] } } = await shopifyGraphQL(
    THEMES_QUERY,
  );
  return data.themes.nodes;
}

export async function getMainTheme(): Promise<ShopifyTheme | null> {
  const themes = await listThemes();
  return themes.find((t) => t.role === "MAIN") ?? null;
}

const THEME_FILES_QUERY = /* GraphQL */ `
  query ThemeFiles($id: ID!, $filenames: [String!]!) {
    theme(id: $id) {
      files(first: 50, filenames: $filenames) {
        nodes {
          filename
          body {
            ... on OnlineStoreThemeFileBodyText { content }
          }
        }
      }
    }
  }
`;

export type ThemeFile = { filename: string; content: string };

export async function readThemeFiles(
  themeId: string,
  filenames: string[],
): Promise<ThemeFile[]> {
  const data: {
    theme: {
      files: {
        nodes: Array<{
          filename: string;
          body: { content: string } | null;
        }>;
      };
    };
  } = await shopifyGraphQL(THEME_FILES_QUERY, {
    id: themeId,
    filenames,
  });
  return data.theme.files.nodes
    .filter((f) => !!f.body?.content)
    .map((f) => ({ filename: f.filename, content: f.body!.content }));
}

const THEME_FILES_UPSERT = /* GraphQL */ `
  mutation ThemeFilesUpsert(
    $themeId: ID!
    $files: [OnlineStoreThemeFilesUpsertFileInput!]!
  ) {
    themeFilesUpsert(themeId: $themeId, files: $files) {
      upsertedThemeFiles { filename }
      userErrors { code field message }
    }
  }
`;

export async function writeThemeFile(
  themeId: string,
  filename: string,
  content: string,
): Promise<void> {
  const data: {
    themeFilesUpsert: {
      userErrors: Array<{ code: string; field: string[]; message: string }>;
    };
  } = await shopifyGraphQL(THEME_FILES_UPSERT, {
    themeId,
    files: [{ filename, body: { type: "TEXT", value: content } }],
  });
  if (data.themeFilesUpsert.userErrors?.length) {
    throw new Error(
      data.themeFilesUpsert.userErrors.map((e) => e.message).join("; "),
    );
  }
}

// ---------- Conflict detection ----------

const JSONLD_RE =
  /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

export type SchemaConflict = {
  filename: string;
  schemaType: string;
  raw: string;
  startIndex: number;
  endIndex: number;
};

// Scan a list of theme files for `<script type="application/ld+json">` blocks
// and try to identify which schema.org @type they declare.
export function findExistingSchemas(
  files: ThemeFile[],
): SchemaConflict[] {
  const out: SchemaConflict[] = [];
  for (const f of files) {
    JSONLD_RE.lastIndex = 0;
    for (const m of f.content.matchAll(JSONLD_RE)) {
      const raw = m[0];
      const inner = m[1] ?? "";
      const start = m.index ?? 0;
      const end = start + raw.length;
      let schemaType = "Unknown";
      const typeMatch = inner.match(/"@type"\s*:\s*"([^"]+)"/);
      if (typeMatch) schemaType = typeMatch[1];
      out.push({
        filename: f.filename,
        schemaType,
        raw,
        startIndex: start,
        endIndex: end,
      });
    }
  }
  return out;
}

// Wrap each existing JSON-LD script tag in a {% comment %} block, leaving
// the original code intact (so a future "Enable" can restore it).
export function commentOutSchemas(content: string): string {
  return content.replace(JSONLD_RE, (full) => {
    if (full.includes("{%- if seo_app_disabled -%}")) return full;
    return `{% comment %} disabled by Shopify SEO {% endcomment %}\n{% comment %}${full}{% endcomment %}`;
  });
}

// Reverse the above.
export function restoreSchemas(content: string): string {
  return content
    .replace(/\{% comment %\} disabled by Shopify SEO \{% endcomment %\}\n/g, "")
    .replace(/\{% comment %\}(<script[^>]*type=["']application\/ld\+json["'][\s\S]*?<\/script>)\{% endcomment %\}/g, "$1");
}

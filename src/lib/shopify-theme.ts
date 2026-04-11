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

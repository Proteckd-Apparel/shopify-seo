// Shopify locale + translation helpers. Used by the Translations page.

import { shopifyGraphQL } from "./shopify";

const SHOP_LOCALES_QUERY = /* GraphQL */ `
  query ShopLocales {
    shopLocales {
      locale
      name
      primary
      published
    }
  }
`;

export type ShopLocale = {
  locale: string;
  name: string;
  primary: boolean;
  published: boolean;
};

export async function listShopLocales(): Promise<ShopLocale[]> {
  const data = await shopifyGraphQL<{ shopLocales: ShopLocale[] }>(
    SHOP_LOCALES_QUERY,
  );
  return data.shopLocales;
}

// Read all translatable fields + existing translations for one resource.
// Shopify's API requires `translations(locale: String!)` — one locale per
// field — so we use GraphQL aliases to fetch all requested locales in a
// single round-trip. Each alias is sanitized to be GraphQL-safe (zh-TW
// becomes zh_TW etc.) and the locale value goes inline as a string literal.
function buildTranslatableResourceQuery(locales: string[]): string {
  const aliasFor = (loc: string) =>
    "loc_" + loc.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "_");
  const fields = locales
    .map(
      (loc) => `      ${aliasFor(loc)}: translations(locale: ${JSON.stringify(loc)}) {
        key
        value
        locale
        outdated
        updatedAt
      }`,
    )
    .join("\n");
  return /* GraphQL */ `
    query TR($id: ID!) {
      translatableResource(resourceId: $id) {
        resourceId
        translatableContent {
          key
          value
          digest
          type
          locale
        }
${fields}
      }
    }
  `;
}

export type TranslatableContent = {
  key: string;
  value: string;
  digest: string;
  type: string;
  locale: string;
};

export type ExistingTranslation = {
  key: string;
  value: string;
  locale: string;
  outdated: boolean;
  updatedAt: string;
};

export async function readTranslatableResource(
  resourceId: string,
  locales: string[],
): Promise<{
  content: TranslatableContent[];
  translations: ExistingTranslation[];
} | null> {
  if (locales.length === 0) return null;
  const aliasFor = (loc: string) =>
    "loc_" + loc.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "_");
  const query = buildTranslatableResourceQuery(locales);
  const data = await shopifyGraphQL<{
    translatableResource: ({
      resourceId: string;
      translatableContent: TranslatableContent[];
    } & Record<string, ExistingTranslation[]>) | null;
  }>(query, { id: resourceId });
  if (!data.translatableResource) return null;
  // Flatten per-locale alias results back into a single translations array.
  const merged: ExistingTranslation[] = [];
  for (const loc of locales) {
    const arr = data.translatableResource[aliasFor(loc)];
    if (Array.isArray(arr)) merged.push(...arr);
  }
  return {
    content: data.translatableResource.translatableContent,
    translations: merged,
  };
}

// Bulk register translations for one resource. Each translation entry needs
// the digest of the source value at write time so Shopify can mark it
// outdated if the source ever changes.
const REGISTER_TRANSLATIONS = /* GraphQL */ `
  mutation Register($resourceId: ID!, $translations: [TranslationInput!]!) {
    translationsRegister(resourceId: $resourceId, translations: $translations) {
      translations { key locale value }
      userErrors { field message }
    }
  }
`;

export type TranslationInput = {
  key: string;
  value: string;
  locale: string;
  translatableContentDigest: string;
};

export async function registerTranslations(
  resourceId: string,
  translations: TranslationInput[],
): Promise<void> {
  if (translations.length === 0) return;
  const data = await shopifyGraphQL<{
    translationsRegister: {
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(REGISTER_TRANSLATIONS, { resourceId, translations });
  if (data.translationsRegister.userErrors?.length) {
    throw new Error(
      data.translationsRegister.userErrors.map((e) => e.message).join("; "),
    );
  }
}

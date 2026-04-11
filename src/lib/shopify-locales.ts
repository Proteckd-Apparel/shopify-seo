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

// Read all translatable fields + their existing translations for one resource
const TRANSLATABLE_RESOURCE_QUERY = /* GraphQL */ `
  query TR($id: ID!, $locales: [String!]!) {
    translatableResource(resourceId: $id) {
      resourceId
      translatableContent {
        key
        value
        digest
        type
        locale
      }
      translations(locales: $locales) {
        key
        value
        locale
        outdated
        updatedAt
      }
    }
  }
`;

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
  const data = await shopifyGraphQL<{
    translatableResource: {
      resourceId: string;
      translatableContent: TranslatableContent[];
      translations: ExistingTranslation[];
    } | null;
  }>(TRANSLATABLE_RESOURCE_QUERY, { id: resourceId, locales });
  if (!data.translatableResource) return null;
  return {
    content: data.translatableResource.translatableContent,
    translations: data.translatableResource.translations,
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

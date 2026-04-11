// Helper to set a JSON metafield on a resource (product / collection / etc.).
// Used by the JSON-LD writer to put the generated schema into a metafield
// that the theme reads.

import { shopifyGraphQL } from "./shopify";

const METAFIELDS_SET = /* GraphQL */ `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace }
      userErrors { field message code }
    }
  }
`;

const METAFIELD_DEFINITION_CREATE = /* GraphQL */ `
  mutation DefCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { field message code }
    }
  }
`;

export type MetafieldInput = {
  ownerId: string; // gid://shopify/Product/...
  namespace: string;
  key: string;
  type: string; // e.g. "json", "single_line_text_field"
  value: string;
};

// Idempotent — if the definition already exists Shopify returns a TAKEN code
// which we ignore. Definitions also need an ownerType per resource scope.
export async function ensureJsonMetafieldDefinition(
  ownerType: "PRODUCT" | "COLLECTION" | "ARTICLE",
  namespace = "custom",
  key = "json_ld",
  name = "JSON-LD",
): Promise<void> {
  try {
    const data: {
      metafieldDefinitionCreate: {
        createdDefinition: { id: string } | null;
        userErrors: Array<{ field: string[]; message: string; code?: string }>;
      };
    } = await shopifyGraphQL(METAFIELD_DEFINITION_CREATE, {
      definition: {
        name,
        namespace,
        key,
        type: "json",
        ownerType,
        description: "Auto-generated JSON-LD by Shopify SEO app",
        access: { storefront: "PUBLIC_READ" },
      },
    });
    const errs = data.metafieldDefinitionCreate.userErrors ?? [];
    // TAKEN means it already exists — that's fine
    const hardErrors = errs.filter((e) => e.code !== "TAKEN");
    if (hardErrors.length > 0) {
      throw new Error(
        `metafieldDefinitionCreate: ${hardErrors.map((e) => e.message).join("; ")}`,
      );
    }
  } catch (e) {
    // Don't crash the whole flow if definition creation fails — fall through
    // and let metafieldsSet try anyway. Surface the cause in logs if so.
    if (e instanceof Error && !e.message.includes("TAKEN")) {
      // Re-throw for visibility
      throw new Error(`Could not ensure metafield definition: ${e.message}`);
    }
  }
}

export async function setMetafield(input: MetafieldInput): Promise<void> {
  const data: {
    metafieldsSet: {
      userErrors: Array<{ field: string[]; message: string; code?: string }>;
    };
  } = await shopifyGraphQL(METAFIELDS_SET, { metafields: [input] });
  if (data.metafieldsSet.userErrors?.length) {
    throw new Error(
      `metafieldsSet: ${data.metafieldsSet.userErrors.map((e) => `${e.code ?? ""} ${e.message}`).join("; ")}`,
    );
  }
}

export async function setJsonLd(
  ownerId: string,
  schema: Record<string, unknown>,
): Promise<void> {
  // Best-effort create definition first (idempotent)
  const ownerType = ownerId.includes("/Collection/")
    ? "COLLECTION"
    : ownerId.includes("/Article/")
      ? "ARTICLE"
      : "PRODUCT";
  await ensureJsonMetafieldDefinition(ownerType);
  await setMetafield({
    ownerId,
    namespace: "custom",
    key: "json_ld",
    type: "json",
    value: JSON.stringify(schema),
  });
}

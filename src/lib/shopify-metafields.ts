// Helper to set a JSON metafield on a resource (product / collection / etc.).
// Used by the JSON-LD writer to put the generated schema into a metafield
// that the theme reads.

import { shopifyGraphQL } from "./shopify";

const METAFIELDS_SET = /* GraphQL */ `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace }
      userErrors { field message }
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

export async function setMetafield(input: MetafieldInput): Promise<void> {
  const data: {
    metafieldsSet: {
      userErrors: Array<{ field: string[]; message: string }>;
    };
  } = await shopifyGraphQL(METAFIELDS_SET, { metafields: [input] });
  if (data.metafieldsSet.userErrors?.length) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join("; "),
    );
  }
}

export async function setJsonLd(
  ownerId: string,
  schema: Record<string, unknown>,
): Promise<void> {
  await setMetafield({
    ownerId,
    namespace: "custom",
    key: "json_ld",
    type: "json",
    value: JSON.stringify(schema),
  });
}

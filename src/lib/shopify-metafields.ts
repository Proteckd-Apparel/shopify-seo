// Helper to set a JSON metafield on a resource (product / collection / etc.).
// Used by the JSON-LD writer to put the generated schema into a metafield
// that the theme reads.

import { prisma } from "./prisma";
import { shopifyGraphQL } from "./shopify";

const METAFIELD_READ = /* GraphQL */ `
  query MetafieldRead(
    $ownerId: ID!
    $namespace: String!
    $key: String!
  ) {
    node(id: $ownerId) {
      ... on Product { metafield(namespace: $namespace, key: $key) { value } }
      ... on Collection { metafield(namespace: $namespace, key: $key) { value } }
      ... on Article { metafield(namespace: $namespace, key: $key) { value } }
      ... on Shop { metafield(namespace: $namespace, key: $key) { value } }
    }
  }
`;

async function readMetafieldValue(
  ownerId: string,
  namespace: string,
  key: string,
): Promise<string | null> {
  try {
    const data = await shopifyGraphQL<{
      node: { metafield: { value: string } | null } | null;
    }>(METAFIELD_READ, { ownerId, namespace, key });
    return data.node?.metafield?.value ?? null;
  } catch {
    return null;
  }
}

// Snapshot-and-write wrapper for arbitrary metafields. Reads the prior
// value, writes an Optimization audit row tagged with the
// namespace/key, then performs the write. Used by callers that want the
// same recovery story setJsonLd has but for non-JSON-LD metafields
// (e.g. custom.faqs, custom.google_merchant_copy).
export async function setMetafieldWithAudit(
  input: MetafieldInput,
): Promise<void> {
  const prior = await readMetafieldValue(
    input.ownerId,
    input.namespace,
    input.key,
  );
  await setMetafield(input);
  try {
    const exists = await prisma.resource.findUnique({
      where: { id: input.ownerId },
      select: { id: true },
    });
    if (exists && prior !== input.value) {
      await prisma.optimization.create({
        data: {
          resourceId: input.ownerId,
          field: `metafield:${input.namespace}.${input.key}`,
          oldValue: prior,
          newValue: input.value,
          source: "rule",
        },
      });
    }
  } catch {
    // Audit best-effort.
  }
}

const METAFIELDS_SET = /* GraphQL */ `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key namespace }
      userErrors { field message code }
    }
  }
`;

const METAFIELDS_DELETE = /* GraphQL */ `
  mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key namespace ownerId }
      userErrors { field message }
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
  ownerType: "PRODUCT" | "COLLECTION" | "ARTICLE" | "SHOP",
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

  // Snapshot the prior metafield value into the Optimization audit log
  // before overwriting. Bad JSON / wrong shape / mis-applied schema can
  // de-rank the resource in Google; the oldValue row is the rollback.
  const prior = await readMetafieldValue(ownerId, "custom", "json_ld");
  const next = JSON.stringify(schema);
  await setMetafield({
    ownerId,
    namespace: "custom",
    key: "json_ld",
    type: "json",
    value: next,
  });
  // Only record audit rows for resources we actually have locally —
  // SHOP-level (handled by setSitewideJsonLd below) writes a different
  // resource id pattern and is logged separately.
  try {
    const exists = await prisma.resource.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (exists && prior !== next) {
      await prisma.optimization.create({
        data: {
          resourceId: ownerId,
          field: "jsonLd",
          oldValue: prior,
          newValue: next,
          source: "rule",
        },
      });
    }
  } catch {
    // Audit is best-effort — don't fail the write if the local row
    // hasn't been scanned yet.
  }
}

// Sitewide schemas live on the Shop owner, which has no local Resource
// row, so we can't use the Optimization audit table (FK to Resource).
// Snapshot the prior value into ImageBackup with a synthetic resourceId
// — same convention used for theme assets and theme files — so the
// restore-backups tool can find it.
export async function setSitewideJsonLd(
  shopId: string,
  schemas: unknown[],
): Promise<void> {
  await ensureJsonMetafieldDefinition(
    "SHOP",
    "custom",
    "json_ld_sitewide",
    "JSON-LD Sitewide",
  );
  const prior = await readMetafieldValue(
    shopId,
    "custom",
    "json_ld_sitewide",
  );
  const next = JSON.stringify(schemas);
  if (prior !== null && prior !== next) {
    // Lazy-import to avoid a circular dep with image-backup -> prisma
    const { backupThemeFileText } = await import("./image-backup");
    await backupThemeFileText({
      themeId: "shop",
      filename: `metafield/sitewide-json-ld-${Date.now()}.json`,
      content: prior,
      contentType: "application/json",
    });
  }
  await setMetafield({
    ownerId: shopId,
    namespace: "custom",
    key: "json_ld_sitewide",
    type: "json",
    value: next,
  });
}

// Removes the custom.json_ld metafield from a resource. Used when an owner
// chooses to exclude a blog/resource from this app's schema emission so a
// different tool (e.g. the Proteck'd autoblog) can own its schema instead.
// Safe to call on resources that never had the metafield — Shopify returns
// a "not found" userError which we swallow. Snapshots the prior value to
// the Optimization audit log first so a false-positive deletion can be
// reversed by re-applying the prior schema.
export async function clearJsonLd(ownerId: string): Promise<void> {
  const prior = await readMetafieldValue(ownerId, "custom", "json_ld");
  if (prior !== null) {
    try {
      const exists = await prisma.resource.findUnique({
        where: { id: ownerId },
        select: { id: true },
      });
      if (exists) {
        await prisma.optimization.create({
          data: {
            resourceId: ownerId,
            field: "jsonLd",
            oldValue: prior,
            newValue: null,
            source: "rule",
          },
        });
      }
    } catch {}
  }
  const data: {
    metafieldsDelete: {
      deletedMetafields: Array<{ key: string; namespace: string; ownerId: string }>;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  } = await shopifyGraphQL(METAFIELDS_DELETE, {
    metafields: [{ ownerId, namespace: "custom", key: "json_ld" }],
  });
  const errs = data.metafieldsDelete.userErrors ?? [];
  const hard = errs.filter((e) => {
    const m = e.message.toLowerCase();
    return !m.includes("not found") && !m.includes("does not exist");
  });
  if (hard.length > 0) {
    throw new Error(
      `metafieldsDelete: ${hard.map((e) => e.message).join("; ")}`,
    );
  }
}

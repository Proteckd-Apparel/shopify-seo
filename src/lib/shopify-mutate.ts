// Mutation helpers — every write to Shopify funnels through here so we can
// log it as an Optimization row for the audit trail.

import { prisma } from "./prisma";
import { shopifyGraphQL } from "./shopify";

const PRODUCT_UPDATE = /* GraphQL */ `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id seo { title description } }
      userErrors { field message }
    }
  }
`;

const COLLECTION_UPDATE = /* GraphQL */ `
  mutation CollectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id seo { title description } }
      userErrors { field message }
    }
  }
`;

const PAGE_UPDATE = /* GraphQL */ `
  mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id title }
      userErrors { field message }
    }
  }
`;

const ARTICLE_UPDATE = /* GraphQL */ `
  mutation ArticleUpdate($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id title }
      userErrors { field message }
    }
  }
`;

const PRODUCT_IMAGE_UPDATE = /* GraphQL */ `
  mutation FileUpdate($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) {
      files { id alt }
      userErrors { field message }
    }
  }
`;

type UserError = { field: string[] | null; message: string };
type MutationResult<T> = T & { userErrors: UserError[] };

function throwOnUserErrors(errors: UserError[] | undefined) {
  if (errors && errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
}

export async function updateResourceSeo(
  resourceId: string,
  type: string,
  patch: { seoTitle?: string | null; seoDescription?: string | null },
  source: "manual" | "ai" | "rule" = "manual",
  model?: string,
) {
  const existing = await prisma.resource.findUnique({
    where: { id: resourceId },
  });
  if (!existing) throw new Error(`Resource not found: ${resourceId}`);

  const newTitle = patch.seoTitle ?? existing.seoTitle ?? "";
  const newDesc = patch.seoDescription ?? existing.seoDescription ?? "";

  // Mutation per resource type. Pages and articles don't have a Shopify SEO
  // object — we have to write the title field directly. We do that for now;
  // proper meta-field support comes later.
  if (type === "product") {
    const data = await shopifyGraphQL<{
      productUpdate: MutationResult<{ product: { id: string } }>;
    }>(PRODUCT_UPDATE, {
      input: {
        id: resourceId,
        seo: { title: newTitle, description: newDesc },
      },
    });
    throwOnUserErrors(data.productUpdate.userErrors);
  } else if (type === "collection") {
    const data = await shopifyGraphQL<{
      collectionUpdate: MutationResult<{ collection: { id: string } }>;
    }>(COLLECTION_UPDATE, {
      input: {
        id: resourceId,
        seo: { title: newTitle, description: newDesc },
      },
    });
    throwOnUserErrors(data.collectionUpdate.userErrors);
  } else if (type === "page") {
    // Page SEO is on the page itself; Shopify exposes title only at the top level.
    const data = await shopifyGraphQL<{
      pageUpdate: MutationResult<{ page: { id: string } }>;
    }>(PAGE_UPDATE, {
      id: resourceId,
      page: { title: newTitle || undefined },
    });
    throwOnUserErrors(data.pageUpdate.userErrors);
  } else if (type === "article") {
    const data = await shopifyGraphQL<{
      articleUpdate: MutationResult<{ article: { id: string } }>;
    }>(ARTICLE_UPDATE, {
      id: resourceId,
      article: { title: newTitle || undefined },
    });
    throwOnUserErrors(data.articleUpdate.userErrors);
  } else {
    throw new Error(`Unsupported resource type: ${type}`);
  }

  // Audit + local cache
  if (
    patch.seoTitle !== undefined &&
    patch.seoTitle !== existing.seoTitle
  ) {
    await prisma.optimization.create({
      data: {
        resourceId,
        field: "seoTitle",
        oldValue: existing.seoTitle,
        newValue: patch.seoTitle,
        source,
        model,
      },
    });
  }
  if (
    patch.seoDescription !== undefined &&
    patch.seoDescription !== existing.seoDescription
  ) {
    await prisma.optimization.create({
      data: {
        resourceId,
        field: "seoDescription",
        oldValue: existing.seoDescription,
        newValue: patch.seoDescription,
        source,
        model,
      },
    });
  }

  await prisma.resource.update({
    where: { id: resourceId },
    data: {
      seoTitle: patch.seoTitle ?? existing.seoTitle,
      seoDescription: patch.seoDescription ?? existing.seoDescription,
    },
  });
}

export async function updateImageAlt(
  imageId: string,
  alt: string,
  source: "manual" | "ai" | "rule" = "manual",
  model?: string,
) {
  const img = await prisma.image.findUnique({ where: { id: imageId } });
  if (!img) throw new Error(`Image not found: ${imageId}`);

  const data = await shopifyGraphQL<{
    fileUpdate: MutationResult<{ files: Array<{ id: string }> }>;
  }>(PRODUCT_IMAGE_UPDATE, {
    files: [{ id: imageId, alt }],
  });
  throwOnUserErrors(data.fileUpdate.userErrors);

  await prisma.optimization.create({
    data: {
      resourceId: img.resourceId,
      field: "altText",
      oldValue: img.altText,
      newValue: alt,
      source,
      model,
    },
  });
  await prisma.image.update({
    where: { id: imageId },
    data: { altText: alt },
  });
}

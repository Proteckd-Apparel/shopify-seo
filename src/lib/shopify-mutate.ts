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

// ---------- Real H1 title updates ----------
//
// Note: SEO title (the <title> tag) is on a separate seo.title field — use
// updateResourceSeo for that. THIS function updates the customer-visible
// title that shows on product cards, the cart, order emails, etc.

const PRODUCT_TITLE_UPDATE = /* GraphQL */ `
  mutation ProductTitleUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }
`;

const COLLECTION_TITLE_UPDATE = /* GraphQL */ `
  mutation CollectionTitleUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id title }
      userErrors { field message }
    }
  }
`;

const PAGE_TITLE_UPDATE_REAL = /* GraphQL */ `
  mutation PageTitleUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id title }
      userErrors { field message }
    }
  }
`;

const ARTICLE_TITLE_UPDATE_REAL = /* GraphQL */ `
  mutation ArticleTitleUpdate($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id title }
      userErrors { field message }
    }
  }
`;

export async function updateResourceTitle(
  resourceId: string,
  type: string,
  newTitle: string,
  source: "manual" | "ai" | "rule" = "manual",
  model?: string,
) {
  const existing = await prisma.resource.findUnique({
    where: { id: resourceId },
  });
  if (!existing) throw new Error(`Resource not found: ${resourceId}`);

  if (type === "product") {
    const data = await shopifyGraphQL<{
      productUpdate: MutationResult<{ product: { id: string; title: string } }>;
    }>(PRODUCT_TITLE_UPDATE, {
      input: { id: resourceId, title: newTitle },
    });
    throwOnUserErrors(data.productUpdate.userErrors);
  } else if (type === "collection") {
    const data = await shopifyGraphQL<{
      collectionUpdate: MutationResult<{
        collection: { id: string; title: string };
      }>;
    }>(COLLECTION_TITLE_UPDATE, {
      input: { id: resourceId, title: newTitle },
    });
    throwOnUserErrors(data.collectionUpdate.userErrors);
  } else if (type === "page") {
    const data = await shopifyGraphQL<{
      pageUpdate: MutationResult<{ page: { id: string; title: string } }>;
    }>(PAGE_TITLE_UPDATE_REAL, {
      id: resourceId,
      page: { title: newTitle },
    });
    throwOnUserErrors(data.pageUpdate.userErrors);
  } else if (type === "article") {
    const data = await shopifyGraphQL<{
      articleUpdate: MutationResult<{
        article: { id: string; title: string };
      }>;
    }>(ARTICLE_TITLE_UPDATE_REAL, {
      id: resourceId,
      article: { title: newTitle },
    });
    throwOnUserErrors(data.articleUpdate.userErrors);
  } else {
    throw new Error(`Unsupported resource type: ${type}`);
  }

  if (newTitle !== existing.title) {
    await prisma.optimization.create({
      data: {
        resourceId,
        field: "title",
        oldValue: existing.title,
        newValue: newTitle,
        source,
        model,
      },
    });
  }

  await prisma.resource.update({
    where: { id: resourceId },
    data: { title: newTitle },
  });
}

// ---------- Handle (URL) updates ----------
//
// Changing the handle on a product/collection/article/page via the proper
// mutation causes Shopify to AUTOMATICALLY create a 301 redirect from the
// old URL to the new one. We're not doing anything special — that's just
// Shopify's behavior. Verify in admin → Online Store → Navigation → URL
// Redirects after a run.

const PRODUCT_HANDLE_UPDATE = /* GraphQL */ `
  mutation ProductHandleUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id handle }
      userErrors { field message }
    }
  }
`;

const COLLECTION_HANDLE_UPDATE = /* GraphQL */ `
  mutation CollectionHandleUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id handle }
      userErrors { field message }
    }
  }
`;

const PAGE_HANDLE_UPDATE = /* GraphQL */ `
  mutation PageHandleUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle }
      userErrors { field message }
    }
  }
`;

const ARTICLE_HANDLE_UPDATE = /* GraphQL */ `
  mutation ArticleHandleUpdate($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id handle }
      userErrors { field message }
    }
  }
`;

export async function updateResourceHandle(
  resourceId: string,
  type: string,
  newHandle: string,
  source: "manual" | "ai" | "rule" = "manual",
  model?: string,
) {
  const existing = await prisma.resource.findUnique({
    where: { id: resourceId },
  });
  if (!existing) throw new Error(`Resource not found: ${resourceId}`);

  if (type === "product") {
    const data = await shopifyGraphQL<{
      productUpdate: MutationResult<{
        product: { id: string; handle: string };
      }>;
    }>(PRODUCT_HANDLE_UPDATE, {
      input: { id: resourceId, handle: newHandle },
    });
    throwOnUserErrors(data.productUpdate.userErrors);
  } else if (type === "collection") {
    const data = await shopifyGraphQL<{
      collectionUpdate: MutationResult<{
        collection: { id: string; handle: string };
      }>;
    }>(COLLECTION_HANDLE_UPDATE, {
      input: { id: resourceId, handle: newHandle },
    });
    throwOnUserErrors(data.collectionUpdate.userErrors);
  } else if (type === "page") {
    const data = await shopifyGraphQL<{
      pageUpdate: MutationResult<{ page: { id: string; handle: string } }>;
    }>(PAGE_HANDLE_UPDATE, {
      id: resourceId,
      page: { handle: newHandle },
    });
    throwOnUserErrors(data.pageUpdate.userErrors);
  } else if (type === "article") {
    const data = await shopifyGraphQL<{
      articleUpdate: MutationResult<{
        article: { id: string; handle: string };
      }>;
    }>(ARTICLE_HANDLE_UPDATE, {
      id: resourceId,
      article: { handle: newHandle },
    });
    throwOnUserErrors(data.articleUpdate.userErrors);
  } else {
    throw new Error(`Unsupported resource type: ${type}`);
  }

  if (newHandle !== existing.handle) {
    await prisma.optimization.create({
      data: {
        resourceId,
        field: "handle",
        oldValue: existing.handle,
        newValue: newHandle,
        source,
        model,
      },
    });
  }

  await prisma.resource.update({
    where: { id: resourceId },
    data: { handle: newHandle },
  });
}

// ---------- Body HTML updates ----------

const PRODUCT_BODY_UPDATE = /* GraphQL */ `
  mutation ProductBodyUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

const COLLECTION_BODY_UPDATE = /* GraphQL */ `
  mutation CollectionBodyUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id }
      userErrors { field message }
    }
  }
`;

const PAGE_BODY_UPDATE = /* GraphQL */ `
  mutation PageBodyUpdate($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id }
      userErrors { field message }
    }
  }
`;

const ARTICLE_BODY_UPDATE = /* GraphQL */ `
  mutation ArticleBodyUpdate($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article { id }
      userErrors { field message }
    }
  }
`;

export async function updateResourceBodyHtml(
  resourceId: string,
  type: string,
  newHtml: string,
  source: "manual" | "ai" | "rule" = "manual",
  model?: string,
) {
  const existing = await prisma.resource.findUnique({
    where: { id: resourceId },
  });
  if (!existing) throw new Error(`Resource not found: ${resourceId}`);

  if (type === "product") {
    const data = await shopifyGraphQL<{
      productUpdate: MutationResult<{ product: { id: string } }>;
    }>(PRODUCT_BODY_UPDATE, {
      input: { id: resourceId, descriptionHtml: newHtml },
    });
    throwOnUserErrors(data.productUpdate.userErrors);
  } else if (type === "collection") {
    const data = await shopifyGraphQL<{
      collectionUpdate: MutationResult<{ collection: { id: string } }>;
    }>(COLLECTION_BODY_UPDATE, {
      input: { id: resourceId, descriptionHtml: newHtml },
    });
    throwOnUserErrors(data.collectionUpdate.userErrors);
  } else if (type === "page") {
    const data = await shopifyGraphQL<{
      pageUpdate: MutationResult<{ page: { id: string } }>;
    }>(PAGE_BODY_UPDATE, {
      id: resourceId,
      page: { body: newHtml },
    });
    throwOnUserErrors(data.pageUpdate.userErrors);
  } else if (type === "article") {
    const data = await shopifyGraphQL<{
      articleUpdate: MutationResult<{ article: { id: string } }>;
    }>(ARTICLE_BODY_UPDATE, {
      id: resourceId,
      article: { body: newHtml },
    });
    throwOnUserErrors(data.articleUpdate.userErrors);
  } else {
    throw new Error(`Unsupported resource type: ${type}`);
  }

  await prisma.optimization.create({
    data: {
      resourceId,
      field: "bodyHtml",
      oldValue: existing.bodyHtml?.slice(0, 5000) ?? null,
      newValue: newHtml.slice(0, 5000),
      source,
      model,
    },
  });

  await prisma.resource.update({
    where: { id: resourceId },
    data: { bodyHtml: newHtml },
  });
}

export async function updateImageAlt(
  imageId: string,
  alt: string,
  source: "manual" | "ai" | "rule" = "manual",
  model?: string,
) {
  const img = await prisma.image.findUnique({
    where: { id: imageId },
    include: { resource: true },
  });
  if (!img) throw new Error(`Image not found: ${imageId}`);

  // fileUpdate only accepts MediaImage / GenericFile GIDs from the Files
  // library — typically attached to products + collections. Article and page
  // featured images come from a transient Image type whose id can't be
  // passed back to fileUpdate. Route by parent resource type.
  const rtype = img.resource?.type ?? "";
  if (rtype === "article") {
    const data = await shopifyGraphQL<{
      articleUpdate: MutationResult<{ article: { id: string } | null }>;
    }>(ARTICLE_UPDATE, {
      id: img.resourceId,
      article: { image: { altText: alt } },
    });
    throwOnUserErrors(data.articleUpdate.userErrors);
  } else if (rtype === "page") {
    // Pages don't expose a featured-image-alt field via Admin API; record
    // locally so the user knows it's set, but skip the remote mutation.
  } else {
    const data = await shopifyGraphQL<{
      fileUpdate: MutationResult<{ files: Array<{ id: string }> }>;
    }>(PRODUCT_IMAGE_UPDATE, {
      files: [{ id: imageId, alt }],
    });
    throwOnUserErrors(data.fileUpdate.userErrors);
  }

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

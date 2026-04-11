// Paginated fetchers for every resource type we care about.
// Each fetcher yields batches so the scanner can stream them into the DB
// without loading the whole catalog into memory.

import { shopifyGraphQL } from "./shopify";

export type ShopifyImage = {
  id: string;
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  onlineStoreUrl: string | null;
  seo: { title: string | null; description: string | null };
  images: ShopifyImage[];
};

export type ShopifyCollection = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  onlineStoreUrl: string | null;
  seo: { title: string | null; description: string | null };
  image: ShopifyImage | null;
};

export type ShopifyPage = {
  id: string;
  handle: string;
  title: string;
  body: string;
  isPublished: boolean;
  // Pages don't have a separate seo object — title/description live on the metafields,
  // but for our purposes we use the page title as fallback.
};

export type ShopifyArticle = {
  id: string;
  handle: string;
  title: string;
  body: string;
  isPublished: boolean;
  blog: { id: string; title: string; handle: string } | null;
  image: ShopifyImage | null;
};

const PAGE_SIZE = 50;

// ---------- Products ----------

const PRODUCTS_QUERY = /* GraphQL */ `
  query ScanProducts($cursor: String) {
    products(first: ${PAGE_SIZE}, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        vendor
        productType
        tags
        status
        onlineStoreUrl
        seo { title description }
        images(first: 50) {
          nodes { id url altText width height }
        }
      }
    }
  }
`;

export async function* fetchAllProducts(): AsyncGenerator<ShopifyProduct[]> {
  let cursor: string | null = null;
  while (true) {
    const data: any = await shopifyGraphQL<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<
          Omit<ShopifyProduct, "images"> & {
            images: { nodes: ShopifyImage[] };
          }
        >;
      };
    }>(PRODUCTS_QUERY, { cursor });

    const batch: ShopifyProduct[] = data.products.nodes.map(
      (p: any) => ({
        ...p,
        images: p.images.nodes,
      }),
    );
    yield batch;

    if (!data.products.pageInfo.hasNextPage) return;
    cursor = data.products.pageInfo.endCursor;
  }
}

// ---------- Collections ----------

const COLLECTIONS_QUERY = /* GraphQL */ `
  query ScanCollections($cursor: String) {
    collections(first: ${PAGE_SIZE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        descriptionHtml
        onlineStoreUrl
        seo { title description }
        image { id url altText width height }
      }
    }
  }
`;

export async function* fetchAllCollections(): AsyncGenerator<
  ShopifyCollection[]
> {
  let cursor: string | null = null;
  while (true) {
    const data: any = await shopifyGraphQL<{
      collections: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ShopifyCollection[];
      };
    }>(COLLECTIONS_QUERY, { cursor });

    yield data.collections.nodes;
    if (!data.collections.pageInfo.hasNextPage) return;
    cursor = data.collections.pageInfo.endCursor;
  }
}

// ---------- Pages ----------

const PAGES_QUERY = /* GraphQL */ `
  query ScanPages($cursor: String) {
    pages(first: ${PAGE_SIZE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        body
        isPublished
      }
    }
  }
`;

export async function* fetchAllPages(): AsyncGenerator<ShopifyPage[]> {
  let cursor: string | null = null;
  while (true) {
    const data: any = await shopifyGraphQL<{
      pages: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ShopifyPage[];
      };
    }>(PAGES_QUERY, { cursor });

    yield data.pages.nodes;
    if (!data.pages.pageInfo.hasNextPage) return;
    cursor = data.pages.pageInfo.endCursor;
  }
}

// ---------- Articles ----------

const ARTICLES_QUERY = /* GraphQL */ `
  query ScanArticles($cursor: String) {
    articles(first: ${PAGE_SIZE}, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        handle
        title
        body
        isPublished
        blog { id title handle }
        image { id url altText width height }
      }
    }
  }
`;

export async function* fetchAllArticles(): AsyncGenerator<ShopifyArticle[]> {
  let cursor: string | null = null;
  while (true) {
    const data: any = await shopifyGraphQL<{
      articles: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ShopifyArticle[];
      };
    }>(ARTICLES_QUERY, { cursor });

    yield data.articles.nodes;
    if (!data.articles.pageInfo.hasNextPage) return;
    cursor = data.articles.pageInfo.endCursor;
  }
}

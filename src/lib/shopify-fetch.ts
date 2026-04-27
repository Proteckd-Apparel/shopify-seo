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

export type ShopifyVariant = {
  id: string;
  title: string;
  sku: string | null;
  barcode: string | null;
  price: string; // Money string e.g. "147.00"
  compareAtPrice: string | null;
  availableForSale: boolean;
  inventoryQuantity: number | null;
  selectedOptions: Array<{ name: string; value: string }>;
  image: ShopifyImage | null;
  weight: number | null;
  weightUnit: string | null;
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
  options: Array<{ name: string; values: string[] }>;
  priceRangeV2: {
    minVariantPrice: { amount: string; currencyCode: string };
    maxVariantPrice: { amount: string; currencyCode: string };
  } | null;
  images: ShopifyImage[];
  variants: ShopifyVariant[];
};

export type ShopifyCollection = {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
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
        options { name values }
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        images(first: 50) {
          nodes { id url altText width height }
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            barcode
            price
            compareAtPrice
            availableForSale
            inventoryQuantity
            selectedOptions { name value }
            image { id url altText width height }
          }
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
        variants: (p.variants?.nodes ?? []).map((v: any) => ({
          ...v,
          // Older API versions had weight on the variant; newer puts it under
          // inventoryItem.measurement. We don't fetch that to keep the query
          // shape simple — schema-side weight stays optional.
          weight: null,
          weightUnit: null,
        })),
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
        publishedAt
        updatedAt
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

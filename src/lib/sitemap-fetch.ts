// Fetchers specifically for sitemap generation. We hit Shopify Admin API
// directly (not the DB from scanner) so sitemaps are always fresh — scans
// may be days old, but sitemaps need to reflect catalog changes within
// hours to keep Google's index current.
//
// Each function paginates through everything and is meant to be called from
// a cached route (Next.js revalidate: 3600). One API call per hour per
// sitemap is cheap — ~200-300 products/articles per store means 1-2
// GraphQL calls per sitemap per hour.

import { shopifyGraphQL } from "./shopify";

export type SitemapImage = {
  url: string;
  altText: string | null;
};

export type SitemapProduct = {
  handle: string;
  onlineStoreUrl: string | null;
  updatedAt: string;
  images: SitemapImage[];
};

export type SitemapArticle = {
  handle: string;
  blogHandle: string;
  updatedAt: string;
  image: SitemapImage | null;
};

export type SitemapPage = {
  handle: string;
  updatedAt: string;
};

export type SitemapCollection = {
  handle: string;
  updatedAt: string;
  image: SitemapImage | null;
};

const PAGE_SIZE = 250;

// Primary domain (e.g. https://www.proteckd.com) — the canonical URL Google
// should index, not the .myshopify.com admin URL. Cached via the caller's
// revalidate window.
export async function fetchPrimaryDomain(): Promise<string | null> {
  const data = await shopifyGraphQL<{
    shop: { primaryDomain: { url: string } };
  }>(`#graphql
    query PrimaryDomain { shop { primaryDomain { url } } }
  `);
  return data?.shop?.primaryDomain?.url ?? null;
}

export async function fetchAllProductsForSitemap(): Promise<SitemapProduct[]> {
  const out: SitemapProduct[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: any = await shopifyGraphQL<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          handle: string;
          onlineStoreUrl: string | null;
          updatedAt: string;
          images: { nodes: Array<{ url: string; altText: string | null }> };
        }>;
      };
    }>(
      `#graphql
        query ProductsForSitemap($cursor: String) {
          products(first: ${PAGE_SIZE}, after: $cursor, query: "status:active") {
            pageInfo { hasNextPage endCursor }
            nodes {
              handle
              onlineStoreUrl
              updatedAt
              images(first: 50) { nodes { url altText } }
            }
          }
        }
      `,
      { cursor },
    );
    for (const p of data.products.nodes) {
      out.push({
        handle: p.handle,
        onlineStoreUrl: p.onlineStoreUrl,
        updatedAt: p.updatedAt,
        images: p.images.nodes,
      });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

export async function fetchAllArticlesForSitemap(): Promise<SitemapArticle[]> {
  const out: SitemapArticle[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: any = await shopifyGraphQL<{
      articles: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          handle: string;
          updatedAt: string;
          blog: { handle: string } | null;
          image: { url: string; altText: string | null } | null;
          isPublished: boolean;
        }>;
      };
    }>(
      `#graphql
        query ArticlesForSitemap($cursor: String) {
          articles(first: ${PAGE_SIZE}, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              handle
              updatedAt
              isPublished
              blog { handle }
              image { url altText }
            }
          }
        }
      `,
      { cursor },
    );
    for (const a of data.articles.nodes) {
      if (!a.isPublished || !a.blog) continue;
      out.push({
        handle: a.handle,
        blogHandle: a.blog.handle,
        updatedAt: a.updatedAt,
        image: a.image,
      });
    }
    if (!data.articles.pageInfo.hasNextPage) break;
    cursor = data.articles.pageInfo.endCursor;
  }
  return out;
}

export async function fetchAllPagesForSitemap(): Promise<SitemapPage[]> {
  const out: SitemapPage[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: any = await shopifyGraphQL<{
      pages: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{ handle: string; updatedAt: string; isPublished: boolean }>;
      };
    }>(
      `#graphql
        query PagesForSitemap($cursor: String) {
          pages(first: ${PAGE_SIZE}, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { handle updatedAt isPublished }
          }
        }
      `,
      { cursor },
    );
    for (const p of data.pages.nodes) {
      if (!p.isPublished) continue;
      out.push({ handle: p.handle, updatedAt: p.updatedAt });
    }
    if (!data.pages.pageInfo.hasNextPage) break;
    cursor = data.pages.pageInfo.endCursor;
  }
  return out;
}

export async function fetchAllCollectionsForSitemap(): Promise<SitemapCollection[]> {
  const out: SitemapCollection[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: any = await shopifyGraphQL<{
      collections: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: Array<{
          handle: string;
          updatedAt: string;
          image: { url: string; altText: string | null } | null;
        }>;
      };
    }>(
      `#graphql
        query CollectionsForSitemap($cursor: String) {
          collections(first: ${PAGE_SIZE}, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { handle updatedAt image { url altText } }
          }
        }
      `,
      { cursor },
    );
    for (const c of data.collections.nodes) {
      out.push({
        handle: c.handle,
        updatedAt: c.updatedAt,
        image: c.image,
      });
    }
    if (!data.collections.pageInfo.hasNextPage) break;
    cursor = data.collections.pageInfo.endCursor;
  }
  return out;
}

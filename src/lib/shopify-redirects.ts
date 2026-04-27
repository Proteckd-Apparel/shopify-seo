import { shopifyGraphQL } from "./shopify";

export type ShopifyRedirect = {
  id: string;
  path: string;
  target: string;
};

const LIST_QUERY = /* GraphQL */ `
  query Redirects($cursor: String) {
    urlRedirects(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id path target }
    }
  }
`;

const READ_QUERY = /* GraphQL */ `
  query RedirectById($id: ID!) {
    urlRedirect(id: $id) { id path target }
  }
`;

export async function readRedirect(
  id: string,
): Promise<ShopifyRedirect | null> {
  const data = await shopifyGraphQL<{
    urlRedirect: ShopifyRedirect | null;
  }>(READ_QUERY, { id });
  return data.urlRedirect;
}

const CREATE_MUTATION = /* GraphQL */ `
  mutation RedirectCreate($input: UrlRedirectInput!) {
    urlRedirectCreate(urlRedirect: $input) {
      urlRedirect { id path target }
      userErrors { field message }
    }
  }
`;

const DELETE_MUTATION = /* GraphQL */ `
  mutation RedirectDelete($id: ID!) {
    urlRedirectDelete(id: $id) {
      deletedUrlRedirectId
      userErrors { field message }
    }
  }
`;

export async function listRedirects(): Promise<ShopifyRedirect[]> {
  const all: ShopifyRedirect[] = [];
  let cursor: string | null = null;
  while (true) {
    const data: {
      urlRedirects: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: ShopifyRedirect[];
      };
    } = await shopifyGraphQL(LIST_QUERY, { cursor });
    all.push(...data.urlRedirects.nodes);
    if (!data.urlRedirects.pageInfo.hasNextPage) return all;
    cursor = data.urlRedirects.pageInfo.endCursor;
  }
}

export async function createRedirect(
  path: string,
  target: string,
): Promise<ShopifyRedirect> {
  const data: {
    urlRedirectCreate: {
      urlRedirect: ShopifyRedirect;
      userErrors: Array<{ message: string }>;
    };
  } = await shopifyGraphQL(CREATE_MUTATION, { input: { path, target } });
  if (data.urlRedirectCreate.userErrors?.length) {
    throw new Error(
      data.urlRedirectCreate.userErrors.map((e) => e.message).join("; "),
    );
  }
  return data.urlRedirectCreate.urlRedirect;
}

export async function deleteRedirect(id: string): Promise<void> {
  const data: {
    urlRedirectDelete: {
      deletedUrlRedirectId: string | null;
      userErrors: Array<{ message: string }>;
    };
  } = await shopifyGraphQL(DELETE_MUTATION, { id });
  if (data.urlRedirectDelete.userErrors?.length) {
    throw new Error(
      data.urlRedirectDelete.userErrors.map((e) => e.message).join("; "),
    );
  }
}

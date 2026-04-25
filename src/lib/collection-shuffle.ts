// Daily-seeded collection shuffle. Pins the first N products, shuffles the
// rest deterministically using today's date as the seed — same order all day,
// new order tomorrow. Only works on collections whose sortOrder is MANUAL;
// smart/auto-sorted collections are skipped.

import { shopifyGraphQL } from "./shopify";

const COLLECTION_FETCH = /* GraphQL */ `
  query ShuffleCollectionFetch($handle: String!, $cursor: String) {
    collectionByHandle(handle: $handle) {
      id
      handle
      sortOrder
      products(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes { id }
      }
    }
  }
`;

const COLLECTION_REORDER = /* GraphQL */ `
  mutation ShuffleCollectionReorder($id: ID!, $moves: [MoveInput!]!) {
    collectionReorderProducts(id: $id, moves: $moves) {
      job { id done }
      userErrors { field message }
    }
  }
`;

type CollectionFetchResp = {
  collectionByHandle: {
    id: string;
    handle: string;
    sortOrder: string;
    products: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: { id: string }[];
    };
  } | null;
};

type CollectionReorderResp = {
  collectionReorderProducts: {
    job: { id: string; done: boolean } | null;
    userErrors: { field: string[]; message: string }[];
  };
};

// mulberry32 — tiny deterministic PRNG. Same seed → same sequence.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Seed = handle + YYYY-MM-DD (UTC). Different collections shuffle differently;
// same collection re-shuffles once per UTC day.
function dailySeed(handle: string, date = new Date()): number {
  const ymd = date.toISOString().slice(0, 10);
  return hashString(`${handle}:${ymd}`);
}

function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function fetchAllProductIds(handle: string): Promise<{
  id: string;
  sortOrder: string;
  productIds: string[];
} | null> {
  let cursor: string | null = null;
  let collectionId = "";
  let sortOrder = "";
  const productIds: string[] = [];

  while (true) {
    const data: CollectionFetchResp = await shopifyGraphQL<CollectionFetchResp>(
      COLLECTION_FETCH,
      { handle, cursor },
    );
    const col = data.collectionByHandle;
    if (!col) return null;
    collectionId = col.id;
    sortOrder = col.sortOrder;
    for (const n of col.products.nodes) productIds.push(n.id);
    if (!col.products.pageInfo.hasNextPage) break;
    cursor = col.products.pageInfo.endCursor;
  }

  return { id: collectionId, sortOrder, productIds };
}

export type ShuffleReport = {
  handle: string;
  status: "shuffled" | "skipped" | "not-found" | "error";
  reason?: string;
  products?: number;
  pinned?: number;
};

export async function shuffleCollection(
  handle: string,
  pinCount: number,
  date = new Date(),
): Promise<ShuffleReport> {
  try {
    const fetched = await fetchAllProductIds(handle);
    if (!fetched) {
      return { handle, status: "not-found" };
    }

    if (fetched.sortOrder !== "MANUAL") {
      return {
        handle,
        status: "skipped",
        reason: `sortOrder=${fetched.sortOrder} (must be MANUAL)`,
        products: fetched.productIds.length,
      };
    }

    const total = fetched.productIds.length;
    if (total <= pinCount + 1) {
      return {
        handle,
        status: "skipped",
        reason: "not enough products to shuffle",
        products: total,
      };
    }

    const pinned = fetched.productIds.slice(0, pinCount);
    const tail = fetched.productIds.slice(pinCount);
    const shuffledTail = shuffleWithSeed(tail, dailySeed(handle, date));
    const finalOrder = [...pinned, ...shuffledTail];

    // Build moves for the tail only — pinned items keep their positions.
    const moves = shuffledTail.map((id, idx) => ({
      id,
      newPosition: String(pinCount + idx),
    }));

    // Shopify caps moves per mutation at 250.
    const CHUNK = 250;
    for (let i = 0; i < moves.length; i += CHUNK) {
      const chunk = moves.slice(i, i + CHUNK);
      const resp = await shopifyGraphQL<CollectionReorderResp>(
        COLLECTION_REORDER,
        { id: fetched.id, moves: chunk },
      );
      const errs = resp.collectionReorderProducts.userErrors;
      if (errs.length > 0) {
        return {
          handle,
          status: "error",
          reason: errs.map((e) => e.message).join("; "),
          products: total,
        };
      }
    }

    return {
      handle,
      status: "shuffled",
      products: total,
      pinned: pinCount,
    };
  } catch (e) {
    return {
      handle,
      status: "error",
      reason: e instanceof Error ? e.message : "unknown",
    };
  }
}

export async function shuffleConfiguredCollections(date = new Date()) {
  const raw = process.env.SHUFFLE_COLLECTIONS?.trim() || "";
  const pinCount = Number(process.env.SHUFFLE_PIN_COUNT || 3);
  const handles = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (handles.length === 0) {
    return {
      ok: false,
      error: "SHUFFLE_COLLECTIONS env var is empty",
      reports: [] as ShuffleReport[],
    };
  }

  const reports: ShuffleReport[] = [];
  for (const h of handles) {
    reports.push(await shuffleCollection(h, pinCount, date));
  }
  return { ok: true, pinCount, reports };
}

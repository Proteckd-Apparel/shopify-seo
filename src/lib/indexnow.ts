// IndexNow submission helper. Protocol spec: https://www.indexnow.org/documentation
// We host the key file via the existing Shopify App Proxy so keyLocation can
// point at a path on the merchant's own domain (required for Bing/Yandex to
// verify ownership).

import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH_SIZE = 10_000; // IndexNow hard limit per request

export type SubmitResult = {
  submitted: number;
  batches: number;
  ok: boolean;
  error?: string;
};

export async function getOrCreateIndexNowKey(): Promise<string> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (s?.indexNowKey) return s.indexNowKey;
  const key = randomUUID().replace(/-/g, "");
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { indexNowKey: key },
    create: { id: 1, indexNowKey: key },
  });
  return key;
}

// Public URL we claim the key file is at. Must sit at the storefront root
// (or a parent of every submitted URL) because Bing's IndexNow validator
// scopes accepted URLs to the keyLocation's path. A stable /indexnow.txt
// path means the Shopify URL Redirect only needs to be set up once and
// survives key rotations.
export async function indexNowKeyLocation(): Promise<string | null> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  const publicDomain = s?.storefrontDomain?.trim() || s?.shopDomain;
  if (!publicDomain) return null;
  return `https://${publicDomain.replace(/^https?:\/\//, "")}/indexnow.txt`;
}

// Where the key file is actually served inside the app (behind the App
// Proxy). Surfaced on the tools page so the merchant can construct the
// Shopify URL Redirect target: /indexnow.txt → /apps/<subpath>/feeds/indexnow-key.txt
export function indexNowKeyProxyPath(): string {
  return "/feeds/indexnow-key.txt";
}

type ArticleRawBlog = {
  blog?: { handle?: string | null } | null;
};

// Build URLs from origin + handle so every URL lives on the verified public
// domain. Ignoring Resource.url is intentional — that field holds whatever
// Shopify returned, usually the myshopify.com origin, which IndexNow rejects
// with "URLs are not related to your verified domain".
export async function collectStoreUrls(origin: string): Promise<string[]> {
  const rows = await prisma.resource.findMany({
    where: {
      OR: [
        { type: "product", status: "active" },
        { type: "collection" },
        { type: "article", status: "published" },
        { type: "page", status: "published" },
      ],
    },
    select: { type: true, handle: true, raw: true },
  });

  const urls = new Set<string>();
  urls.add(`${origin}/`);
  for (const r of rows) {
    if (!r.handle) continue;
    if (r.type === "product")
      urls.add(`${origin}/products/${r.handle}`);
    else if (r.type === "collection")
      urls.add(`${origin}/collections/${r.handle}`);
    else if (r.type === "page")
      urls.add(`${origin}/pages/${r.handle}`);
    else if (r.type === "article") {
      let blogHandle: string | null = null;
      try {
        const raw = r.raw ? (JSON.parse(r.raw) as ArticleRawBlog) : {};
        blogHandle = raw.blog?.handle ?? null;
      } catch {
        blogHandle = null;
      }
      if (blogHandle)
        urls.add(`${origin}/blogs/${blogHandle}/${r.handle}`);
    }
  }
  return [...urls];
}

export async function submitUrlsToIndexNow(urls: string[]): Promise<SubmitResult> {
  if (urls.length === 0) {
    return { submitted: 0, batches: 0, ok: true };
  }
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s?.indexNowEnabled) {
    return { submitted: 0, batches: 0, ok: true };
  }
  const key = s.indexNowKey ?? (await getOrCreateIndexNowKey());
  const keyLocation = await indexNowKeyLocation();
  if (!keyLocation) {
    return {
      submitted: 0,
      batches: 0,
      ok: false,
      error: "Set a storefront domain in Settings before submitting.",
    };
  }

  const host = new URL(keyLocation).host;
  let submitted = 0;
  let batches = 0;
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation, urlList: batch }),
    });
    batches++;
    // IndexNow returns 200 for accepted, 202 for accepted-but-unverified,
    // 400/403/422/429 for errors. Anything 2xx is counted as submitted.
    if (res.status >= 200 && res.status < 300) {
      submitted += batch.length;
    } else {
      const text = await res.text().catch(() => "");
      const err = `IndexNow HTTP ${res.status}: ${text.slice(0, 200)}`;
      await prisma.settings.update({
        where: { id: 1 },
        data: {
          indexNowLastError: err,
          indexNowLastSubmittedAt: new Date(),
          indexNowLastSubmittedCount: submitted,
        },
      });
      return { submitted, batches, ok: false, error: err };
    }
  }

  await prisma.settings.update({
    where: { id: 1 },
    data: {
      indexNowLastError: null,
      indexNowLastSubmittedAt: new Date(),
      indexNowLastSubmittedCount: submitted,
    },
  });
  return { submitted, batches, ok: true };
}

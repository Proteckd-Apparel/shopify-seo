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

// URL where the key file is served on the merchant's public domain.
// Uses SHOPIFY_APP_PROXY_URL (same env var the sitemap uses) so all proxy
// paths live under one setting.
export function indexNowKeyLocation(): string | null {
  const proxy = process.env.SHOPIFY_APP_PROXY_URL?.replace(/\/$/, "");
  if (!proxy) return null;
  return `${proxy}/feeds/indexnow-key.txt`;
}

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
    select: { type: true, handle: true, url: true },
  });

  const urls = new Set<string>();
  for (const r of rows) {
    if (r.url) {
      urls.add(r.url);
      continue;
    }
    if (!r.handle) continue;
    const prefix =
      r.type === "product"
        ? "products"
        : r.type === "collection"
          ? "collections"
          : r.type === "page"
            ? "pages"
            : null;
    if (prefix) urls.add(`${origin}/${prefix}/${r.handle}`);
    // Articles need their blog handle which isn't in the columns; skip them
    // from auto-collection. Manual / real-time submission can include them.
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
  const keyLocation = indexNowKeyLocation();
  if (!keyLocation) {
    return {
      submitted: 0,
      batches: 0,
      ok: false,
      error: "SHOPIFY_APP_PROXY_URL env not set; key file isn't reachable.",
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

// Replicate client. Used for Real-ESRGAN image upscaling.
//
// We use Replicate's HTTP API directly instead of their SDK to avoid the
// extra dependency. Each call:
//   1. POST /v1/predictions with the model version + input
//   2. Poll the returned URL until status === "succeeded"
//   3. Download the upscaled image bytes
//
// Free Real-ESRGAN model: nightmareai/real-esrgan
//   Input: { image: <data url or http url>, scale: 2 | 4 }
//   Output: <https url to upscaled image>
//
// Model version rotation: Replicate occasionally retires old versions or the
// uploader pushes a new SHA. Override REPLICATE_REAL_ESRGAN_VERSION in env to
// test a new pin without a code change. The fallback below is the last known
// working version on nightmareai/real-esrgan.

import { prisma } from "./prisma";

const FALLBACK_REAL_ESRGAN_VERSION =
  "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";
const REAL_ESRGAN_VERSION =
  process.env.REPLICATE_REAL_ESRGAN_VERSION?.trim() ||
  FALLBACK_REAL_ESRGAN_VERSION;

async function getReplicateToken(): Promise<string | null> {
  const s = await prisma.settings.findUnique({ where: { id: 1 } });
  return s?.replicateToken || process.env.REPLICATE_API_KEY || null;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!RETRY_STATUSES.has(res.status) || attempt === MAX_RETRIES) {
        return res;
      }
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const wait = retryAfter > 0
        ? retryAfter * 1000
        : Math.min(500 * 2 ** attempt + Math.random() * 250, 4000);
      await new Promise((r) => setTimeout(r, wait));
    } catch (e) {
      lastErr = e;
      if (attempt === MAX_RETRIES) throw e;
      await new Promise((r) =>
        setTimeout(r, Math.min(500 * 2 ** attempt + Math.random() * 250, 4000)),
      );
    }
  }
  throw lastErr ?? new Error("fetchWithRetry: exhausted");
}

async function rApi<T>(
  path: string,
  init: RequestInit & { method?: string } = {},
): Promise<T> {
  const token = await getReplicateToken();
  if (!token) throw new Error("Replicate token not configured (Settings)");
  const res = await fetchWithRetry(`https://api.replicate.com${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Replicate ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type Prediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
  urls: { get: string; cancel: string };
};

// Upscale an image by 2× or 4× using Real-ESRGAN. Pass either a public HTTPS
// URL Replicate can fetch, or a base64 data URL.
export async function upscaleImage(
  imageUrlOrDataUrl: string,
  scale: 2 | 4 = 2,
): Promise<{ url: string }> {
  const start = await rApi<Prediction>("/v1/predictions", {
    method: "POST",
    body: JSON.stringify({
      version: REAL_ESRGAN_VERSION,
      input: {
        image: imageUrlOrDataUrl,
        scale,
        face_enhance: false,
      },
    }),
  });

  // Poll until done
  let p = start;
  const deadline = Date.now() + 90_000;
  while (
    p.status !== "succeeded" &&
    p.status !== "failed" &&
    p.status !== "canceled"
  ) {
    if (Date.now() > deadline) {
      throw new Error("Replicate timed out after 90 seconds");
    }
    await new Promise((r) => setTimeout(r, 1500));
    p = await rApi<Prediction>(`/v1/predictions/${p.id}`);
  }

  if (p.status !== "succeeded") {
    throw new Error(`Replicate failed: ${p.error ?? "unknown error"}`);
  }

  const out = Array.isArray(p.output) ? p.output[0] : p.output;
  if (!out) throw new Error("Replicate returned no output");
  return { url: out };
}

// Test the Replicate connection without spending credits.
export async function testReplicate(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const token = await getReplicateToken();
    if (!token) return { ok: false, message: "No token configured" };
    const res = await fetchWithRetry("https://api.replicate.com/v1/account", {
      headers: { Authorization: `Token ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        ok: false,
        message: `${res.status}: ${body.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as { username?: string; type?: string };
    return {
      ok: true,
      message: `Connected as ${data.username ?? "unknown"}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Failed" };
  }
}

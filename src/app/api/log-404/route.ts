// Public endpoint that the storefront tracking pixel hits when a customer
// lands on a 404 page. We upsert by URL so repeat hits bump `count` and
// `lastSeen` instead of creating duplicates.
//
// Shopify has no native 404 webhook, so this is the only way to capture
// real, user-facing 404s. The companion Liquid snippet lives in the
// /tools/404-errors page UI.

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Tiny in-memory rate limiter — 60 requests/min per IP. Resets on cold start
// which is fine; this is just spam protection, not a security boundary.
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  b.count++;
  return b.count <= 60;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// 1x1 transparent GIF — what we return for image-beacon GETs so the
// browser is happy and adblockers see a normal image load.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

async function recordHit(args: {
  url: string;
  referrer: string | null;
  userAgent: string | null;
}): Promise<{ redirect: string | null }> {
  let redirect: string | null = null;
  await prisma.notFound.upsert({
    where: { url: args.url },
    create: { url: args.url, referrer: args.referrer, userAgent: args.userAgent },
    update: {
      count: { increment: 1 },
      lastSeen: new Date(),
      referrer: args.referrer,
      userAgent: args.userAgent,
    },
  });
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings?.redirect404ToHome) {
    const existing = await prisma.redirect.findUnique({
      where: { fromPath: args.url },
    });
    redirect = existing ? existing.toPath : "/";
  }
  return { redirect };
}

// GET variant — used by the image-beacon snippet so adblockers don't
// strip the request. Returns a 1x1 GIF regardless.
export async function GET(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  if (!rateLimit(ip)) {
    return new Response(PIXEL, {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "image/gif" },
    });
  }
  const u = new URL(request.url);
  const url = (u.searchParams.get("u") ?? "").trim().slice(0, 2000);
  const referrer = u.searchParams.get("r")?.slice(0, 2000) ?? null;
  const userAgent =
    request.headers.get("user-agent")?.slice(0, 500) ?? null;
  if (url) {
    try {
      await recordHit({ url, referrer, userAgent });
    } catch {}
  }
  return new Response(PIXEL, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "image/gif",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!rateLimit(ip)) {
    return new Response("rate limited", { status: 429, headers: CORS_HEADERS });
  }

  let body: { url?: string; referrer?: string; userAgent?: string };
  try {
    body = await request.json();
  } catch {
    return new Response("bad json", { status: 400, headers: CORS_HEADERS });
  }

  const url = (body.url ?? "").trim();
  if (!url || url.length > 2000) {
    return new Response("bad url", { status: 400, headers: CORS_HEADERS });
  }

  const referrer = body.referrer?.slice(0, 2000) ?? null;
  const userAgent = body.userAgent?.slice(0, 500) ?? null;

  let redirect: string | null = null;
  try {
    const r = await recordHit({ url, referrer, userAgent });
    redirect = r.redirect;
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, redirect }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

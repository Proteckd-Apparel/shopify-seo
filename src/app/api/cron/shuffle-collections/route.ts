// Daily collection shuffle. Point proteckd-cron at this URL once a day; it
// re-orders each collection listed in SHUFFLE_COLLECTIONS, keeping the first
// SHUFFLE_PIN_COUNT (default 3) products pinned at the top.
//
// Auth: Bearer CRON_SECRET (same secret the other cron endpoints use).
// Config:
//   SHUFFLE_COLLECTIONS = comma-separated collection handles (e.g. "all,mens,womens")
//   SHUFFLE_PIN_COUNT   = number of top products to keep pinned (default 3)
//
// Only collections with sortOrder=MANUAL can be reordered; others are skipped
// with a reason in the report.

import { shuffleConfiguredCollections } from "@/lib/collection-shuffle";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const report = await shuffleConfiguredCollections();
    return Response.json(report);
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}

export const GET = POST;

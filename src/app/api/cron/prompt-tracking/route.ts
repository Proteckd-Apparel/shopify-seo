// Weekly Prompt Tracking cron. Add this URL to the proteckd-cron worker
// with Bearer CRON_SECRET. Every enabled tracked prompt gets asked across
// every keyed provider; responses are scanned for brand keyword mentions.

import { runPromptTracking } from "@/lib/prompt-tracking";

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
    const report = await runPromptTracking();
    return Response.json({ ok: true, ...report });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}

export const GET = POST;

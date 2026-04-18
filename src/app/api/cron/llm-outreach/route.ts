// Weekly LLM outreach. Point the central Cloudflare cron worker at this URL
// on whatever cadence you want (e.g. Sundays). Auth: Bearer CRON_SECRET,
// same pattern as /api/cron/cleanup.

import { runOutreach } from "@/lib/llm-outreach";

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
    const report = await runOutreach();
    return Response.json({ ok: true, ...report });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}

export const GET = POST;

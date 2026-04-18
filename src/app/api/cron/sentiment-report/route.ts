// Monthly Sentiment Report cron. Point the proteckd-cron worker here with
// Bearer CRON_SECRET. Each keyed LLM is asked a structured question about
// brand perception; responses are parsed as JSON and logged.

import { runSentimentReport } from "@/lib/sentiment-report";

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
    const report = await runSentimentReport();
    return Response.json({ ok: true, ...report });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}

export const GET = POST;

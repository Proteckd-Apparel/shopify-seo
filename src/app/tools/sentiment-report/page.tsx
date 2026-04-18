import { Smile, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PROVIDERS, type Provider } from "@/lib/llm-outreach-shared";
import { RunButton } from "./controls";

export const dynamic = "force-dynamic";

function safeParseArr(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function SentimentReportPage() {
  const [s, reports] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.sentimentReport.findMany({
      orderBy: { runAt: "desc" },
      take: 120,
    }),
  ]);

  const keys: Record<Provider, boolean> = {
    openai: Boolean(s?.openaiKey),
    anthropic: Boolean(s?.anthropicKey),
    gemini: Boolean(s?.geminiKey),
    perplexity: Boolean(s?.perplexityKey),
    xai: Boolean(s?.xaiKey),
  };

  const byProvider = new Map<Provider, typeof reports>();
  for (const p of PROVIDERS) byProvider.set(p.id, []);
  for (const r of reports) {
    const arr = byProvider.get(r.provider as Provider);
    if (arr) arr.push(r);
  }

  return (
    <div>
      <PageHeader
        icon={Smile}
        title="LLM Sentiment Report"
        description="See how ChatGPT, Claude, Gemini, Perplexity, and Grok perceive your brand."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-900 mb-2">How it works</h3>
        <p>
          Each keyed provider is asked a structured question about your brand
          (<code className="font-mono text-xs bg-slate-100 px-1 rounded">
            {s?.storeName?.trim() || s?.shopDomain || "(set a store name)"}
          </code>
          ). Responses are parsed as JSON and graded positive / neutral /
          negative / unknown. Monthly cadence is enough — LLM perception
          changes slowly and is tied to model release cycles.
        </p>
        <div className="mt-3">
          <RunButton provider="" label="Run report now" />
        </div>
      </div>

      <div className="max-w-4xl space-y-3">
        {PROVIDERS.map((p) => {
          const list = byProvider.get(p.id) ?? [];
          const latest = list.find((r) => r.status === "success");
          const hasKey = keys[p.id];
          return (
            <div
              key={p.id}
              className="bg-white border border-slate-200 rounded-lg p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-900">
                    {p.label}{" "}
                    <span className="text-xs text-slate-500">({p.vendor})</span>
                  </div>
                  {!hasKey && (
                    <div className="text-xs text-amber-600 mt-0.5">
                      No API key set.
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <SentimentPill sentiment={latest?.sentiment ?? null} />
                  <RunButton provider={p.id} disabled={!hasKey} />
                </div>
              </div>

              {latest && latest.summary && (
                <div className="mt-3 text-sm text-slate-700">
                  <p>{latest.summary}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    {safeParseArr(latest.strengths).length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-emerald-700 mb-1">
                          Strengths
                        </div>
                        <ul className="text-xs text-slate-600 list-disc pl-4 space-y-0.5">
                          {safeParseArr(latest.strengths).map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {safeParseArr(latest.concerns).length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-red-700 mb-1">
                          Concerns
                        </div>
                        <ul className="text-xs text-slate-600 list-disc pl-4 space-y-0.5">
                          {safeParseArr(latest.concerns).map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    Last run: {latest.runAt.toLocaleString()}
                    {typeof latest.confidence === "number" &&
                      ` · confidence ${Math.round(latest.confidence * 100)}%`}
                  </div>
                </div>
              )}

              {list.length > 1 && (
                <details className="mt-3 text-xs">
                  <summary className="cursor-pointer text-slate-500">
                    History ({list.length} runs)
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {list.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 border-t border-slate-100 pt-1 first:border-t-0 first:pt-0"
                      >
                        <span className="text-slate-400 font-mono whitespace-nowrap">
                          {new Date(r.runAt).toISOString().slice(0, 10)}
                        </span>
                        <SentimentPill sentiment={r.sentiment} compact />
                        <span
                          className="text-slate-500 truncate flex-1"
                          title={r.summary ?? r.error ?? ""}
                        >
                          {r.summary ?? r.error ?? ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-4xl text-xs text-amber-900 mt-4">
        <strong>Cron:</strong> add{" "}
        <code className="bg-amber-100 px-1 rounded font-mono">
          POST /api/cron/sentiment-report
        </code>{" "}
        to the proteckd-cron worker on a monthly schedule with{" "}
        <code className="bg-amber-100 px-1 rounded font-mono">
          Authorization: Bearer $CRON_SECRET
        </code>
        .
      </div>
    </div>
  );
}

function SentimentPill({
  sentiment,
  compact,
}: {
  sentiment: string | null;
  compact?: boolean;
}) {
  const cls = compact ? "text-[11px] px-1.5 py-0" : "text-xs px-2 py-0.5";
  if (sentiment === "positive")
    return (
      <span
        className={`${cls} rounded bg-emerald-100 text-emerald-700 inline-flex items-center gap-1`}
      >
        <TrendingUp className="w-3 h-3" /> Positive
      </span>
    );
  if (sentiment === "negative")
    return (
      <span
        className={`${cls} rounded bg-red-100 text-red-700 inline-flex items-center gap-1`}
      >
        <TrendingDown className="w-3 h-3" /> Negative
      </span>
    );
  if (sentiment === "neutral")
    return (
      <span
        className={`${cls} rounded bg-slate-100 text-slate-700 inline-flex items-center gap-1`}
      >
        <Minus className="w-3 h-3" /> Neutral
      </span>
    );
  return (
    <span className={`${cls} rounded bg-slate-100 text-slate-500`}>
      No data
    </span>
  );
}

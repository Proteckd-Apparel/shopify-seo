import { Search, CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PROVIDERS, type Provider } from "@/lib/llm-outreach-shared";
import { AddPromptForm, ConfigForm, PromptRowActions } from "./controls";

export const dynamic = "force-dynamic";

function safeParse(s: string | null | undefined): Provider[] {
  if (!s) return PROVIDERS.map((p) => p.id);
  try {
    return JSON.parse(s) as Provider[];
  } catch {
    return PROVIDERS.map((p) => p.id);
  }
}

export default async function PromptTrackingPage() {
  const [s, prompts] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.trackedPrompt.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        results: {
          orderBy: { runAt: "desc" },
          take: 5,
        },
      },
    }),
  ]);

  const keys: Record<Provider, boolean> = {
    openai: Boolean(s?.openaiKey),
    anthropic: Boolean(s?.anthropicKey),
    gemini: Boolean(s?.geminiKey),
    perplexity: Boolean(s?.perplexityKey),
    xai: Boolean(s?.xaiKey),
  };

  return (
    <div>
      <PageHeader
        icon={Search}
        title="Prompt Tracking"
        description="Monitor whether LLMs mention your brand when asked relevant questions."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-900 mb-2">How it works</h3>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Add prompts you care about (e.g. &ldquo;best EMF clothing
            brands&rdquo;, &ldquo;where to buy faraday hats&rdquo;).
          </li>
          <li>
            On a cadence (default weekly via cron), each enabled provider is
            asked each prompt.
          </li>
          <li>
            Responses are scanned for your brand keywords. Results accumulate
            so you can tell whether LLMs are starting to know about you.
          </li>
        </ol>
      </div>

      <ConfigForm
        defaults={{
          brandKeywords: s?.promptBrandKeywords ?? "",
          enabledProviders: safeParse(s?.promptTrackingProviders),
          masterEnabled: s?.promptTrackingEnabled ?? true,
          keys,
        }}
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-4xl mt-4">
        <h3 className="font-semibold mb-3">Tracked prompts</h3>
        <AddPromptForm />
        {prompts.length === 0 && (
          <p className="text-sm text-slate-500 mt-3">
            No prompts yet. Add one above.
          </p>
        )}
        <div className="mt-4 space-y-3">
          {prompts.map((p) => {
            const mentions = p.results.filter((r) => r.brandMentioned).length;
            const total = p.results.length;
            return (
              <div
                key={p.id}
                className="border border-slate-200 rounded p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm break-words">
                      {p.text}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {total === 0
                        ? "Never run"
                        : `Mentioned in ${mentions}/${total} of last ${total} runs`}
                    </div>
                  </div>
                  <PromptRowActions id={p.id} enabled={p.enabled} />
                </div>
                {p.results.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {p.results.map((r) => {
                      const providerLabel =
                        PROVIDERS.find((x) => x.id === r.provider)?.label ||
                        r.provider;
                      return (
                        <li
                          key={r.id}
                          className="flex items-start gap-2 border-t border-slate-100 pt-1 first:border-t-0 first:pt-0"
                        >
                          <span className="text-slate-400 font-mono whitespace-nowrap">
                            {new Date(r.runAt).toISOString().slice(0, 10)}
                          </span>
                          <span className="text-slate-600 min-w-[90px]">
                            {providerLabel}
                          </span>
                          {r.status === "error" ? (
                            <span className="text-red-600 flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> error:{" "}
                              {(r.error ?? "").slice(0, 80)}
                            </span>
                          ) : r.brandMentioned ? (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> mentioned
                              {r.matchedKeyword && (
                                <span className="text-slate-500">
                                  (“{r.matchedKeyword}”)
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-500 flex items-center gap-1">
                              <XCircle className="w-3 h-3" /> no mention
                            </span>
                          )}
                          <span
                            className="text-slate-400 truncate flex-1"
                            title={r.response ?? ""}
                          >
                            {(r.response ?? "").slice(0, 120)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-4xl text-xs text-amber-900 mt-4">
        <strong>Cron:</strong> add{" "}
        <code className="bg-amber-100 px-1 rounded font-mono">
          POST /api/cron/prompt-tracking
        </code>{" "}
        to your proteckd-cron worker (weekly is a good default) with{" "}
        <code className="bg-amber-100 px-1 rounded font-mono">
          Authorization: Bearer $CRON_SECRET
        </code>
        .
      </div>
    </div>
  );
}

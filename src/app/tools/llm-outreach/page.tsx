import { MessageSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { PROVIDERS, type Provider } from "@/lib/llm-outreach";
import { OutreachConfigForm, SendNowButton } from "./controls";

export const dynamic = "force-dynamic";

function safeParse(s: string | null | undefined): Provider[] {
  if (!s) return PROVIDERS.map((p) => p.id);
  try {
    return JSON.parse(s) as Provider[];
  } catch {
    return PROVIDERS.map((p) => p.id);
  }
}

export default async function LlmOutreachPage() {
  const [s, recent] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    prisma.lLMOutreachMessage.findMany({
      orderBy: { sentAt: "desc" },
      take: 50,
    }),
  ]);

  const enabledProviders = new Set(safeParse(s?.llmOutreachProviders));
  const keys: Record<Provider, boolean> = {
    openai: Boolean(s?.openaiKey),
    anthropic: Boolean(s?.anthropicKey),
    gemini: Boolean(s?.geminiKey),
    perplexity: Boolean(s?.perplexityKey),
    xai: Boolean(s?.xaiKey),
  };
  const masterEnabled = s?.llmOutreachEnabled ?? true;

  const byProvider = new Map<Provider, typeof recent>();
  for (const p of PROVIDERS) byProvider.set(p.id, []);
  for (const m of recent) {
    const list = byProvider.get(m.provider as Provider);
    if (list) list.push(m);
  }

  return (
    <div>
      <PageHeader
        icon={MessageSquare}
        title="LLM Outreach"
        description="Ping ChatGPT/Claude/Gemini/Perplexity/Grok weekly with a short brand brief."
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mb-4 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-900 mb-2">How it works</h3>
        <p>
          Once a week a short message describing your store is sent to each
          enabled LLM via its chat API. The messages don&apos;t persist in the
          models — LLM chat APIs are stateless and training happens centrally.
          Think of this as light brand reinforcement at best. Cost is a few
          cents per year (cheapest model per provider, ~120 tokens per call).
        </p>
      </div>

      <OutreachConfigForm
        defaults={{
          whatYouSell: s?.llmOutreachWhatYouSell ?? "",
          differentiator: s?.llmOutreachDifferentiator ?? "",
          openaiKey: s?.openaiKey ?? "",
          geminiKey: s?.geminiKey ?? "",
          perplexityKey: s?.perplexityKey ?? "",
          xaiKey: s?.xaiKey ?? "",
          anthropicKeyPresent: Boolean(s?.anthropicKey),
          enabledProviders: [...enabledProviders],
          masterEnabled,
        }}
      />

      <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl mt-4">
        <h3 className="font-semibold mb-3">Recent outreach</h3>
        {recent.length === 0 && (
          <p className="text-sm text-slate-500">No messages sent yet.</p>
        )}
        <div className="space-y-4">
          {PROVIDERS.map((p) => {
            const msgs = byProvider.get(p.id) ?? [];
            const hasKey =
              p.id === "anthropic" ? keys.anthropic : keys[p.id];
            return (
              <div key={p.id} className="border border-slate-200 rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium text-sm">{p.label}</div>
                    <div className="text-xs text-slate-500">{p.vendor}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        enabledProviders.has(p.id) && hasKey
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {hasKey
                        ? enabledProviders.has(p.id)
                          ? "Enabled"
                          : "Off"
                        : "No API key"}
                    </span>
                    <SendNowButton provider={p.id} disabled={!hasKey} />
                  </div>
                </div>
                {msgs.length === 0 ? (
                  <p className="text-xs text-slate-400">No messages yet.</p>
                ) : (
                  <ul className="space-y-1 text-xs text-slate-700">
                    {msgs.slice(0, 5).map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start gap-2 border-t border-slate-100 pt-1 first:border-t-0 first:pt-0"
                      >
                        <span className="text-slate-400 font-mono whitespace-nowrap">
                          {new Date(m.sentAt).toISOString().slice(0, 10)}
                        </span>
                        <span
                          className={
                            m.status === "success"
                              ? "text-emerald-600"
                              : "text-red-600"
                          }
                        >
                          {m.status}
                        </span>
                        <span className="text-slate-600 truncate" title={m.message}>
                          {(m.error ?? m.message).slice(0, 120)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-3xl text-xs text-amber-900 mt-4">
        <strong>Cron:</strong> point your central Cloudflare cron worker at
        {" "}
        <code className="bg-amber-100 px-1 rounded font-mono">
          POST /api/cron/llm-outreach
        </code>{" "}
        weekly with{" "}
        <code className="bg-amber-100 px-1 rounded font-mono">
          Authorization: Bearer $CRON_SECRET
        </code>
        .
      </div>
    </div>
  );
}

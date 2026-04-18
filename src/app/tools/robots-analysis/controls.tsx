"use client";

import { useActionState } from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { runRobotsAnalysis, type AnalysisResult } from "./actions";

const initial: AnalysisResult = { ok: true };

export function RobotsAnalysisRunner() {
  const [state, action, pending] = useActionState(
    async () => runRobotsAnalysis(),
    initial,
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Analyzing…" : "Run analysis"}
        </button>
        {state.error && (
          <span className="ml-3 text-sm text-red-600">{state.error}</span>
        )}
      </form>

      {state.ok && state.reports && (
        <>
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Summary</h3>
              <a
                href={state.fetchedFrom}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-600 hover:underline font-mono"
              >
                {state.fetchedFrom}
              </a>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge
                tone="emerald"
                label="Fully allowed"
                value={state.summary?.allowed ?? 0}
                icon={<CheckCircle2 className="w-4 h-4" />}
              />
              <Badge
                tone="amber"
                label="Partially blocked"
                value={state.summary?.mixed ?? 0}
                icon={<AlertTriangle className="w-4 h-4" />}
              />
              <Badge
                tone="red"
                label="Blocked"
                value={state.summary?.blocked ?? 0}
                icon={<XCircle className="w-4 h-4" />}
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="font-semibold mb-3">Per-crawler access</h3>
            <div className="space-y-2">
              {state.reports.map((r) => (
                <div
                  key={r.userAgent}
                  className="border border-slate-200 rounded p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{r.userAgent}</div>
                      <div className="text-xs text-slate-500">
                        {r.vendor} · {r.purpose}
                      </div>
                    </div>
                    <OverallPill overall={r.overall} />
                  </div>
                  {r.overall !== "allowed" && (
                    <ul className="mt-2 text-xs space-y-1">
                      {r.paths
                        .filter((p) => !p.allowed)
                        .map((p) => (
                          <li key={p.path} className="flex items-start gap-2">
                            <span className="font-mono text-slate-600">
                              {p.path}
                            </span>
                            <span className="text-red-600">blocked by</span>
                            <span className="font-mono text-red-600">
                              {p.matchedRule
                                ? `${p.matchedRule.type}: ${p.matchedRule.pattern}`
                                : "(no rule)"}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {state.sitemaps && state.sitemaps.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="font-semibold mb-2">Sitemaps declared</h3>
              <ul className="text-xs space-y-1 font-mono text-slate-600">
                {state.sitemaps.map((s) => (
                  <li key={s}>
                    <a
                      href={s}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline break-all"
                    >
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="bg-white border border-slate-200 rounded-lg p-5">
            <summary className="cursor-pointer font-semibold text-sm">
              Raw robots.txt
            </summary>
            <pre className="mt-3 text-xs font-mono bg-slate-50 border border-slate-100 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-96">
              {state.robotsText}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}

function Badge({
  tone,
  label,
  value,
  icon,
}: {
  tone: "emerald" | "amber" | "red";
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  const colors =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-red-50 text-red-700 border-red-200";
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md border ${colors}`}
    >
      {icon}
      <span className="font-semibold">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function OverallPill({
  overall,
}: {
  overall: "allowed" | "blocked" | "mixed";
}) {
  if (overall === "allowed")
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
        Allowed
      </span>
    );
  if (overall === "blocked")
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">
        Blocked
      </span>
    );
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700">
      Partially blocked
    </span>
  );
}

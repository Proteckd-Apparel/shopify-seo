"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  AI_COST_PER_ROW_CENTS,
  estimateBulkCost,
  formatUsd,
  type AiOp,
} from "@/lib/ai-pricing";
import { JOB_LABELS, type JobKind } from "@/lib/bulk-job-shared";

type BulkResult = {
  ok: boolean;
  processed: number;
  saved: number;
  failed: number;
  message: string;
};

type RunningJobSnapshot = {
  id: string;
  kind: JobKind;
  status: string;
  progress: number;
  total: number;
} | null;

// Single shared poller across every BulkButton on the page. Each button
// subscribes; the poller only runs while at least one button is mounted.
// 2s cadence matches the topbar pill — we're showing the same state.
let pollerCount = 0;
let pollerHandle: ReturnType<typeof setInterval> | null = null;
let lastSnap: RunningJobSnapshot = null;
const subscribers = new Set<(s: RunningJobSnapshot) => void>();
async function tickPoller() {
  try {
    const res = await fetch("/api/bulk-job", { cache: "no-store" });
    if (!res.ok) return;
    const snap = (await res.json()) as RunningJobSnapshot;
    lastSnap = snap;
    subscribers.forEach((cb) => cb(snap));
  } catch {}
}
function subscribeRunningJob(cb: (s: RunningJobSnapshot) => void) {
  subscribers.add(cb);
  pollerCount++;
  cb(lastSnap);
  if (!pollerHandle) {
    tickPoller();
    pollerHandle = setInterval(tickPoller, 2000);
  }
  return () => {
    subscribers.delete(cb);
    pollerCount--;
    if (pollerCount === 0 && pollerHandle) {
      clearInterval(pollerHandle);
      pollerHandle = null;
    }
  };
}

export function BulkButton({
  label,
  action,
  costOp,
  estimatedRows,
}: {
  label: string;
  action: () => Promise<BulkResult>;
  // Optional cost-estimate hint. When provided, the confirm dialog
  // shows "Estimated cost: ~$X" and the per-row rate, and a small
  // "~$X" tag appears next to the button so users see the
  // ceiling before clicking.
  costOp?: AiOp;
  estimatedRows?: number;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [runningSnap, setRunningSnap] = useState<RunningJobSnapshot>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Poll for any job currently running so we can disable this button
  // when a different job is in flight (avoids two AI bulk jobs racing
  // for Anthropic + Shopify rate limits, and matches the server-side
  // guard in startJob).
  useEffect(() => {
    return subscribeRunningJob((s) => {
      if (mounted.current) setRunningSnap(s);
    });
  }, []);

  // "External" = a running job that ISN'T this button's own click.
  // While our action is pending we already disable + show "Running…",
  // so we only show the external-block UI when pending is false.
  const externalRunning =
    !pending && runningSnap && runningSnap.status === "running";
  const externalLabel = externalRunning
    ? JOB_LABELS[runningSnap!.kind] ?? runningSnap!.kind
    : null;
  const externalPct =
    externalRunning && runningSnap!.total > 0
      ? Math.round((runningSnap!.progress / runningSnap!.total) * 100)
      : null;

  // Bulk actions cap at 2000 per click (see _actions.ts), so the worst
  // case is min(estimatedRows, 2000). Show that as the quote.
  const quoteRows = costOp
    ? Math.min(estimatedRows ?? 2000, 2000)
    : 0;
  const quoteUsd =
    costOp && quoteRows > 0 ? estimateBulkCost(costOp, quoteRows) : null;
  const perRowUsd = costOp ? formatUsd(AI_COST_PER_ROW_CENTS[costOp]) : null;

  function run() {
    const costLine = quoteUsd
      ? `\n\nEstimated cost: up to ${quoteUsd} (${quoteRows} rows × ${perRowUsd}/row, Claude Haiku 4.5).`
      : "";
    if (
      !confirm(
        `${label}\n\nThis will use Claude AI and write to your Shopify store.${costLine}\n\nFeel free to navigate to other pages — the job keeps running on the server. Watch the topbar pill for progress.\n\nContinue?`,
      )
    )
      return;
    setResult(null);
    setPending(true);
    // Fire-and-forget: do NOT wrap in useTransition. Wrapping in a
    // transition makes Next.js block navigation while the server
    // action is in flight, which prevents the user from working in
    // other tabs during a long bulk run. By calling action() as a
    // bare promise we let the server action run server-side while
    // the client navigates freely. Progress + completion are
    // recoverable from anywhere via the topbar pill (which polls
    // /api/bulk-job).
    action()
      .then((r) => {
        if (mounted.current) {
          setResult(r);
          setPending(false);
        }
      })
      .catch((e) => {
        if (mounted.current) {
          setResult({
            ok: false,
            processed: 0,
            saved: 0,
            failed: 0,
            message: e instanceof Error ? e.message : "Failed",
          });
          setPending(false);
        }
      });
  }

  const disabled = pending || !!externalRunning;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        title={
          externalRunning
            ? `Blocked — ${externalLabel} is running (${externalPct}%). Wait for it to finish.`
            : undefined
        }
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-medium hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {pending
          ? "Running… (navigate freely)"
          : externalRunning
            ? `Wait — ${externalLabel} running (${externalPct}%)`
            : label}
        {quoteUsd && !externalRunning && (
          <span className="text-white/70 font-normal">~{quoteUsd}</span>
        )}
      </button>
      {result && (
        <span
          className={`text-xs ${
            result.ok ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}

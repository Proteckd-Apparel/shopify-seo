"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  AI_COST_PER_ROW_CENTS,
  estimateBulkCost,
  formatUsd,
  type AiOp,
} from "@/lib/ai-pricing";

type BulkResult = {
  ok: boolean;
  processed: number;
  saved: number;
  failed: number;
  message: string;
};

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
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-xs font-medium hover:opacity-95 disabled:opacity-60"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {pending ? "Running… (navigate freely)" : label}
        {quoteUsd && (
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

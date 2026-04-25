"use client";

import { useState, useTransition } from "react";
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
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BulkResult | null>(null);

  // Bulk actions cap at 1000 per click (see _actions.ts), so the worst
  // case is min(estimatedRows, 1000). Show that as the quote.
  const quoteRows = costOp
    ? Math.min(estimatedRows ?? 1000, 1000)
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
        `${label}\n\nThis will use Claude AI and write to your Shopify store.${costLine}\n\nContinue?`,
      )
    )
      return;
    setResult(null);
    start(async () => setResult(await action()));
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
        {pending ? "Working…" : label}
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

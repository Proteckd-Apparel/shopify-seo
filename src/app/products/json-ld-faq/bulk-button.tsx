"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { bulkGenerateAndSaveFaqs } from "./actions";

export function BulkGenerateFaqsButton({ productCount }: { productCount: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function runBulk(overwrite: boolean) {
    // Rough cost estimate — Haiku 4.5 at ~$0.004 per product. For a test
    // run (overwrite=false skips products that already have FAQs) this
    // number is the upper bound.
    const estCost = (productCount * 0.005).toFixed(2);
    const msg = overwrite
      ? `Regenerate FAQs for ALL ${productCount} products (overwrites existing)?\n\nEstimated Anthropic cost: ~$${estCost}.`
      : `Generate FAQs for products that don't have them yet (up to ${productCount} products).\n\nEstimated Anthropic cost: ~$${estCost} max.`;
    if (!confirm(msg)) return;

    setMsg(null);
    start(async () => {
      const r = await bulkGenerateAndSaveFaqs({ overwriteExisting: overwrite });
      setMsg(r.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 mb-6">
      <div className="flex gap-2">
        <button
          onClick={() => runBulk(false)}
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {pending ? "Running…" : "Generate FAQs for all products"}
        </button>
        <button
          onClick={() => runBulk(true)}
          disabled={pending}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 disabled:opacity-50"
        >
          Regenerate all (overwrite)
        </button>
      </div>
      <div className="text-xs text-slate-500">
        Heads up — run per-product (below) on one item first to check output
        quality + billing before hitting the bulk button. The bulk action
        skips products that already have FAQs unless you pick
        &quot;Regenerate all.&quot;
      </div>
      {msg && (
        <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          {msg}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { bulkGenerateMerchantCopy } from "./actions";

export function BulkGenerateButton({ productCount }: { productCount: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run(overwrite: boolean) {
    const estCost = (productCount * 0.006).toFixed(2);
    const prompt = overwrite
      ? `Regenerate Google Merchant copy for ALL ${productCount} products.\n\nEstimated Anthropic cost: ~$${estCost}. This overwrites any existing Google-safe copy.`
      : `Generate Google Merchant copy for products that don't have it yet (up to ${productCount}).\n\nEstimated Anthropic cost: ~$${estCost} max. Skips products that already have generated copy.`;
    if (!confirm(prompt)) return;
    setMsg(null);
    start(async () => {
      const r = await bulkGenerateMerchantCopy({ overwriteExisting: overwrite });
      setMsg(r.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 mb-6">
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => run(false)}
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          <ShieldCheck className="w-4 h-4" />
          {pending ? "Running…" : "Generate Google-safe copy for all"}
        </button>
        <button
          onClick={() => run(true)}
          disabled={pending}
          className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-50 disabled:opacity-50"
        >
          Regenerate all (overwrite)
        </button>
      </div>
      <div className="text-xs text-slate-500">
        Run a per-product test first (below) to verify output quality + billing
        before hitting bulk. The primary action skips products that already
        have generated copy.
      </div>
      {msg && (
        <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          {msg}
        </div>
      )}
    </div>
  );
}

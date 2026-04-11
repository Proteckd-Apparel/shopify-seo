"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

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
}: {
  label: string;
  action: () => Promise<BulkResult>;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BulkResult | null>(null);

  function run() {
    if (
      !confirm(
        `${label}\n\nThis will use Claude AI and write to your Shopify store. Continue?`,
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

"use client";

import { useState, useTransition } from "react";
import { startOptimizeAll, type RunResult } from "./actions";

export function RunButton({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RunResult | null>(null);

  function go() {
    if (disabled) return;
    if (
      !confirm(
        "This will use Claude AI to generate SEO fields for every applicable resource and write them to Shopify. Continue?",
      )
    )
      return;
    setResult(null);
    start(async () => setResult(await startOptimizeAll()));
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={pending || disabled}
        title={
          disabled
            ? "Enable Auto-optimize master switch in /optimize/settings"
            : undefined
        }
        className="w-full py-3 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Optimizing your store…" : "Start optimizing"}
      </button>
      {pending && (
        <div className="text-xs text-center text-slate-500 mt-2">
          This can take several minutes. Don&apos;t close the tab.
        </div>
      )}
      {result && (
        <div
          className={`mt-3 text-sm text-center ${
            result.ok ? "text-emerald-700" : "text-amber-700"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}

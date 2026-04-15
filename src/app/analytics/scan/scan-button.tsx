"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { BulkProgressBar } from "@/components/bulk-progress-bar";
import { startScan, type ScanActionResult } from "./actions";

// Runs the scan inside useTransition so React doesn't treat it as a form
// submission that blocks the rest of the app. The live progress bar polls
// the JobRun row through /api/bulk-job, so the user can navigate to other
// pages mid-scan and come back to see it still ticking over.
export function ScanButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ScanActionResult | null>(null);

  function run() {
    setResult(null);
    start(async () => {
      const r = await startScan();
      setResult(r);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        <Search className="w-4 h-4" />
        {pending ? "Scanning your store..." : "Start scan"}
      </button>

      <BulkProgressBar kind="scan" />

      {pending && (
        <div className="mt-3 text-xs text-slate-500">
          You can navigate to other pages while this runs — the progress bar
          is driven by the database, so it&apos;ll still be here when you come
          back.
        </div>
      )}

      {result?.message && (
        <div
          className={`mt-3 text-sm ${
            result.ok ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {result.message}
          {result.ok && result.totalPages !== undefined && (
            <>
              {" "}
              · {result.totalPages} resources, {result.totalIssues} issues
            </>
          )}
        </div>
      )}
    </div>
  );
}

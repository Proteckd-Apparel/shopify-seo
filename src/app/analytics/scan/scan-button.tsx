"use client";

import { useActionState } from "react";
import { startScan, type ScanActionResult } from "./actions";
import { Search } from "lucide-react";

const initial: ScanActionResult = { ok: true, message: "" };

export function ScanButton() {
  const [state, action, pending] = useActionState(
    async (_prev: ScanActionResult) => startScan(),
    initial,
  );

  return (
    <div>
      <form action={action}>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          <Search className="w-4 h-4" />
          {pending ? "Scanning your store..." : "Start scan"}
        </button>
      </form>
      {state.message && (
        <div
          className={`mt-3 text-sm ${
            state.ok ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {state.message}
          {state.ok && state.totalPages !== undefined && (
            <>
              {" "}
              · {state.totalPages} resources, {state.totalIssues} issues
            </>
          )}
        </div>
      )}
      {pending && (
        <div className="mt-3 text-xs text-slate-500">
          This can take a minute or two on large stores. Don&apos;t close the
          tab.
        </div>
      )}
    </div>
  );
}

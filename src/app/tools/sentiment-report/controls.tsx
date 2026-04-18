"use client";

import { useActionState } from "react";
import { runSentimentNow, type ActionResult } from "./actions";
import type { Provider } from "@/lib/llm-outreach-shared";

const initial: ActionResult = { ok: true, message: "" };

export function RunButton({
  provider,
  disabled,
  label,
}: {
  provider?: Provider | "";
  disabled?: boolean;
  label?: string;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => runSentimentNow(fd),
    initial,
  );
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="provider" value={provider ?? ""} />
      <button
        type="submit"
        disabled={disabled || pending}
        className={`${label ? "px-4 py-2 text-sm" : "text-xs px-2 py-1"} rounded ${label ? "bg-indigo-600 text-white font-medium hover:bg-indigo-700" : "border border-slate-300 hover:bg-slate-50"} disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        {pending ? "Running…" : label || "Run now"}
      </button>
      {state.message && (
        <span
          className={`text-xs ${state.ok ? "text-emerald-600" : "text-red-600"} truncate max-w-[240px]`}
          title={state.message}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

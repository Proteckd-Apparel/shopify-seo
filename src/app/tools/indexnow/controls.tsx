"use client";

import { useActionState, useTransition } from "react";
import {
  submitNow,
  toggleIndexNow,
  regenerateKey,
  type ActionResult,
} from "./actions";

const initial: ActionResult = { ok: true, message: "" };

export function IndexNowControls({ enabled }: { enabled: boolean }) {
  const [submitState, submitAction, submitPending] = useActionState(
    async () => submitNow(),
    initial,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => toggleIndexNow(fd),
    initial,
  );
  const [keyState, keyAction, keyPending] = useActionState(
    async () => regenerateKey(),
    initial,
  );
  const [, startTransition] = useTransition();

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl space-y-3">
      <h3 className="font-semibold">Controls</h3>

      <div className="flex flex-wrap items-center gap-3">
        <form action={submitAction}>
          <button
            type="submit"
            disabled={submitPending}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitPending ? "Submitting…" : "Submit now"}
          </button>
        </form>

        <form
          action={(fd) => {
            fd.set("enabled", enabled ? "false" : "true");
            startTransition(() => toggleAction(fd));
          }}
        >
          <button
            type="submit"
            disabled={togglePending}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {enabled ? "Disable auto-submit" : "Enable auto-submit"}
          </button>
        </form>

        <form action={keyAction}>
          <button
            type="submit"
            disabled={keyPending}
            className="px-3 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {keyPending ? "Rotating…" : "Regenerate key"}
          </button>
        </form>
      </div>

      {(submitState.message || toggleState.message || keyState.message) && (
        <div
          className={`text-sm ${
            submitState.ok && toggleState.ok && keyState.ok
              ? "text-emerald-600"
              : "text-red-600"
          }`}
        >
          {submitState.message || toggleState.message || keyState.message}
        </div>
      )}
    </div>
  );
}

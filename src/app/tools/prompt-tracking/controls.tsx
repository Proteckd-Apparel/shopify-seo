"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { PROVIDERS, type Provider } from "@/lib/llm-outreach-shared";
import {
  addPrompt,
  deletePrompt,
  runPromptNow,
  savePromptTrackingConfig,
  toggleTracking,
  togglePromptEnabled,
  type ActionResult,
} from "./actions";

const initial: ActionResult = { ok: true, message: "" };

export function ConfigForm({
  defaults,
}: {
  defaults: {
    brandKeywords: string;
    enabledProviders: Provider[];
    masterEnabled: boolean;
    keys: Record<Provider, boolean>;
  };
}) {
  const [saveState, saveAction, savePending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => savePromptTrackingConfig(fd),
    initial,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => toggleTracking(fd),
    initial,
  );
  const enabled = new Set(defaults.enabledProviders);

  return (
    <div className="space-y-4">
      <form
        action={(fd) => {
          fd.set("enabled", defaults.masterEnabled ? "false" : "true");
          toggleAction(fd);
        }}
      >
        <button
          type="submit"
          disabled={togglePending}
          className={`px-3 py-2 rounded-md border text-sm ${
            defaults.masterEnabled
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-slate-300 hover:bg-slate-50"
          }`}
        >
          {defaults.masterEnabled
            ? "Weekly tracking: ON (click to disable)"
            : "Weekly tracking: OFF (click to enable)"}
        </button>
        {toggleState.message && (
          <span className="ml-3 text-sm text-slate-600">
            {toggleState.message}
          </span>
        )}
      </form>

      <form action={saveAction} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 max-w-3xl">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">
            Brand keywords
          </label>
          <input
            name="brandKeywords"
            defaultValue={defaults.brandKeywords}
            placeholder="proteckd, proteck'd, proteckd emf"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
          />
          <p className="text-xs text-slate-500 mt-1">
            Comma-separated. A response counts as a mention if it contains any
            of these (case-insensitive). Defaults to your store name if blank.
          </p>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-700 mb-2">
            Providers to query
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => {
              const hasKey = defaults.keys[p.id];
              return (
                <label
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-2 border rounded text-sm ${
                    hasKey
                      ? "border-slate-200"
                      : "border-slate-200 opacity-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    name={`provider_${p.id}`}
                    defaultChecked={enabled.has(p.id)}
                    disabled={!hasKey}
                  />
                  <span>
                    <span className="font-medium">{p.label}</span>{" "}
                    <span className="text-slate-500 text-xs">({p.vendor})</span>
                    {!hasKey && (
                      <span className="text-amber-600 text-xs ml-1">
                        no key
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savePending}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {savePending ? "Saving…" : "Save"}
          </button>
          {saveState.message && (
            <span
              className={`text-sm ${
                saveState.ok ? "text-emerald-600" : "text-red-600"
              }`}
            >
              {saveState.message}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}

export function AddPromptForm() {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => addPrompt(fd),
    initial,
  );
  return (
    <form action={action} className="flex gap-2">
      <input
        name="text"
        placeholder='e.g. "best EMF blocking clothing brands"'
        className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add prompt"}
      </button>
      {state.message && !state.ok && (
        <span className="text-sm text-red-600 self-center">
          {state.message}
        </span>
      )}
    </form>
  );
}

export function PromptRowActions({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const [runState, runAction, runPending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => runPromptNow(fd),
    initial,
  );
  const [togState, togAction, togPending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => togglePromptEnabled(fd),
    initial,
  );
  const [delState, delAction, delPending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => deletePrompt(fd),
    initial,
  );

  return (
    <div className="flex items-center gap-2">
      <form action={runAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={runPending}
          className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
          title={runState.message}
        >
          {runPending ? "Running…" : "Run now"}
        </button>
      </form>
      <form
        action={(fd) => {
          fd.set("id", id);
          fd.set("enabled", enabled ? "false" : "true");
          togAction(fd);
        }}
      >
        <button
          type="submit"
          disabled={togPending}
          className={`text-xs px-2 py-1 rounded border ${
            enabled
              ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-slate-300 hover:bg-slate-50"
          }`}
        >
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </form>
      <form action={delAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={delPending}
          className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
          title="Delete prompt"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </form>
      {(runState.message || togState.message || delState.message) && (
        <span
          className={`text-xs truncate max-w-[200px] ${
            runState.ok && togState.ok && delState.ok
              ? "text-slate-500"
              : "text-red-600"
          }`}
          title={runState.message || togState.message || delState.message}
        >
          {runState.message || togState.message || delState.message}
        </span>
      )}
    </div>
  );
}

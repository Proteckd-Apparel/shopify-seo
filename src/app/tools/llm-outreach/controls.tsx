"use client";

import { useActionState } from "react";
import { PROVIDERS, type Provider } from "@/lib/llm-outreach-shared";
import {
  saveOutreachConfig,
  sendOutreachNow,
  toggleOutreach,
  type ActionResult,
} from "./actions";

const initial: ActionResult = { ok: true, message: "" };

export function OutreachConfigForm({
  defaults,
}: {
  defaults: {
    whatYouSell: string;
    differentiator: string;
    openaiKey: string;
    geminiKey: string;
    perplexityKey: string;
    xaiKey: string;
    anthropicKeyPresent: boolean;
    enabledProviders: Provider[];
    masterEnabled: boolean;
  };
}) {
  const [saveState, saveAction, savePending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => saveOutreachConfig(fd),
    initial,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => toggleOutreach(fd),
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
            ? "Auto-outreach: ON (click to disable)"
            : "Auto-outreach: OFF (click to enable)"}
        </button>
        {toggleState.message && (
          <span className="ml-3 text-sm text-slate-600">
            {toggleState.message}
          </span>
        )}
      </form>

      <form action={saveAction} className="space-y-5 max-w-3xl">
        <Section title="Store description" description="Used verbatim inside the outreach message.">
          <Field label="What do you sell?">
            <textarea
              name="whatYouSell"
              defaultValue={defaults.whatYouSell}
              rows={3}
              placeholder="We sell X for people who Y..."
              className="input"
            />
          </Field>
          <Field label="What makes your store different?">
            <textarea
              name="differentiator"
              defaultValue={defaults.differentiator}
              rows={3}
              placeholder="Unique value / mission / why buy here..."
              className="input"
            />
          </Field>
        </Section>

        <Section
          title="Providers"
          description="Toggle which LLMs to reach out to, and paste the API key for each."
        >
          {PROVIDERS.map((p) => (
            <div
              key={p.id}
              className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0"
            >
              <label className="flex items-center gap-2 pt-1 min-w-[140px]">
                <input
                  type="checkbox"
                  name={`provider_${p.id}`}
                  defaultChecked={enabled.has(p.id)}
                />
                <span className="text-sm">
                  <span className="font-medium">{p.label}</span>
                  <span className="text-slate-500 ml-1 text-xs">
                    ({p.vendor})
                  </span>
                </span>
              </label>
              <div className="flex-1">
                {p.id === "anthropic" ? (
                  <div className="text-xs text-slate-500 pt-2">
                    {defaults.anthropicKeyPresent
                      ? "Using the Anthropic key from the main Settings page."
                      : "No Anthropic key set. Add one in Settings to enable Claude."}
                  </div>
                ) : (
                  <input
                    type="password"
                    name={`${p.id}Key`}
                    defaultValue={
                      p.id === "openai"
                        ? defaults.openaiKey
                        : p.id === "gemini"
                          ? defaults.geminiKey
                          : p.id === "perplexity"
                            ? defaults.perplexityKey
                            : defaults.xaiKey
                    }
                    placeholder={`${p.vendor} API key`}
                    className="input"
                  />
                )}
              </div>
            </div>
          ))}
        </Section>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savePending}
            className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {savePending ? "Saving…" : "Save outreach config"}
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

      <style>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          background: white;
        }
        .input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }
      `}</style>
    </div>
  );
}

export function SendNowButton({
  provider,
  disabled,
}: {
  provider: Provider;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(
    async (_prev: ActionResult, fd: FormData) => sendOutreachNow(fd),
    initial,
  );
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="provider" value={provider} />
      <button
        type="submit"
        disabled={disabled || pending}
        className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {pending ? "Sending…" : "Send now"}
      </button>
      {state.message && (
        <span
          className={`text-xs ${
            state.ok ? "text-emerald-600" : "text-red-600"
          } truncate max-w-[240px]`}
          title={state.message}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 mt-1 mb-4">{description}</p>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-700 mb-1">{label}</div>
      {children}
    </label>
  );
}

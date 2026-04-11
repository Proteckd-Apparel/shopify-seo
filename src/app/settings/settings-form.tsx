"use client";

import { useActionState } from "react";
import { saveSettings, type SaveResult } from "./actions";

const initialState: SaveResult = { ok: true, message: "" };

export function SettingsForm({
  defaults,
}: {
  defaults: {
    shopDomain: string;
    shopifyToken: string;
    anthropicKey: string;
    optimizerRules: string;
  };
}) {
  const [state, action, pending] = useActionState(
    async (_prev: SaveResult, fd: FormData) => saveSettings(fd),
    initialState,
  );

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <Section
        title="Shopify"
        description="Create a custom app in Shopify admin → Settings → Apps and sales channels → Develop apps. Grant Admin API scopes for read_products, write_products, read_files, write_files, read_online_store_pages, write_online_store_pages, read_themes, write_themes, read_content, write_content."
      >
        <Field label="Shop domain" hint="example: mystore.myshopify.com">
          <input
            name="shopDomain"
            defaultValue={defaults.shopDomain}
            placeholder="mystore.myshopify.com"
            className="input"
          />
        </Field>
        <Field label="Admin API access token">
          <input
            name="shopifyToken"
            type="password"
            defaultValue={defaults.shopifyToken}
            placeholder="shpat_..."
            className="input"
          />
        </Field>
      </Section>

      <Section title="Anthropic" description="Used by all AI features.">
        <Field label="API key">
          <input
            name="anthropicKey"
            type="password"
            defaultValue={defaults.anthropicKey}
            placeholder="sk-ant-..."
            className="input"
          />
        </Field>
      </Section>

      <Section
        title="Optimizer Rules"
        description="Free-form instructions the AI follows when rewriting your store. Brand voice, do/don't, target audience."
      >
        <Field label="Rules">
          <textarea
            name="optimizerRules"
            defaultValue={defaults.optimizerRules}
            rows={6}
            placeholder="E.g. Friendly tone. Always mention free shipping. Never use the word 'cheap'."
            className="input font-mono text-xs"
          />
        </Field>
      </Section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save settings"}
        </button>
        {state.message && (
          <span
            className={`text-sm ${
              state.ok ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {state.message}
            {state.shopName ? ` (${state.shopName})` : ""}
          </span>
        )}
      </div>

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
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-700 mb-1">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </label>
  );
}

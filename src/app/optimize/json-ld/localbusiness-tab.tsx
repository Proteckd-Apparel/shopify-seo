"use client";

import { useState, useTransition } from "react";
import { previewLocalBusiness, saveJsonLdConfig } from "./actions";
import type { LocalBusinessJsonLdConfig } from "@/lib/json-ld-config";

export function LocalBusinessTab({
  initial,
}: {
  initial: LocalBusinessJsonLdConfig;
}) {
  const [cfg, setCfg] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function patch(p: Partial<LocalBusinessJsonLdConfig>) {
    setCfg({ ...cfg, ...p });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveJsonLdConfig({ localBusiness: cfg });
      setMsg(r.message);
    });
  }

  function showPreview() {
    setMsg(null);
    setPreview(null);
    start(async () => {
      const r = await previewLocalBusiness();
      if (r.ok && r.schema) setPreview(r.schema);
      else setMsg(r.message ?? "Preview failed");
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        If you have a public storefront, enable LocalBusiness JSON-LD to help
        Google show your business in Maps and local search. This is rendered
        site-wide via the Other tab once you add the snippet to your theme.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700 font-medium">Activate</span>
          <Toggle
            checked={cfg.enabled}
            onChange={(v) => patch({ enabled: v })}
          />
        </div>

        <hr className="border-slate-100" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Business name">
            <input
              value={cfg.businessName}
              onChange={(e) => patch({ businessName: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Phone">
            <input
              value={cfg.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Street address">
            <input
              value={cfg.streetAddress}
              onChange={(e) => patch({ streetAddress: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="City">
            <input
              value={cfg.city}
              onChange={(e) => patch({ city: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Region (state)">
            <input
              value={cfg.region}
              onChange={(e) => patch({ region: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Postal code">
            <input
              value={cfg.postalCode}
              onChange={(e) => patch({ postalCode: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Country (ISO)">
            <input
              value={cfg.country}
              onChange={(e) => patch({ country: e.target.value })}
              placeholder="US"
              className="input"
            />
          </Field>
          <Field label="Price range">
            <input
              value={cfg.priceRange}
              onChange={(e) => patch({ priceRange: e.target.value })}
              placeholder="$$"
              className="input"
            />
          </Field>
          <Field label="Opening hours">
            <input
              value={cfg.openingHours}
              onChange={(e) => patch({ openingHours: e.target.value })}
              placeholder="Mo-Fr 09:00-18:00"
              className="input"
            />
          </Field>
          <Field label="Latitude">
            <input
              value={cfg.latitude}
              onChange={(e) => patch({ latitude: e.target.value })}
              placeholder="optional"
              className="input"
            />
          </Field>
          <Field label="Longitude">
            <input
              value={cfg.longitude}
              onChange={(e) => patch({ longitude: e.target.value })}
              placeholder="optional"
              className="input"
            />
          </Field>
        </div>
      </div>

      {preview && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Generated JSON-LD
          </div>
          <pre className="text-xs font-mono p-4 overflow-x-auto bg-slate-50 max-h-96">
            {preview}
          </pre>
        </div>
      )}

      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-2 shadow-lg">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
        >
          Save settings
        </button>
        <button
          type="button"
          onClick={showPreview}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Preview JSON-LD
        </button>
        {msg && <span className="text-xs text-slate-600 ml-2">{msg}</span>}
      </div>

      <style>{`.input{width:100%;padding:0.375rem 0.75rem;border:1px solid #e2e8f0;border-radius:0.375rem;font-size:0.875rem;background:white}.input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,0.1)}`}</style>
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

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

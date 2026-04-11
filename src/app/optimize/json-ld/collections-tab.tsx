"use client";

import { useState, useTransition } from "react";
import {
  applyCollectionSchemaToAll,
  saveJsonLdConfig,
} from "./actions";
import type { CollectionsJsonLdConfig } from "@/lib/json-ld-config";

export function CollectionsTab({
  initial,
}: {
  initial: CollectionsJsonLdConfig;
}) {
  const [cfg, setCfg] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function patch(p: Partial<CollectionsJsonLdConfig>) {
    setCfg({ ...cfg, ...p });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveJsonLdConfig({ collections: cfg });
      setMsg(r.message);
    });
  }

  function applyAll() {
    if (
      !confirm(
        "Apply this Collection schema to ALL collections? This writes a metafield on every collection.",
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const r = await applyCollectionSchemaToAll();
      setMsg(r.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Add collection schema microdata to your collections pages to improve
        SEO. If your collections have products with ratings, an aggregated
        star rating will be displayed for the collection in search results.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700 font-medium">
            Activate &amp; Auto-Optimize
          </span>
          <Toggle
            checked={cfg.enabled}
            onChange={(v) => patch({ enabled: v })}
          />
        </div>
        <hr className="border-slate-100" />
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-700">Show A Star Rating</span>
          <Toggle
            checked={cfg.showStarRating}
            onChange={(v) => patch({ showStarRating: v })}
          />
        </div>
      </div>

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
          onClick={applyAll}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : "Update all collections"}
        </button>
        {msg && <span className="text-xs text-slate-600 ml-2">{msg}</span>}
      </div>
    </div>
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

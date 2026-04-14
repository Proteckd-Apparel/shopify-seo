"use client";

import { useState, useTransition } from "react";
import {
  applyCollectionSchemaToAll,
  previewCollectionSchema,
  saveJsonLdConfig,
  searchCollectionsForPicker,
} from "./actions";
import type { CollectionsJsonLdConfig } from "@/lib/json-ld-config";
import { BulkProgressBar } from "@/components/bulk-progress-bar";

export function CollectionsTab({
  initial,
}: {
  initial: CollectionsJsonLdConfig;
}) {
  const [cfg, setCfg] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewJson, setPreviewJson] = useState<string | null>(null);
  const [results, setResults] = useState<
    Array<{ id: string; title: string; handle: string }>
  >([]);
  const [q, setQ] = useState("");
  const [applyingAll, setApplyingAll] = useState(false);

  function doSearch(value: string) {
    setQ(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    start(async () => setResults(await searchCollectionsForPicker(value)));
  }

  function runPreview(id: string) {
    setPreviewJson(null);
    setPickerOpen(false);
    start(async () => {
      const r = await previewCollectionSchema(id);
      if (r.ok && r.json) setPreviewJson(r.json);
      else setMsg("❌ " + (r.message ?? "Preview failed"));
    });
  }

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
    setApplyingAll(true);
    start(async () => {
      const r = await applyCollectionSchemaToAll();
      setMsg(r.message);
      setApplyingAll(false);
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
          onClick={() => setPickerOpen(true)}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
        >
          Preview JSON
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

      <BulkProgressBar kind="json_ld_collections" active={applyingAll} />

      {previewJson && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-slate-500">
              Generated JSON-LD ({previewJson.length.toLocaleString()} bytes)
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(previewJson)}
                className="text-xs text-indigo-600 hover:underline"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => setPreviewJson(null)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                ✕
              </button>
            </div>
          </div>
          <pre className="text-[10px] font-mono overflow-x-auto bg-slate-50 p-3 rounded max-h-96">
            {previewJson}
          </pre>
        </div>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">
                Pick a collection to preview
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="text-sm text-slate-500 hover:text-slate-900"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <input
                value={q}
                onChange={(e) => doSearch(e.target.value)}
                placeholder="Search by title or handle…"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:border-indigo-500"
                autoFocus
              />
              {results.length > 0 && (
                <ul className="mt-3 max-h-64 overflow-y-auto border border-slate-100 rounded">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => runPreview(r.id)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0"
                      >
                        <div className="font-medium text-slate-900 truncate">
                          {r.title || r.handle}
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {r.handle}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
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

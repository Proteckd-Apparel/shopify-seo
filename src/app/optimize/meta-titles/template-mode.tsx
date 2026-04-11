"use client";

import { useState, useTransition } from "react";
import {
  applyMetaTitleToOne,
  bulkApplyMetaTitleTemplate,
  previewMetaTitleTemplate,
  previewMetaTitleForResource,
  restoreLastMetaTitleRun,
  saveMetaTitleTemplate,
  searchResourcesForMetaPicker,
  type BulkResult,
  type TitlePreviewSample,
} from "./template-actions";
import {
  TemplateBuilder,
  TemplateSettings,
} from "@/components/template-builder";
import type { TemplateConfig } from "@/lib/template-engine";
import type { TemplateScopeKey } from "@/lib/optimizer-config";
import { ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";

const TABS: Array<{ key: TemplateScopeKey; label: string }> = [
  { key: "products", label: "Products" },
  { key: "collections", label: "Collections" },
  { key: "articles", label: "Articles" },
  { key: "pages", label: "Pages" },
];

export function MetaTitleTemplateMode({
  initialTemplates,
}: {
  initialTemplates: Record<TemplateScopeKey, TemplateConfig>;
}) {
  const [scope, setScope] = useState<TemplateScopeKey>("products");
  const [templates, setTemplates] =
    useState<Record<TemplateScopeKey, TemplateConfig>>(initialTemplates);
  const [overwrite, setOverwrite] = useState(false);
  const [updateScope, setUpdateScope] = useState<"all" | "published" | "drafts">(
    "published",
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [sample, setSample] = useState<TitlePreviewSample | null>(null);
  const [bulk, setBulk] = useState<BulkResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const tpl = templates[scope];

  function setTpl(next: TemplateConfig) {
    setTemplates({ ...templates, [scope]: next });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveMetaTitleTemplate(scope, tpl);
      setMsg(r.message);
    });
  }

  function runPreview(index = 0) {
    setMsg(null);
    start(async () => {
      const r = await previewMetaTitleTemplate(scope, tpl, index);
      if (r.ok && r.sample) setSample(r.sample);
      else setMsg(r.message ?? "Preview failed");
    });
  }

  function previewSpecific(resourceId: string) {
    setMsg(null);
    start(async () => {
      const r = await previewMetaTitleForResource(tpl, resourceId);
      if (r.ok && r.sample) setSample(r.sample);
      else setMsg(r.message ?? "Preview failed");
    });
  }

  function applyOne() {
    if (!sample) return;
    setMsg(null);
    start(async () => {
      const r = await applyMetaTitleToOne(scope, tpl, sample.resourceId);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function restore() {
    if (
      !confirm(
        `Restore meta titles for ${scope} from the last 60 minutes?\n\nReverts every ${scope.slice(0, -1)} the optimizer touched recently.`,
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const r = await restoreLastMetaTitleRun(scope, 60);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function runBulk() {
    if (
      !confirm(
        `Apply this template to ${overwrite ? "ALL" : "missing"} meta titles in ${scope}?\n\nThis writes to Shopify.`,
      )
    )
      return;
    setBulk(null);
    start(async () => {
      const r = await bulkApplyMetaTitleTemplate(
        scope,
        tpl,
        overwrite,
        updateScope,
      );
      setBulk(r);
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex justify-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setScope(t.key);
              setSample(null);
              setBulk(null);
            }}
            className={`px-4 py-2 text-sm font-medium rounded ${
              scope === t.key
                ? "bg-indigo-600 text-white"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        The meta title is the blue clickable headline in Google search
        results. Target 50-60 characters. When overwrite is OFF, only
        resources with missing titles are updated.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs font-medium text-slate-700 mb-1">
                Update Published / Drafts
              </div>
              <select
                value={updateScope}
                onChange={(e) =>
                  setUpdateScope(
                    e.target.value as "all" | "published" | "drafts",
                  )
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="published">Published Only</option>
                <option value="drafts">Drafts Only</option>
                <option value="all">Process All</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm pt-5">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              Overwrite Existing
            </label>
          </div>
          <TemplateSettings
            value={tpl}
            onChange={setTpl}
            maxCharsHint="Google truncates around 60."
          />
        </div>
      </div>

      <TemplateBuilder value={tpl} onChange={setTpl} />

      {sample && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Item Preview
              </div>
              <div className="text-sm font-semibold text-slate-900 truncate max-w-md">
                {sample.title}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => runPreview(sample.index - 1)}
                disabled={pending}
                className="p-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-500 px-2 tabular-nums">
                {sample.index + 1} / {sample.total}
              </span>
              <button
                type="button"
                onClick={() => runPreview(sample.index + 1)}
                disabled={pending}
                className="p-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={pending}
                className="ml-2 p-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                title="Search for a specific item"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <div className="md:col-span-2 p-5 space-y-3 border-r border-slate-100">
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <div className="text-[10px] uppercase font-semibold text-amber-700">
                  Current Meta Title ({sample.currentValue?.length ?? 0})
                </div>
                <div className="text-sm text-slate-800">
                  {sample.currentValue || (
                    <span className="italic text-slate-400">empty</span>
                  )}
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <div className="text-[10px] uppercase font-semibold text-emerald-700 flex items-center gap-2">
                  New Meta Title ({sample.newValue.length})
                  {tpl.maxChars > 0 &&
                    sample.newValue.length >= tpl.maxChars && (
                      <span className="bg-red-500 text-white px-1 py-px rounded text-[9px]">
                        LIMIT REACHED
                      </span>
                    )}
                </div>
                <div className="text-sm text-slate-800">{sample.newValue}</div>
              </div>
            </div>
            {sample.imageUrl && (
              <div className="p-5 grid place-items-center bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${sample.imageUrl}&width=240`}
                  alt={sample.title}
                  className="max-w-full max-h-64 rounded shadow"
                />
              </div>
            )}
          </div>
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
          onClick={() => runPreview(0)}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {sample ? "Refresh preview" : "Preview"}
        </button>
        {sample && (
          <button
            type="button"
            onClick={applyOne}
            disabled={pending}
            className="px-4 py-1.5 rounded bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-60"
          >
            Update a {scope.slice(0, -1)}
          </button>
        )}
        <button
          type="button"
          onClick={runBulk}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : `Update all ${scope}`}
        </button>
        <button
          type="button"
          onClick={restore}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
          title="Revert any meta title changes made to this scope in the last 60 minutes"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restore
        </button>
        {msg && (
          <span className="basis-full text-xs text-slate-600 mt-1">{msg}</span>
        )}
        {bulk && (
          <span
            className={`basis-full text-xs mt-1 ${
              bulk.ok ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {bulk.message}
          </span>
        )}
      </div>

      {pickerOpen && (
        <Picker
          scope={scope}
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setPickerOpen(false);
            previewSpecific(id);
          }}
        />
      )}
    </div>
  );
}

function Picker({
  scope,
  onClose,
  onPick,
}: {
  scope: TemplateScopeKey;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; title: string; handle: string }>
  >([]);
  const [pending, start] = useTransition();
  function doSearch(value: string) {
    setQ(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    start(async () =>
      setResults(await searchResourcesForMetaPicker(scope, value)),
    );
  }
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">
            Pick a {scope.slice(0, -1)} to preview
          </h3>
          <button
            type="button"
            onClick={onClose}
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
          {pending && (
            <div className="text-xs text-slate-400 mt-2">Searching…</div>
          )}
          {results.length > 0 && (
            <ul className="mt-3 max-h-64 overflow-y-auto border border-slate-100 rounded">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onPick(r.id)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0"
                  >
                    <div className="font-medium text-slate-900 truncate">
                      {r.title || r.handle}
                    </div>
                    <div className="text-xs text-slate-500 font-mono truncate">
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
  );
}

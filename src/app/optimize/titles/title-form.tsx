"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";
import {
  applyTitleToOne,
  bulkApplyTitles,
  previewTitle,
  previewTitleForResource,
  restoreLastTitleRun,
  saveTitleSettings,
  searchResourcesForTitlePicker,
  type BulkResult,
  type TitlePreview,
} from "./actions";
import {
  TemplateBuilder,
  TemplateSettings,
} from "@/components/template-builder";
import type { TemplateConfig } from "@/lib/template-engine";
import type {
  TemplateScopeKey,
  TitleOptimizerConfig,
} from "@/lib/optimizer-config";

const TABS: Array<{ key: TemplateScopeKey; label: string }> = [
  { key: "products", label: "Products" },
  { key: "collections", label: "Collections" },
  { key: "articles", label: "Articles" },
  { key: "pages", label: "Pages" },
];

export function TitleForm({
  initialTemplates,
  initialConfigs,
}: {
  initialTemplates: Record<TemplateScopeKey, TemplateConfig>;
  initialConfigs: Record<TemplateScopeKey, TitleOptimizerConfig>;
}) {
  const [scope, setScope] = useState<TemplateScopeKey>("products");
  const [templates, setTemplates] =
    useState<Record<TemplateScopeKey, TemplateConfig>>(initialTemplates);
  const [configs, setConfigs] =
    useState<Record<TemplateScopeKey, TitleOptimizerConfig>>(initialConfigs);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [sample, setSample] = useState<TitlePreview | null>(null);
  const [bulk, setBulk] = useState<BulkResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const tpl = templates[scope];
  const cfg = configs[scope];

  function setTpl(next: TemplateConfig) {
    setTemplates({ ...templates, [scope]: next });
  }

  function patchCfg(p: Partial<TitleOptimizerConfig>) {
    setConfigs({ ...configs, [scope]: { ...cfg, ...p } });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveTitleSettings(scope, cfg, tpl);
      setMsg(r.message);
    });
  }

  function runPreview(index = 0) {
    setMsg(null);
    start(async () => {
      const r = await previewTitle(scope, tpl, cfg, index);
      if (r.ok && r.sample) setSample(r.sample);
      else setMsg(r.message ?? "Preview failed");
    });
  }

  function previewSpecific(resourceId: string) {
    setMsg(null);
    start(async () => {
      const r = await previewTitleForResource(tpl, cfg, resourceId);
      if (r.ok && r.sample) setSample(r.sample);
      else setMsg(r.message ?? "Preview failed");
    });
  }

  function applyOne() {
    if (!sample) return;
    setMsg(null);
    start(async () => {
      const r = await applyTitleToOne(scope, tpl, cfg, sample.resourceId);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function applyAll() {
    const aiNote = cfg.aiRewrite
      ? "\n\n⚠️ AI rewrite is ON — uses Claude credits and rewrites visible titles."
      : "";
    if (
      !confirm(
        `Apply title transforms to ALL ${scope}?\n\n⚠️ This rewrites the customer-visible title that appears on product cards, the cart, order receipts, and Google Shopping. Make sure you've previewed first.${aiNote}`,
      )
    )
      return;
    setBulk(null);
    setMsg(null);
    start(async () => {
      const r = await bulkApplyTitles(scope, tpl, cfg);
      setBulk(r);
    });
  }

  function dryRunAll() {
    setBulk(null);
    setMsg(null);
    start(async () => {
      const r = await bulkApplyTitles(scope, tpl, cfg, true);
      setBulk(r);
    });
  }

  function restore() {
    if (
      !confirm(
        `Restore titles for ${scope} from the last 60 minutes?\n\nReverts every ${scope.slice(0, -1)} the optimizer touched recently.`,
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const r = await restoreLastTitleRun(scope, 60);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
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
              setMsg(null);
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
        <strong>⚠️ Customer-visible:</strong> This edits the REAL{" "}
        {scope.slice(0, -1)} title (the H1 on the page, the name on product
        cards, in the cart, and in order emails) — not the SEO meta title.
        Always preview first. Restore button reverts the last 60 minutes.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Update Published / Drafts">
              <select
                value={cfg.scope}
                onChange={(e) =>
                  patchCfg({
                    scope: e.target.value as TitleOptimizerConfig["scope"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="published">Published Only</option>
                <option value="drafts">Drafts Only</option>
                <option value="all">Process All</option>
              </select>
            </Field>
            <ToggleRow
              label="Activate"
              checked={cfg.enabled}
              onChange={(v) => patchCfg({ enabled: v })}
            />
          </div>

          <hr className="border-slate-100" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ToggleRow
              label="Remove <br> tags"
              checked={cfg.removeBrTags}
              onChange={(v) => patchCfg({ removeBrTags: v })}
            />
            <ToggleRow
              label="Clear whitespace"
              checked={cfg.clearWhitespace}
              onChange={(v) => patchCfg({ clearWhitespace: v })}
            />
          </div>

          <hr className="border-slate-100" />

          <TemplateSettings
            value={tpl}
            onChange={setTpl}
            maxCharsHint="Enforced after the template renders. Leave empty to skip the cap."
          />

          <hr className="border-slate-100" />

          <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
            <ToggleRow
              label="🪄 AI rewrite mode (Claude rewrites titles)"
              checked={cfg.aiRewrite}
              onChange={(v) => patchCfg({ aiRewrite: v })}
            />
            {cfg.aiRewrite && (
              <div className="mt-3">
                <div className="text-xs font-medium text-violet-900 mb-1">
                  Extra instructions for Claude
                </div>
                <textarea
                  value={cfg.aiInstructions}
                  onChange={(e) => patchCfg({ aiInstructions: e.target.value })}
                  rows={3}
                  placeholder="E.g. Always include 'EMF Protection' as a keyword. Keep model number first."
                  className="w-full px-3 py-2 text-xs border border-violet-200 rounded"
                />
                <div className="text-[11px] text-violet-700 mt-2">
                  ⚠️ AI rewrites visible product titles. Always preview each
                  one first. Bulk capped at 100 per click.
                </div>
              </div>
            )}
          </div>
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
                {sample.productTitle}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => runPreview(sample.index - 1)}
                disabled={pending}
                className="p-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
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
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={pending}
                className="ml-2 p-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <div className="md:col-span-2 p-5 space-y-3 border-r border-slate-100">
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <div className="text-[10px] uppercase font-semibold text-amber-700">
                  Current Title ({sample.currentValue.length})
                </div>
                <div className="text-sm text-slate-800">
                  {sample.currentValue || (
                    <span className="italic text-slate-400">empty</span>
                  )}
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <div className="text-[10px] uppercase font-semibold text-emerald-700 flex items-center gap-2">
                  New Title ({sample.newValue.length})
                  {tpl.maxChars > 0 &&
                    sample.newValue.length >= tpl.maxChars && (
                      <span className="bg-red-500 text-white px-1 py-px rounded text-[9px]">
                        LIMIT REACHED
                      </span>
                    )}
                </div>
                <div className="text-sm text-slate-800">
                  {sample.newValue}
                </div>
              </div>
            </div>
            {sample.imageUrl && (
              <div className="p-5 grid place-items-center bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${sample.imageUrl}&width=240`}
                  alt={sample.productTitle}
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
          onClick={dryRunAll}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
        >
          Preview all
        </button>
        <button
          type="button"
          onClick={applyAll}
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
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restore
        </button>
        {msg && (
          <span className="basis-full text-xs text-slate-600 mt-1">{msg}</span>
        )}
        {bulk && (
          <div
            className={`basis-full text-xs mt-1 ${
              bulk.ok ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            <div>{bulk.message}</div>
            {bulk.preview && bulk.preview.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded bg-white max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-1.5">Handle</th>
                      <th className="text-left px-3 py-1.5">Current title</th>
                      <th className="text-left px-3 py-1.5">→ New title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulk.preview.slice(0, 100).map((p) => (
                      <tr key={p.resourceId} className="border-t border-slate-100">
                        <td className="px-3 py-1 font-mono text-slate-500 truncate max-w-[12rem]">
                          {p.handle ?? "—"}
                        </td>
                        <td className="px-3 py-1 text-slate-600 truncate max-w-md">
                          {p.oldTitle ?? "—"}
                        </td>
                        <td className="px-3 py-1 text-emerald-700 truncate max-w-md">
                          {p.newTitle}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bulk.preview.length > 100 && (
                  <div className="px-3 py-1.5 text-slate-500 border-t border-slate-100">
                    + {bulk.preview.length - 100} more (showing first 100)
                  </div>
                )}
              </div>
            )}
          </div>
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
      setResults(await searchResourcesForTitlePicker(scope, value)),
    );
  }
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">
            Pick a {scope.slice(0, -1)}
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

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-700">{label}</span>
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
    </div>
  );
}

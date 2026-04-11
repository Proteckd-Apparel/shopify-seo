"use client";

import { useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  TemplateBuilder,
  TemplateSettings,
} from "@/components/template-builder";
import type { TemplateConfig } from "@/lib/template-engine";
import type {
  PhotoFilenameConfig,
  TemplateScopeKey,
} from "@/lib/optimizer-config";
import {
  bulkRenameImages,
  previewFilenameTemplate,
  renameOneImage,
  savePhotoFilenameSettings,
  searchImagesForPicker,
  type FilenamePreviewSample,
} from "./actions";
import { isWebp } from "@/lib/filename-slug";

const TABS: Array<{ key: TemplateScopeKey; label: string }> = [
  { key: "products", label: "Products" },
  { key: "collections", label: "Collections" },
  { key: "articles", label: "Articles" },
];

export function PhotoFilenamesForm({
  initialTemplates,
  initialConfigs,
}: {
  initialTemplates: Record<TemplateScopeKey, TemplateConfig>;
  initialConfigs: Record<"products" | "collections" | "articles", PhotoFilenameConfig>;
}) {
  const [scope, setScope] = useState<TemplateScopeKey>("products");
  const [templates, setTemplates] =
    useState<Record<TemplateScopeKey, TemplateConfig>>(initialTemplates);
  const [configs, setConfigs] = useState(initialConfigs);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [sample, setSample] = useState<FilenamePreviewSample | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const tpl = templates[scope];
  const isPagesScope = scope === "pages";
  const cfg =
    !isPagesScope && (scope === "products" || scope === "collections" || scope === "articles")
      ? configs[scope]
      : null;

  function setTpl(next: TemplateConfig) {
    setTemplates({ ...templates, [scope]: next });
  }

  function patchCfg(p: Partial<PhotoFilenameConfig>) {
    if (!cfg || isPagesScope) return;
    setConfigs({
      ...configs,
      [scope as "products" | "collections" | "articles"]: { ...cfg, ...p },
    });
  }

  function save() {
    if (!cfg) return;
    setMsg(null);
    start(async () => {
      const r = await savePhotoFilenameSettings(scope, cfg, tpl);
      setMsg(r.message);
    });
  }

  function runPreview(index = 0) {
    if (!cfg) return;
    setMsg(null);
    start(async () => {
      const r = await previewFilenameTemplate(scope, tpl, cfg, index);
      if (r.ok && r.sample) setSample(r.sample);
      else setMsg(r.message ?? "Preview failed");
    });
  }

  function applyOne() {
    if (!sample || !cfg) return;
    setMsg(null);
    start(async () => {
      const r = await renameOneImage(scope, sample.imageId, tpl, cfg);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function applyAll() {
    if (!cfg) return;
    if (
      !confirm(
        `Rename images for ALL ${scope}?\n\n⚠️ This downloads each image, re-uploads it with the new filename, and deletes the old one. Slow (~5 sec per image), capped at 200 per click.\n\nMake sure you've previewed first.`,
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const r = await bulkRenameImages(scope, tpl, cfg);
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
        Renames product photos to SEO-friendly slugs based on the template.
        <br />
        <strong>How it works:</strong> downloads the original from the Shopify
        CDN, re-uploads with the new filename, attaches to the product, then
        deletes the old. ~5 seconds per image, bulk capped at 200 per run.
        <br />
        <strong>Warning:</strong> the new file gets a brand new CDN URL.
        Anything hardcoded to old image URLs (rare) will break. Always preview
        first.
      </div>

      {!cfg && (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-sm text-slate-500">
          This tab isn&apos;t supported in this build.
        </div>
      )}

      {cfg && (
        <>
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
                        scope: e.target.value as PhotoFilenameConfig["scope"],
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
                <ToggleRow
                  label="Do Not Re-Optimize Filenames"
                  checked={cfg.doNotReoptimize}
                  onChange={(v) => patchCfg({ doNotReoptimize: v })}
                />
              </div>

              <hr className="border-slate-100" />

              <TemplateSettings
                value={tpl}
                onChange={setTpl}
                maxCharsHint="Filename slug will be cut at the last hyphen before this length."
              />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ToggleRow
                  label="Remove Small Words (the/a/of)"
                  checked={cfg.removeSmallWords}
                  onChange={(v) => patchCfg({ removeSmallWords: v })}
                />
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
                    title="Previous image"
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
                    title="Next image"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    disabled={pending}
                    className="ml-2 p-1.5 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    title="Search for a specific image"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
                <div className="md:col-span-2 p-5 space-y-3 border-r border-slate-100">
                  <div className="bg-amber-50 border border-amber-200 rounded p-3">
                    <div className="text-[10px] uppercase font-semibold text-amber-700">
                      Current Filename ({sample.currentFilename.length})
                    </div>
                    <div className="text-sm text-slate-800 font-mono break-all">
                      {sample.currentFilename}
                    </div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                    <div className="text-[10px] uppercase font-semibold text-emerald-700 flex items-center gap-2">
                      New Filename ({sample.newFilename.length})
                      {tpl.maxChars > 0 &&
                        sample.newFilename.length >= tpl.maxChars && (
                          <span className="bg-red-500 text-white px-1 py-px rounded text-[9px]">
                            LIMIT REACHED
                          </span>
                        )}
                      {isWebp(sample.imageUrl) && (
                        <span className="bg-red-500 text-white px-1 py-px rounded text-[9px]">
                          WEBP
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-800 font-mono break-all">
                      {sample.newFilename}
                    </div>
                  </div>
                </div>
                <div className="p-5 grid place-items-center bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${sample.imageUrl}&width=240`}
                    alt={sample.productTitle}
                    className="max-w-full max-h-64 rounded shadow"
                  />
                </div>
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
                Rename this image
              </button>
            )}
            <button
              type="button"
              onClick={applyAll}
              disabled={pending}
              className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
            >
              {pending ? "Working…" : `Update all ${scope}`}
            </button>
            {msg && (
              <span className="basis-full text-xs text-slate-600 mt-1">
                {msg}
              </span>
            )}
          </div>

          {pickerOpen && (
            <Picker
              scope={scope}
              onClose={() => setPickerOpen(false)}
              onPick={(_imageId, index) => {
                setPickerOpen(false);
                runPreview(index);
              }}
            />
          )}
        </>
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
  onPick: (imageId: string, index: number) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    Array<{ imageId: string; productTitle: string; handle: string; src: string }>
  >([]);
  const [pending, start] = useTransition();
  function doSearch(value: string) {
    setQ(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    start(async () => setResults(await searchImagesForPicker(scope, value)));
  }
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Pick an image</h3>
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
            placeholder="Search products by title or handle…"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          {pending && (
            <div className="text-xs text-slate-400 mt-2">Searching…</div>
          )}
          {results.length > 0 && (
            <ul className="mt-3 max-h-64 overflow-y-auto border border-slate-100 rounded">
              {results.map((r, i) => (
                <li key={r.imageId}>
                  <button
                    type="button"
                    onClick={() => onPick(r.imageId, i)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0 flex items-center gap-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${r.src}&width=80`}
                      alt={r.productTitle}
                      className="w-10 h-10 object-cover rounded shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {r.productTitle || r.handle}
                      </div>
                      <div className="text-xs text-slate-500 font-mono truncate">
                        {r.handle}
                      </div>
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

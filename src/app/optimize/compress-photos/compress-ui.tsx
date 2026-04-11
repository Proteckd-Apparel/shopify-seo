"use client";

import { useState, useTransition } from "react";
import { Sparkles, RotateCcw, Search } from "lucide-react";
import {
  compressAll,
  compressOne,
  DEFAULT_COMPRESS_SETTINGS,
  restoreFromBackup,
  searchImagesForCompressPicker,
  testCompressOne,
  type CompressSettings,
  type TestResult,
} from "./actions";

export function CompressUI() {
  const [settings, setSettings] = useState<CompressSettings>(
    DEFAULT_COMPRESS_SETTINGS,
  );
  const [pending, start] = useTransition();
  const [test, setTest] = useState<TestResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState<null | "test" | "apply">(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  function patch(p: Partial<CompressSettings>) {
    setSettings({ ...settings, ...p });
  }

  function runTest(imageId: string) {
    setBulkMsg(null);
    start(async () => {
      const r = await testCompressOne(imageId, settings);
      setTest(r);
    });
  }

  function applyOneFromPicker(imageId: string) {
    setBulkMsg(null);
    start(async () => {
      const r = await compressOne(imageId, settings);
      setBulkMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function applyAll() {
    if (
      !confirm(
        `Compress ALL active product images?\n\n⚠️ Original bytes are backed up to Postgres so Restore works for 60 minutes after.\n\nBulk capped at 100 images per click.${
          settings.visionAlt || settings.visionRename
            ? "\n\nVision AI is ON — uses Claude credits."
            : ""
        }`,
      )
    )
      return;
    setBulkMsg(null);
    start(async () => {
      const r = await compressAll(settings);
      setBulkMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function restore() {
    if (
      !confirm(
        "Restore ALL images compressed in the last 60 minutes from backup? This re-uploads the original bytes for each one.",
      )
    )
      return;
    setBulkMsg(null);
    start(async () => {
      const r = await restoreFromBackup();
      setBulkMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <strong>How this works:</strong> downloads each product image, backs
        up the original bytes to Postgres, compresses with sharp, optionally
        runs Vision AI on it for alt text + filename, uploads as a new file,
        attaches to the product, deletes the old. Same swap pattern as Photo
        Filenames. Restore works for 60 minutes after each run.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Format">
              <select
                value={settings.format}
                onChange={(e) =>
                  patch({
                    format: e.target.value as CompressSettings["format"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="webp">WebP (recommended)</option>
                <option value="avif">AVIF (smallest)</option>
                <option value="jpeg">JPEG (mozjpeg)</option>
              </select>
            </Field>
            <Field label={`Quality (${settings.quality})`}>
              <input
                type="range"
                min={50}
                max={95}
                value={settings.quality}
                onChange={(e) =>
                  patch({ quality: parseInt(e.target.value, 10) })
                }
                className="w-full"
              />
            </Field>
            <Field label="Limit pixel size">
              <select
                value={settings.maxWidth}
                onChange={(e) =>
                  patch({ maxWidth: parseInt(e.target.value, 10) })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value={1500}>1500px</option>
                <option value={2000}>2000px</option>
                <option value={2500}>2500px</option>
                <option value={3000}>3000px</option>
              </select>
            </Field>
          </div>

          <hr className="border-slate-100" />

          <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-violet-900 font-semibold text-sm">
              <Sparkles className="w-4 h-4" /> Vision AI (uses Claude credits)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ToggleRow
                label="Vision AI alt text"
                checked={settings.visionAlt}
                onChange={(v) => patch({ visionAlt: v })}
              />
              <ToggleRow
                label="Vision AI rename filename"
                checked={settings.visionRename}
                onChange={(v) => patch({ visionRename: v })}
              />
              <ToggleRow
                label="Overwrite existing alts"
                checked={settings.overwriteExistingAlts}
                onChange={(v) => patch({ overwriteExistingAlts: v })}
              />
            </div>
            <div className="text-xs text-violet-700">
              ~$0.003 per image. Both can be on simultaneously for one
              combined Claude call.
            </div>
          </div>
        </div>
      </div>

      {test && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Test Result
              </div>
              <div className="text-sm font-semibold text-slate-900 truncate max-w-md">
                {test.productTitle}
              </div>
            </div>
            {test.imageId && (
              <button
                type="button"
                onClick={() => test.imageId && applyOneFromPicker(test.imageId)}
                disabled={pending}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
              >
                Apply this image
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            <div className="md:col-span-2 p-5 space-y-3 border-r border-slate-100">
              {test.ok ? (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                    <div className="text-[10px] uppercase font-semibold text-emerald-700">
                      Compressed result
                    </div>
                    <div className="text-sm font-semibold">{test.message}</div>
                    <div className="text-xs text-slate-600">
                      {test.savedPercent}% smaller · {test.width}×{test.height}
                    </div>
                  </div>
                  {test.visionAlt && (
                    <div className="bg-violet-50 border border-violet-200 rounded p-3">
                      <div className="text-[10px] uppercase font-semibold text-violet-700">
                        Vision AI alt text
                      </div>
                      <div className="text-sm">{test.visionAlt}</div>
                    </div>
                  )}
                  {test.visionFilename && (
                    <div className="bg-violet-50 border border-violet-200 rounded p-3">
                      <div className="text-[10px] uppercase font-semibold text-violet-700">
                        Vision AI filename
                      </div>
                      <div className="text-sm font-mono">
                        {test.visionFilename}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
                  {test.message}
                </div>
              )}
            </div>
            {test.imageUrl && (
              <div className="p-5 grid place-items-center bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${test.imageUrl}&width=240`}
                  alt={test.productTitle ?? ""}
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
          onClick={() => setPickerOpen("test")}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <Search className="w-3.5 h-3.5 inline mr-1" />
          Test on one image
        </button>
        <button
          type="button"
          onClick={applyAll}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : "Compress all product images"}
        </button>
        <button
          type="button"
          onClick={restore}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
          title="Restore originals from backup (last 60 min)"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restore last 60 min
        </button>
        {bulkMsg && (
          <span className="basis-full text-xs text-slate-700 mt-1">
            {bulkMsg}
          </span>
        )}
      </div>

      {pickerOpen && (
        <Picker
          onClose={() => setPickerOpen(null)}
          onPick={(id) => {
            setPickerOpen(null);
            runTest(id);
          }}
        />
      )}
    </div>
  );
}

function Picker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (id: string) => void;
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
    start(async () => setResults(await searchImagesForCompressPicker(value)));
  }
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Pick an image to test</h3>
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
              {results.map((r) => (
                <li key={r.imageId}>
                  <button
                    type="button"
                    onClick={() => onPick(r.imageId)}
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

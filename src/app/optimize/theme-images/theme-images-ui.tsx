"use client";

import { useEffect, useState, useTransition } from "react";
import {
  compressAllThemeImages,
  compressOneThemeImage,
  listThemeImages,
  testCompressThemeImage,
  type ThemeImageRow,
  type TestCompressResult,
} from "./actions";

export function ThemeImagesUI() {
  const [images, setImages] = useState<ThemeImageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [format, setFormat] = useState<"webp" | "avif" | "jpeg">("webp");
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState(2000);
  const [filter, setFilter] = useState("");
  const [testResults, setTestResults] = useState<
    Record<string, TestCompressResult>
  >({});
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  useEffect(() => {
    start(async () => {
      const r = await listThemeImages();
      if (r.ok && r.images) setImages(r.images);
      else setError(r.message ?? "Failed");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    start(async () => {
      const r = await listThemeImages();
      if (r.ok && r.images) setImages(r.images);
    });
  }

  function testOne(filename: string) {
    start(async () => {
      const r = await testCompressThemeImage(
        filename,
        format,
        quality,
        maxWidth,
      );
      setTestResults({ ...testResults, [filename]: r });
    });
  }

  function applyOne(filename: string) {
    if (!confirm(`Compress ${filename}? Replaces the file in your theme.`))
      return;
    start(async () => {
      const r = await compressOneThemeImage(
        filename,
        format,
        quality,
        maxWidth,
      );
      setTestResults({
        ...testResults,
        [filename]: { ...r, message: r.message } as TestCompressResult,
      });
      refresh();
    });
  }

  function applyAll() {
    if (!images) return;
    if (
      !confirm(
        `Compress ALL ${images.length} theme images?\n\nReplaces files in your live theme. Same filenames so Liquid references stay valid. Recommended: duplicate your theme first as a backup.`,
      )
    )
      return;
    setBulkMsg(null);
    start(async () => {
      const r = await compressAllThemeImages(format, quality, maxWidth);
      setBulkMsg((r.ok ? "✅ " : "❌ ") + r.message);
      refresh();
    });
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  if (!images) {
    return <div className="text-sm text-slate-500">Loading theme images…</div>;
  }

  const filtered = filter
    ? images.filter((i) =>
        i.filename.toLowerCase().includes(filter.toLowerCase()),
      )
    : images;

  // Defensive: filter out implausible sizes (Shopify occasionally returns
  // a wrong-unit value for some theme files which made the total render
  // as "782014.3 MB" for a ~1.5 MB pair). 500 MB ceiling catches outliers
  // without dropping legit large hero JPEGs.
  const PLAUSIBLE_MAX = 500 * 1024 * 1024;
  const totalBytes = images.reduce(
    (s, i) => s + (i.size > 0 && i.size < PLAUSIBLE_MAX ? i.size : 0),
    0,
  );
  function fmtBytes(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "0 KB";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <strong>Backup recommended:</strong> Shopify admin → Online Store →
        Themes → Actions → Duplicate. There&apos;s no Restore button — once
        compressed, the original bytes are gone. Same filename means no
        Liquid changes needed.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Output format">
            <select
              value={format}
              onChange={(e) =>
                setFormat(e.target.value as "webp" | "avif" | "jpeg")
              }
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
            >
              <option value="webp">WebP (recommended)</option>
              <option value="avif">AVIF (smallest)</option>
              <option value="jpeg">JPEG (mozjpeg)</option>
            </select>
          </Field>
          <Field label={`Quality (${quality})`}>
            <input
              type="range"
              min={50}
              max={95}
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </Field>
          <Field label="Limit image pixel size">
            <select
              value={maxWidth}
              onChange={(e) => setMaxWidth(parseInt(e.target.value, 10))}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
            >
              <option value={1500}>1500px</option>
              <option value={2000}>2000px (Default)</option>
              <option value={2500}>2500px</option>
              <option value={3000}>3000px</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter filenames…"
          className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded"
        />
        <div className="text-xs text-slate-500">
          {filtered.length} of {images.length} images ·{" "}
          {fmtBytes(totalBytes)} total
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Filename</th>
              <th className="text-right px-4 py-2 w-24">Size</th>
              <th className="text-left px-4 py-2 w-64">Test result</th>
              <th className="text-right px-4 py-2 w-44">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((img) => {
              const tr = testResults[img.filename];
              return (
                <tr
                  key={img.filename}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-2 font-mono text-xs truncate max-w-md">
                    {img.filename.replace(/^assets\//, "")}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-slate-500 tabular-nums">
                    {(img.size / 1024).toFixed(0)} KB
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {tr ? (
                      tr.ok ? (
                        <span className="text-emerald-700">
                          {tr.message}
                          {tr.savedPercent !== undefined && (
                            <> · {tr.savedPercent}% smaller</>
                          )}
                        </span>
                      ) : (
                        <span className="text-red-700">{tr.message}</span>
                      )
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => testOne(img.filename)}
                      disabled={pending}
                      className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 mr-1 disabled:opacity-60"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => applyOne(img.filename)}
                      disabled={pending}
                      className="text-xs px-2 py-1 rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-60"
                    >
                      Compress
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-2 shadow-lg">
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Refresh list
        </button>
        <button
          type="button"
          onClick={applyAll}
          disabled={pending}
          className="ml-auto px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : `Compress all ${images.length} images`}
        </button>
        {bulkMsg && (
          <span className="basis-full text-xs text-slate-700 mt-1">
            {bulkMsg}
          </span>
        )}
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

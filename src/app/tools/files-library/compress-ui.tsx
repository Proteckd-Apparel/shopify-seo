"use client";

import { useState, useTransition } from "react";
import { Zap, FileImage } from "lucide-react";
import {
  compressAllFiles,
  compressOneFile,
  type CompressFileResult,
  type CompressFileSettings,
} from "./actions";
import type { ImageFileRow } from "@/lib/shopify-files";

const DEFAULT_FILE_COMPRESS_SETTINGS: CompressFileSettings = {
  quality: 80,
  maxWidth: 2400,
};

function fmtBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function FilesLibraryUI({ initial }: { initial: ImageFileRow[] }) {
  const [rows] = useState(initial);
  const [results, setResults] = useState<Record<string, CompressFileResult>>(
    {},
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<CompressFileSettings>(
    DEFAULT_FILE_COMPRESS_SETTINGS,
  );

  const totalBytes = rows.reduce((s, r) => s + r.size, 0);

  function patch(p: Partial<CompressFileSettings>) {
    setSettings({ ...settings, ...p });
  }

  function runAll() {
    if (
      !confirm(
        `Compress ${Math.min(rows.length, 50)} image files at quality ${settings.quality}, max ${settings.maxWidth}px wide? Each one is re-encoded in the same format and uploaded as a new file; the old copy is deleted only if nothing references it. Capped at 50 per run.`,
      )
    )
      return;
    setMsg(null);
    setResults({});
    start(async () => {
      const r = await compressAllFiles(settings);
      const map: Record<string, CompressFileResult> = {};
      for (const x of r.results) map[x.fileId] = x;
      setResults(map);
      setMsg(r.message);
    });
  }

  function runOne(row: ImageFileRow) {
    setMsg(null);
    start(async () => {
      const r = await compressOneFile(row.id, row.url, row.filename, settings);
      setResults((prev) => ({ ...prev, [row.id]: r }));
      setMsg(`${row.filename}: ${r.message}`);
    });
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Compresses images stored in <strong>Shopify Content → Files</strong>{" "}
        (not product images — use Compress Photos for those, and Compress
        Asset Images for theme assets). Re-encoded in the same format so
        filename extensions stay the same, but the file gets a new CDN url —
        any old hardcoded references to the exact old url will break. The
        old copy is deleted only when Shopify confirms nothing references it.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1">
              <span>Quality</span>
              <span className="font-mono text-slate-500">
                {settings.quality}
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={95}
              value={settings.quality}
              onChange={(e) =>
                patch({ quality: parseInt(e.target.value, 10) })
              }
              disabled={pending}
              className="w-full"
            />
            <div className="text-[10px] text-slate-500 mt-1">
              80 = default (no visible loss), 70 = aggressive, 60 = visible
              artifacts on gradients / skin tones.
            </div>
          </label>
          <label className="block">
            <div className="text-xs font-medium text-slate-700 mb-1">
              Max width
            </div>
            <select
              value={settings.maxWidth}
              onChange={(e) =>
                patch({ maxWidth: parseInt(e.target.value, 10) })
              }
              disabled={pending}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
            >
              <option value={1500}>1500px</option>
              <option value={2000}>2000px</option>
              <option value={2400}>2400px (default)</option>
              <option value={3000}>3000px</option>
              <option value={4000}>4000px (essentially no resize)</option>
            </select>
            <div className="text-[10px] text-slate-500 mt-1">
              Anything wider than this is resized down; narrower images are
              left alone.
            </div>
          </label>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Files library
          </div>
          <div className="text-xs text-slate-500">
            {rows.length} image{rows.length === 1 ? "" : "s"} ·{" "}
            {fmtBytes(totalBytes)} total
          </div>
        </div>
        <div className="p-5">
          <button
            type="button"
            onClick={runAll}
            disabled={pending || rows.length === 0}
            className="w-full px-4 py-3 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {pending
              ? "Compressing…"
              : `Compress all (up to 50)`}
          </button>
          {msg && (
            <div className="mt-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
              {msg}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Images ({rows.length}) · sorted by size
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No images found in Shopify Files.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">File</th>
                <th className="text-right px-4 py-2 w-24">Before</th>
                <th className="text-right px-4 py-2 w-24">After</th>
                <th className="text-right px-4 py-2 w-24">Saved</th>
                <th className="text-right px-4 py-2 w-32">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const res = results[r.id];
                const saved = res?.saved ?? 0;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <FileImage className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate max-w-md">{r.filename}</span>
                      </div>
                      {res && (
                        <div
                          className={`text-[10px] mt-0.5 ml-5 ${
                            res.ok ? "text-emerald-700" : "text-amber-600"
                          }`}
                        >
                          {res.message}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-slate-600">
                      {fmtBytes(r.size)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-slate-600">
                      {res?.after ? fmtBytes(res.after) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-xs text-emerald-700 font-semibold">
                      {saved > 0 ? fmtBytes(saved) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => runOne(r)}
                        disabled={pending}
                        className="px-2 py-1 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-60"
                      >
                        Compress
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

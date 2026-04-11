"use client";

import { useState, useTransition } from "react";
import { Zap, FileImage } from "lucide-react";
import {
  type AssetRow,
  type CompressOneResult,
  compressAllAssets,
  compressOneAsset,
} from "./actions";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function AssetCompressUI({
  initial,
  themeName,
}: {
  initial: AssetRow[];
  themeName: string;
}) {
  const [rows] = useState(initial);
  const [results, setResults] = useState<Record<string, CompressOneResult>>({});
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const eligible = rows.filter((r) => !r.skipReason);
  const totalEligibleBytes = eligible.reduce((s, r) => s + r.size, 0);

  function compressAll() {
    if (
      !confirm(
        `Compress ${eligible.length} theme asset images on "${themeName}"? Re-encodes in place — Shopify keeps a theme version history so you can roll back if needed.`,
      )
    )
      return;
    setMsg(null);
    setResults({});
    start(async () => {
      const r = await compressAllAssets();
      const map: Record<string, CompressOneResult> = {};
      for (const x of r.results) map[x.filename] = x;
      setResults(map);
      setMsg(r.message);
    });
  }

  function compressOne(filename: string) {
    setMsg(null);
    start(async () => {
      const r = await compressOneAsset(filename);
      setResults((prev) => ({ ...prev, [filename]: r }));
      setMsg(`${filename}: ${r.message}`);
    });
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Compresses every image in your theme&apos;s <code>assets/</code> folder
        in place. SVGs, animated GIFs, favicons, and tiny icons are skipped.
        Shopify keeps a theme version history, so if anything looks wrong you
        can roll the theme back from{" "}
        <strong>Online Store → Themes → ⋯ → Older versions</strong>.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Theme: {themeName}
          </div>
          <div className="text-xs text-slate-500">
            {eligible.length} eligible · {fmtBytes(totalEligibleBytes)} total
          </div>
        </div>
        <div className="p-5">
          <button
            type="button"
            onClick={compressAll}
            disabled={pending || eligible.length === 0}
            className="w-full px-4 py-3 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {pending ? "Compressing…" : `Compress all asset images (${eligible.length})`}
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
          Asset images ({rows.length})
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No images found in theme assets.
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
                const res = results[r.filename];
                const saved = res?.saved ?? 0;
                return (
                  <tr key={r.filename} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <FileImage className="w-3.5 h-3.5 text-slate-400" />
                        {r.filename.replace(/^assets\//, "")}
                      </div>
                      {r.skipReason && (
                        <div className="text-[10px] text-slate-400 mt-0.5 ml-5">
                          skipped: {r.skipReason}
                        </div>
                      )}
                      {res && !res.ok && !r.skipReason && (
                        <div className="text-[10px] text-amber-600 mt-0.5 ml-5">
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
                      {!r.skipReason && (
                        <button
                          type="button"
                          onClick={() => compressOne(r.filename)}
                          disabled={pending}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-60"
                        >
                          Compress
                        </button>
                      )}
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

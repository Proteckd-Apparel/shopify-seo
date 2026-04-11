"use client";

import { useEffect, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import {
  listLowResImages,
  pingReplicate,
  testUpscaleOne,
  upscaleAllLowRes,
  upscaleAndApply,
  type LowResRow,
  type TestUpscaleResult,
} from "./actions";

export function UpscaleUI() {
  const [rows, setRows] = useState<LowResRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [threshold, setThreshold] = useState(700);
  const [scale, setScale] = useState<2 | 4>(2);
  const [skipTransparent, setSkipTransparent] = useState(true);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [pingMsg, setPingMsg] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, TestUpscaleResult>
  >({});

  function refresh() {
    start(async () => {
      const r = await listLowResImages(threshold);
      if (r.ok && r.rows) setRows(r.rows);
      else setError(r.message ?? "Failed");
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold]);

  function ping() {
    setPingMsg(null);
    start(async () => {
      const r = await pingReplicate();
      setPingMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function testOne(imageId: string) {
    start(async () => {
      const r = await testUpscaleOne(imageId, scale);
      setTestResults({ ...testResults, [imageId]: r });
    });
  }

  function applyOne(imageId: string) {
    if (
      !confirm(
        "Upscale this image and replace it on the product?\n\nOriginal bytes are backed up so you can restore via the Compress Photos page (60 min window).",
      )
    )
      return;
    start(async () => {
      const r = await upscaleAndApply(imageId, scale, skipTransparent);
      setTestResults({
        ...testResults,
        [imageId]: { ...r, message: r.message } as TestUpscaleResult,
      });
      refresh();
    });
  }

  function applyAll() {
    if (!rows || rows.length === 0) return;
    if (
      !confirm(
        `Upscale ALL ${rows.length} low-res images?\n\nUses Replicate ESRGAN at $0.005 per image (~$${(rows.length * 0.005).toFixed(2)} total). Slow — about 8-12 sec per image. Capped at 50 per click. Originals backed up.`,
      )
    )
      return;
    setBulkMsg(null);
    start(async () => {
      const r = await upscaleAllLowRes(threshold, scale, skipTransparent);
      setBulkMsg((r.ok ? "✅ " : "❌ ") + r.message);
      refresh();
    });
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <strong>Cost reminder:</strong> ~$0.005 per image via Replicate Real-ESRGAN. Make sure you&apos;ve added your Replicate token in <strong>Settings</strong>. The replaced image gets a new CDN URL — same swap pattern as Photo Filenames / Compress Photos. Original bytes are backed up.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-3">
        <button
          type="button"
          onClick={ping}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Test Replicate connection
        </button>
        {pingMsg && <span className="text-xs text-slate-600">{pingMsg}</span>}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Scan for photos smaller than">
            <select
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
            >
              <option value={500}>500px</option>
              <option value={600}>600px</option>
              <option value={700}>700px</option>
              <option value={800}>800px</option>
              <option value={1000}>1000px</option>
              <option value={1200}>1200px</option>
            </select>
          </Field>
          <Field label="Upscale factor">
            <select
              value={scale}
              onChange={(e) => setScale(parseInt(e.target.value, 10) as 2 | 4)}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
            >
              <option value={2}>2× (recommended)</option>
              <option value={4}>4× (slowest, biggest)</option>
            </select>
          </Field>
          <ToggleRow
            label="Skip transparent photos (PNGs)"
            checked={skipTransparent}
            onChange={setSkipTransparent}
          />
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {error}
        </div>
      ) : !rows ? (
        <div className="text-sm text-slate-500">Loading low-res images…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          No low-res images found below {threshold}px. ✅
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-b border-slate-100">
            {rows.length} images below {threshold}px wide
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 w-20">Image</th>
                <th className="text-left px-4 py-2">Product</th>
                <th className="text-right px-4 py-2 w-24">Size</th>
                <th className="text-left px-4 py-2 w-64">Result</th>
                <th className="text-right px-4 py-2 w-44">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const tr = testResults[row.imageId];
                return (
                  <tr
                    key={row.imageId}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${row.src}&width=80`}
                        alt={row.productTitle}
                        className="w-12 h-12 object-cover rounded border border-slate-200"
                        loading="lazy"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900 truncate max-w-xs">
                        {row.productTitle}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate max-w-xs">
                        {row.productHandle}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-red-600 tabular-nums">
                      {row.width}×{row.height}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {tr ? (
                        tr.ok ? (
                          <a
                            href={tr.upscaledUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-700 hover:underline"
                          >
                            {tr.message}
                          </a>
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
                        onClick={() => testOne(row.imageId)}
                        disabled={pending}
                        className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 mr-1 disabled:opacity-60"
                      >
                        Test
                      </button>
                      <button
                        type="button"
                        onClick={() => applyOne(row.imageId)}
                        disabled={pending}
                        className="text-xs px-2 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60"
                      >
                        <Sparkles className="w-3 h-3 inline mr-0.5" /> Upscale
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
          disabled={pending || !rows || rows.length === 0}
          className="ml-auto px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending
            ? "Working…"
            : rows
              ? `Upscale all ${rows.length} images`
              : "Upscale all"}
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
    <div className="flex items-center justify-between text-sm pt-5">
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

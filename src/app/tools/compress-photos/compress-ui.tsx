"use client";

import { useState, useTransition } from "react";
import { testCompress, type TestCompressResult } from "./actions";

export function CompressUI() {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<"webp" | "avif" | "jpeg">("webp");
  const [quality, setQuality] = useState(80);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TestCompressResult | null>(null);

  function run() {
    setResult(null);
    start(async () => {
      setResult(await testCompress(url, format, quality));
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl">
      <h3 className="font-semibold text-slate-900 mb-4">Test on one image</h3>

      <label className="block mb-3">
        <div className="text-xs font-medium text-slate-700 mb-1">
          Image URL (paste a Shopify CDN URL)
        </div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://cdn.shopify.com/s/files/1/.../my-photo.jpg"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded font-mono"
        />
      </label>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="block">
          <div className="text-xs font-medium text-slate-700 mb-1">Format</div>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as "webp" | "avif" | "jpeg")}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded bg-white"
          >
            <option value="webp">WebP (recommended)</option>
            <option value="avif">AVIF (smallest)</option>
            <option value="jpeg">JPEG (mozjpeg)</option>
          </select>
        </label>
        <label className="block">
          <div className="text-xs font-medium text-slate-700 mb-1">
            Quality ({quality})
          </div>
          <input
            type="range"
            min={50}
            max={95}
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value, 10))}
            className="w-full"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={!url || pending}
        className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        {pending ? "Compressing…" : "Test compression"}
      </button>

      {result && (
        <div
          className={`mt-4 p-4 rounded border ${
            result.ok
              ? "bg-emerald-50 border-emerald-200"
              : "bg-red-50 border-red-200"
          }`}
        >
          {result.ok ? (
            <>
              <div className="text-sm text-emerald-900 font-semibold">
                {result.message}
              </div>
              <div className="text-xs text-emerald-800 mt-1">
                Saved {result.savedPercent}% · {result.width}×{result.height} ·{" "}
                {result.format}
              </div>
            </>
          ) : (
            <div className="text-sm text-red-700">{result.message}</div>
          )}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
        <strong>Bulk compression</strong> (download → re-encode → upload →
        swap references) is the next step. The test button above proves the
        pipeline works on your images. Once you confirm a savings level you
        like, we&apos;ll wire the bulk &quot;Compress all product photos&quot;
        button.
      </div>
    </div>
  );
}

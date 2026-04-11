"use client";

import { useState, useTransition } from "react";
import {
  applySearchReplace,
  previewSearchReplace,
  type SnRPreview,
} from "./actions";

export function SnRForm() {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [scope, setScope] = useState({
    product: true,
    collection: true,
    page: true,
    article: true,
  });
  const [preview, setPreview] = useState<SnRPreview | null>(null);
  const [pending, start] = useTransition();
  const [applied, setApplied] = useState<string | null>(null);

  function runPreview() {
    setApplied(null);
    start(async () => {
      setPreview(
        await previewSearchReplace(find, replace, scope, caseSensitive),
      );
    });
  }

  function runApply() {
    if (
      !confirm(
        `Replace "${find}" with "${replace}" across ${preview?.matches.length ?? 0} matches? This writes to Shopify.`,
      )
    )
      return;
    start(async () => {
      const r = await applySearchReplace(find, replace, scope, caseSensitive);
      setApplied(r.message);
      setPreview(null);
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-xs font-medium text-slate-700 mb-1">Find</div>
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded font-mono"
            />
          </label>
          <label className="block">
            <div className="text-xs font-medium text-slate-700 mb-1">
              Replace with
            </div>
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded font-mono"
            />
          </label>
        </div>

        <div className="flex gap-4 mt-3 text-sm">
          {(["product", "collection", "page", "article"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={scope[t]}
                onChange={(e) =>
                  setScope((s) => ({ ...s, [t]: e.target.checked }))
                }
              />
              {t}s
            </label>
          ))}
          <label className="flex items-center gap-1 ml-auto">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Case sensitive
          </label>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={runPreview}
            disabled={!find || pending}
            className="px-4 py-2 rounded bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Working…" : "Preview matches"}
          </button>
          {preview?.matches.length ? (
            <button
              type="button"
              onClick={runApply}
              disabled={pending}
              className="px-4 py-2 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
            >
              Apply to {preview.matches.length} matches
            </button>
          ) : null}
        </div>
        {applied && (
          <div className="mt-3 text-sm text-emerald-700">{applied}</div>
        )}
      </div>

      {preview && preview.matches.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 text-xs uppercase text-slate-500 bg-slate-50">
            Preview ({preview.matches.length} matches)
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase">
              <tr>
                <th className="text-left px-3 py-1.5">Resource</th>
                <th className="text-left px-3 py-1.5">Field</th>
                <th className="text-left px-3 py-1.5">Before → After</th>
              </tr>
            </thead>
            <tbody>
              {preview.matches.map((m, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{m.title}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">{m.field}</td>
                  <td className="px-3 py-2 font-mono text-[10px]">
                    <div className="text-red-600">- {m.before}</div>
                    <div className="text-emerald-700">+ {m.after}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BulkProgressBar } from "@/components/bulk-progress-bar";
import {
  bulkTranslateAllTypes,
  bulkTranslateResources,
  scanTranslationCoverage,
  saveTranslatorLocales,
  translateOneResource,
  type CoverageRow,
  type LocalesReport,
} from "./actions";

export function TranslationsUI({
  initialLocales,
  initialMyLocales,
}: {
  initialLocales: LocalesReport;
  initialMyLocales: string[];
}) {
  const [locales] = useState(initialLocales);
  const [myLocales, setMyLocales] = useState<Set<string>>(
    new Set(initialMyLocales),
  );
  const [coverage, setCoverage] = useState<CoverageRow[] | null>(null);
  const [pending, start] = useTransition();
  // Separate pending state for fire-and-forget bulk translates so they
  // don't block navigation. The translate buttons set bulkRunning=true
  // and call the action without awaiting in a transition; the topbar
  // pill + BulkProgressBar below show progress while it runs.
  const [bulkRunning, setBulkRunning] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [msg, setMsg] = useState<string | null>(null);
  const [scope, setScope] = useState<
    "product" | "collection" | "article" | "page"
  >("product");
  const [resourceId, setResourceId] = useState("");

  function toggleLocale(code: string) {
    const next = new Set(myLocales);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setMyLocales(next);
  }

  function saveLocales() {
    setMsg(null);
    start(async () => {
      const r = await saveTranslatorLocales([...myLocales]);
      setMsg(r.message);
    });
  }

  function runCoverage() {
    setMsg(null);
    setCoverage(null);
    start(async () => {
      const r = await scanTranslationCoverage(scope);
      if (r.ok && r.rows) setCoverage(r.rows);
      else setMsg("❌ " + (r.message ?? "Failed"));
    });
  }

  function translateOne() {
    if (!resourceId) {
      setMsg("Paste a resource GID first");
      return;
    }
    setMsg(null);
    start(async () => {
      const r = await translateOneResource(resourceId);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function bulkRun() {
    if (myLocales.size === 0) {
      setMsg("Pick at least one locale to translate to");
      return;
    }
    if (
      !confirm(
        `Translate all ${scope}s into ${myLocales.size} locale(s)?\n\nUses Claude credits (~$0.0005 per 1k chars). Capped at 200 ${scope}s per click.\n\nFeel free to navigate — the job keeps running on the server. Watch the progress bar below.`,
      )
    )
      return;
    setMsg(null);
    setBulkRunning(true);
    bulkTranslateResources(scope)
      .then((r) => {
        if (mounted.current) {
          setMsg((r.ok ? "✅ " : "❌ ") + r.message);
          setBulkRunning(false);
        }
      })
      .catch((e) => {
        if (mounted.current) {
          setMsg("❌ " + (e instanceof Error ? e.message : "Failed"));
          setBulkRunning(false);
        }
      });
  }

  function bulkRunAllTypes() {
    if (myLocales.size === 0) {
      setMsg("Pick at least one locale to translate to");
      return;
    }
    if (
      !confirm(
        `Translate EVERY resource type (products + collections + articles + pages) into ${myLocales.size} locale(s)?\n\nWalks all 4 types sequentially, 200 cap per type per click. Idempotent — repeat clicks pick up where the last one left off via Shopify's "outdated" flag.\n\nFeel free to navigate — the job keeps running on the server. Watch the progress bar below.`,
      )
    )
      return;
    setMsg(null);
    setBulkRunning(true);
    bulkTranslateAllTypes()
      .then((r) => {
        if (mounted.current) {
          setMsg((r.ok ? "✅ " : "❌ ") + r.message);
          setBulkRunning(false);
        }
      })
      .catch((e) => {
        if (mounted.current) {
          setMsg("❌ " + (e instanceof Error ? e.message : "Failed"));
          setBulkRunning(false);
        }
      });
  }

  if (!locales.ok) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
        Could not load Shopify locales: {locales.message}
      </div>
    );
  }

  const non = locales.locales.filter((l) => !l.primary);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <strong>How this works:</strong> Translate &amp; Adapt covers up to 3
        languages free. For everything beyond that, this page uses Claude
        Haiku to translate via the official Shopify Translation API. Pick the
        locales <strong>mine</strong> should handle below — anything you leave
        unchecked stays managed by Translate &amp; Adapt.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Shopify locales
        </div>
        <div className="p-5">
          <div className="space-y-2">
            {locales.locales.map((l) => (
              <div
                key={l.locale}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100">
                    {l.locale}
                  </code>
                  <span className="text-sm text-slate-900">{l.name}</span>
                  {l.primary && (
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                      primary
                    </span>
                  )}
                  {!l.primary && l.published && (
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      published
                    </span>
                  )}
                  {!l.primary && !l.published && (
                    <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                      draft
                    </span>
                  )}
                </div>
                {!l.primary && (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    Mine handles
                    <input
                      type="checkbox"
                      checked={myLocales.has(l.locale)}
                      onChange={() => toggleLocale(l.locale)}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={saveLocales}
              disabled={pending}
              className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
            >
              Save selection
            </button>
            <span className="text-xs text-slate-500">
              {myLocales.size} locale(s) handled by mine
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Coverage scan
          </div>
          <div className="flex items-center gap-2">
            <select
              value={scope}
              onChange={(e) =>
                setScope(
                  e.target.value as "product" | "collection" | "article" | "page",
                )
              }
              className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
            >
              <option value="product">Products</option>
              <option value="collection">Collections</option>
              <option value="article">Articles</option>
              <option value="page">Pages</option>
            </select>
            <button
              type="button"
              onClick={runCoverage}
              disabled={pending}
              className="px-3 py-1.5 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-60"
            >
              Scan
            </button>
          </div>
        </div>
        <div className="p-0">
          {coverage ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Locale</th>
                  <th className="text-right px-4 py-2">Translated</th>
                  <th className="text-right px-4 py-2">Outdated</th>
                  <th className="text-right px-4 py-2">Missing</th>
                </tr>
              </thead>
              <tbody>
                {coverage.map((c) => (
                  <tr key={c.locale} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <code className="text-xs font-mono">{c.locale}</code>{" "}
                      {c.name}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                      {c.withTranslations}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-700">
                      {c.outdated}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-700">
                      {c.missing}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-xs text-slate-500 px-5 py-4">
              Click <strong>Scan</strong> above. Samples 50 resources per
              locale and projects coverage. Slow because each locale costs one
              API call per resource (~5-10 sec total for products).
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">
          Translate one resource (test)
        </h3>
        <input
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          placeholder="gid://shopify/Product/8186735722675"
          className="w-full px-3 py-2 text-xs border border-slate-200 rounded font-mono"
        />
        <button
          type="button"
          onClick={translateOne}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-sky-500 text-white text-sm hover:bg-sky-600 disabled:opacity-60"
        >
          Translate this resource
        </button>
      </div>

      <BulkProgressBar kind="translations" />

      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-2 shadow-lg">
        <button
          type="button"
          onClick={bulkRun}
          disabled={bulkRunning}
          className="px-4 py-1.5 rounded bg-white border border-indigo-300 text-indigo-700 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-60"
        >
          {bulkRunning ? "Running… (navigate freely)" : `Translate all ${scope}s`}
        </button>
        <button
          type="button"
          onClick={bulkRunAllTypes}
          disabled={bulkRunning}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
          title="Walks products → collections → articles → pages in one click"
        >
          {bulkRunning
            ? "Running… (navigate freely)"
            : "Translate everything (all types)"}
        </button>
        {msg && (
          <span className="basis-full text-xs text-slate-700 mt-1">
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

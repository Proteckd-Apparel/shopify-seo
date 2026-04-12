"use client";

import { useState, useTransition } from "react";
import { Wrench, ExternalLink, Trash2, Image as ImageIcon, Link as LinkIcon, Download, RefreshCw } from "lucide-react";
import {
  type BrokenRow,
  type Scope,
  type ScopeCounts,
  scanBroken,
  listBroken,
  deleteBroken,
  clearBrokenScope,
  createRedirectForBroken,
} from "./actions";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "product", label: "Products" },
  { key: "collection", label: "Collections" },
  { key: "article", label: "Articles" },
  { key: "page", label: "Pages" },
];

type Filter = "all" | "photos" | "links";

export function BrokenLinksUI({
  initialScope,
  initialRows,
  counts: initialCounts,
}: {
  initialScope: Scope;
  initialRows: BrokenRow[];
  counts: ScopeCounts;
}) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [counts, setCounts] = useState(initialCounts);
  const [rows, setRows] = useState<BrokenRow[]>(initialRows);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [redirectModal, setRedirectModal] = useState<{
    row: BrokenRow;
    target: string;
  } | null>(null);

  function switchScope(s: Scope) {
    setScope(s);
    setMsg(null);
    start(async () => {
      const r = await listBroken(s);
      setRows(r);
    });
  }

  function runScan() {
    setMsg(null);
    start(async () => {
      const r = await scanBroken(scope);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
      const fresh = await listBroken(scope);
      setRows(fresh);
      setCounts((c) => ({ ...c, [scope]: r.broken }));
    });
  }

  function onDelete(id: string) {
    start(async () => {
      const r = await deleteBroken(id);
      if (r.ok) {
        setRows((prev) => prev.filter((x) => x.id !== id));
        setCounts((c) => ({ ...c, [scope]: Math.max(0, c[scope] - 1) }));
      }
    });
  }

  function onClearAll() {
    if (!confirm(`Clear all broken ${scope} results?`)) return;
    start(async () => {
      const r = await clearBrokenScope(scope);
      if (r.ok) {
        setRows([]);
        setCounts((c) => ({ ...c, [scope]: 0 }));
      }
      setMsg(r.message);
    });
  }

  function exportCsv() {
    window.location.href = `/api/broken-links/export?scope=${scope}`;
  }

  function openRedirect(row: BrokenRow) {
    setRedirectModal({ row, target: "/" });
  }

  function submitRedirect() {
    if (!redirectModal) return;
    const { row, target } = redirectModal;
    start(async () => {
      const r = await createRedirectForBroken({
        id: row.id,
        fromPath: row.targetUrl,
        toPath: target,
      });
      if (r.ok) {
        setRows((prev) => prev.filter((x) => x.id !== row.id));
        setCounts((c) => ({ ...c, [scope]: Math.max(0, c[scope] - 1) }));
        setRedirectModal(null);
        setMsg("✅ " + r.message);
      } else {
        setMsg("❌ " + r.message);
      }
    });
  }

  const filtered = rows.filter((r) => {
    if (filter === "photos") return r.kind === "image";
    if (filter === "links") return r.kind === "link";
    return true;
  });

  return (
    <div className="max-w-5xl space-y-4">
      {/* Tab strip */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="flex items-center justify-center gap-6 px-5 py-3 border-b border-slate-100">
          {SCOPES.map((s) => {
            const isActive = s.key === scope;
            const dot = counts[s.key] > 0 ? "bg-red-500" : "bg-emerald-500";
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => switchScope(s.key)}
                className={`flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {s.label}
                <span className={`w-2 h-2 rounded-full ${dot}`} />
              </button>
            );
          })}
        </div>

        <div className="p-5 space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
            Scans every {scope} <code>body_html</code> for &lt;a&gt; and
            &lt;img&gt; references and HEAD-checks each one. Anything that
            returns non-2xx (or fails) shows up here. Externals like Cloudflare
            sometimes return 403 to HEAD even though they&apos;re fine — we
            retry those with GET, but if you see a false positive flag it.
          </div>

          <button
            type="button"
            onClick={runScan}
            disabled={pending}
            className="w-full px-4 py-3 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Scanning…" : `Scan ${SCOPES.find((s) => s.key === scope)?.label.toLowerCase()}`}
          </button>
          {msg && (
            <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
              {msg}
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Results ({filtered.length})
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="px-2 py-1 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 inline-flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> CSV
            </button>
            <button
              type="button"
              onClick={onClearAll}
              disabled={pending || rows.length === 0}
              className="px-2 py-1 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-60"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-2">
          {(["all", "photos", "links"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-xs uppercase font-semibold ${
                filter === f
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {rows.length === 0
              ? "No broken references found. Run a scan to check."
              : "No results in this filter."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 w-8 text-xs text-slate-400 tabular-nums">
                    {i + 1}
                  </td>
                  <td className="px-2 py-2 w-6">
                    {r.kind === "image" ? (
                      <ImageIcon className="w-4 h-4 text-slate-400" />
                    ) : (
                      <LinkIcon className="w-4 h-4 text-slate-400" />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <a
                      href={r.targetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-600 hover:underline text-xs font-mono break-all"
                    >
                      {r.targetUrl}
                    </a>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {r.sourceTitle ?? r.sourceUrl}{" "}
                      <span className="text-slate-400">
                        — status {r.status || "fail"}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openRedirect(r)}
                        title="Create redirect"
                        className="p-1.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        <Wrench className="w-4 h-4" />
                      </button>
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open source page"
                        className="p-1.5 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        title="Delete"
                        className="p-1.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {redirectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
            <div className="px-5 py-3 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">
                Create redirect
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  From (broken URL)
                </label>
                <code className="block text-xs font-mono px-2 py-1.5 rounded bg-slate-100 break-all">
                  {redirectModal.row.targetUrl}
                </code>
                <p className="text-[10px] text-slate-500 mt-1">
                  Only the path portion will be used — Shopify URL redirects
                  apply to your store domain.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  To
                </label>
                <input
                  value={redirectModal.target}
                  onChange={(e) =>
                    setRedirectModal({ ...redirectModal, target: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-mono"
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRedirectModal(null)}
                className="px-3 py-1.5 rounded text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRedirect}
                disabled={pending}
                className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-60"
              >
                Create redirect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

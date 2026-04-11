"use client";

import { useState, useTransition } from "react";
import { Trash2, Replace, Search, Copy, Check, Download } from "lucide-react";
import {
  type NotFoundRow,
  deleteNotFound,
  clearAllResolved,
  createRedirectFor404,
  findSimilarResource,
  setRedirect404ToHome,
} from "./actions";

function buildSnippet(redirectToHome: boolean): string {
  const redirectLine = redirectToHome
    ? "\n    setTimeout(function(){ window.location.replace('/'); }, 50);"
    : "";
  return `{%- if template contains '404' -%}
<script>
(function(){
  try {
    var u = encodeURIComponent(window.location.pathname + window.location.search);
    var r = encodeURIComponent(document.referrer || '');
    new Image().src = 'APP_URL/api/log-404?u=' + u + '&r=' + r + '&t=' + Date.now();${redirectLine}
  } catch(e) {}
})();
</script>
{%- endif -%}`;
}

export function NotFoundManager({
  initial,
  redirectToHome: initialRedirect,
}: {
  initial: NotFoundRow[];
  redirectToHome: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [redirectToHome, setRedirectToHomeState] = useState(initialRedirect);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [redirectModal, setRedirectModal] = useState<{
    row: NotFoundRow;
    target: string;
    suggestions: { title: string; url: string }[];
  } | null>(null);

  const snippet = buildSnippet(redirectToHome);

  function copySnippet() {
    navigator.clipboard.writeText(
      snippet.replace("APP_URL", window.location.origin),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function toggleRedirect() {
    const next = !redirectToHome;
    setRedirectToHomeState(next);
    start(async () => {
      const r = await setRedirect404ToHome(next);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message + " — re-copy the snippet and re-paste it into theme.liquid");
    });
  }

  function onDelete(id: string) {
    start(async () => {
      const r = await deleteNotFound(id);
      if (r.ok) setRows((prev) => prev.filter((x) => x.id !== id));
      else setMsg("❌ " + r.message);
    });
  }

  function onClearResolved() {
    if (!confirm("Delete all rows that have been marked resolved?")) return;
    start(async () => {
      const r = await clearAllResolved();
      setMsg(r.message);
    });
  }

  function openRedirect(row: NotFoundRow) {
    setRedirectModal({ row, target: "/", suggestions: [] });
    start(async () => {
      const r = await findSimilarResource(row.url);
      if (r.ok && r.suggestions.length > 0) {
        setRedirectModal((prev) =>
          prev ? { ...prev, target: r.suggestions[0].url, suggestions: r.suggestions } : prev,
        );
      }
    });
  }

  function submitRedirect() {
    if (!redirectModal) return;
    const { row, target } = redirectModal;
    start(async () => {
      const r = await createRedirectFor404({
        id: row.id,
        fromPath: row.url,
        toPath: target,
      });
      if (r.ok) {
        setRows((prev) => prev.filter((x) => x.id !== row.id));
        setRedirectModal(null);
        setMsg("✅ " + r.message);
      } else {
        setMsg("❌ " + r.message);
      }
    });
  }

  function exportCsv() {
    window.location.href = "/api/log-404/export";
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Snippet card */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Tracking snippet
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <span>Redirect 404s to homepage</span>
            <button
              type="button"
              role="switch"
              aria-checked={redirectToHome}
              onClick={toggleRedirect}
              disabled={pending}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                redirectToHome ? "bg-indigo-600" : "bg-slate-300"
              } disabled:opacity-60`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  redirectToHome ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">
            Paste this just before <code>&lt;/body&gt;</code> in{" "}
            <code className="text-xs font-mono px-1 py-0.5 bg-slate-100 rounded">
              theme.liquid
            </code>
            . It only fires on 404 templates and pings this app with the
            failed URL.
            {redirectToHome && (
              <>
                {" "}
                <strong>Redirect mode is on</strong> — visitors will be sent to
                the homepage right after the 404 is logged.
              </>
            )}
          </p>
          <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded font-mono overflow-x-auto whitespace-pre">
            {snippet.replace(
              "APP_URL",
              typeof window !== "undefined" ? window.location.origin : "https://your-app.app",
            )}
          </pre>
          <button
            type="button"
            onClick={copySnippet}
            className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs hover:bg-slate-800 inline-flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy snippet"}
          </button>
        </div>
      </div>

      {/* Captured list */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Captured 404s ({rows.length})
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
              onClick={onClearResolved}
              disabled={pending}
              className="px-2 py-1 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-60"
            >
              Clear resolved
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No 404s captured yet. Once the snippet is in your theme, hits will
            appear here.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">URL</th>
                <th className="text-right px-4 py-2 w-20">Hits</th>
                <th className="text-left px-4 py-2 w-40">Last seen</th>
                <th className="text-right px-4 py-2 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs break-all">
                    {r.url}
                    {r.referrer && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        from: {r.referrer}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.count}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {new Date(r.lastSeen).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openRedirect(r)}
                        disabled={pending}
                        title="Create redirect"
                        className="p-1.5 rounded hover:bg-emerald-50 text-emerald-700"
                      >
                        <Replace className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            `https://www.google.com/search?q=${encodeURIComponent(r.url)}`,
                            "_blank",
                          )
                        }
                        title="Search Google"
                        className="p-1.5 rounded hover:bg-sky-50 text-sky-700"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(r.id)}
                        disabled={pending}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-red-50 text-red-700"
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

      {msg && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
          {msg}
        </div>
      )}

      {/* Redirect modal */}
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
                  From
                </label>
                <code className="block text-xs font-mono px-2 py-1.5 rounded bg-slate-100 break-all">
                  {redirectModal.row.url}
                </code>
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
              {redirectModal.suggestions.length > 0 && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Suggestions</div>
                  <div className="flex flex-wrap gap-1">
                    {redirectModal.suggestions.map((s) => (
                      <button
                        type="button"
                        key={s.url}
                        onClick={() =>
                          setRedirectModal({ ...redirectModal, target: s.url })
                        }
                        className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 hover:bg-emerald-100"
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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

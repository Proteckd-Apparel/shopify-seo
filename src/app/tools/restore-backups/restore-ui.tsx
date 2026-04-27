"use client";

import { useEffect, useState, useTransition } from "react";
import { Undo2, RefreshCcw } from "lucide-react";
import { loadBackups, restoreBackups } from "./actions";
import type {
  BackupRow,
  ListBackupsOptions,
  RestoreManyReport,
} from "@/lib/image-restore";

const SINCE_OPTIONS: Array<{ label: string; hours: number }> = [
  { label: "Last 1 hour", hours: 1 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
  { label: "Last 30 days", hours: 24 * 30 },
  { label: "All time", hours: 0 },
];

const TYPE_OPTIONS: Array<{
  label: string;
  value: NonNullable<ListBackupsOptions["resourceType"]>;
}> = [
  { label: "All types", value: "all" },
  { label: "Products", value: "product" },
  { label: "Articles", value: "article" },
  { label: "Collections", value: "collection" },
  { label: "Theme assets", value: "theme" },
];

function fmtBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function fmtTimeAgo(d: Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export function RestoreBackupsUI() {
  const [pending, start] = useTransition();
  const [rows, setRows] = useState<BackupRow[]>([]);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const [sinceHours, setSinceHours] = useState<number>(24);
  const [resourceType, setResourceType] = useState<
    NonNullable<ListBackupsOptions["resourceType"]>
  >("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<RestoreManyReport | null>(null);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  function refresh() {
    setLoadMsg(null);
    setReport(null);
    setApplyMsg(null);
    start(async () => {
      const r = await loadBackups({ sinceHours, resourceType });
      if (!r.ok || !r.rows) {
        setLoadMsg(r.message ?? "Failed");
        setRows([]);
        return;
      }
      setRows(r.rows);
      setSelected(new Set());
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceHours, resourceType]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function doRestore() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Restore ${ids.length} backup${ids.length === 1 ? "" : "s"}? This rewrites the corresponding image on Shopify back to the original bytes. The current (compressed/upscaled/renamed) version will be replaced.`,
      )
    )
      return;
    setApplyMsg(null);
    setReport(null);
    start(async () => {
      const r = await restoreBackups(ids);
      if (!r.ok || !r.report) {
        setApplyMsg(r.message ?? "Restore failed");
        return;
      }
      setReport(r.report);
      setApplyMsg(
        `Restored ${r.report.restored}${r.report.failed > 0 ? `, failed ${r.report.failed}` : ""}.`,
      );
      refresh();
    });
  }

  const totalBytes = rows.reduce((s, r) => s + r.bytesLen, 0);

  return (
    <div className="max-w-6xl space-y-4">
      <div className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block">
          <div className="text-xs font-medium text-slate-700 mb-1">
            Time range
          </div>
          <select
            value={sinceHours}
            onChange={(e) => setSinceHours(parseInt(e.target.value, 10))}
            disabled={pending}
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
          >
            {SINCE_OPTIONS.map((o) => (
              <option key={o.hours} value={o.hours}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs font-medium text-slate-700 mb-1">
            Resource type
          </div>
          <select
            value={resourceType}
            onChange={(e) =>
              setResourceType(
                e.target.value as NonNullable<
                  ListBackupsOptions["resourceType"]
                >,
              )
            }
            disabled={pending}
            className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="px-3 py-1.5 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <RefreshCcw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {loadMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800">
          {loadMsg}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Backups ({rows.length})
          </div>
          <div className="text-xs text-slate-500">
            {fmtBytes(totalBytes)} total · {selected.size} selected
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No backups in this range.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={
                      selected.size > 0 && selected.size === rows.length
                    }
                    onChange={selectAll}
                    disabled={pending}
                  />
                </th>
                <th className="text-left px-4 py-2 w-24">Type</th>
                <th className="text-left px-4 py-2">Resource</th>
                <th className="text-left px-4 py-2">Filename</th>
                <th className="text-right px-4 py-2 w-24">Size</th>
                <th className="text-right px-4 py-2 w-24">Backed up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={pending}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono">
                      {r.resourceType}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-xs text-slate-800 truncate max-w-xs">
                      {r.resourceTitle || r.resourceId}
                    </div>
                    {r.resourceTitle && (
                      <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                        {r.resourceId}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-700 truncate max-w-xs">
                    {r.filename}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs text-slate-600">
                    {fmtBytes(r.bytesLen)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-slate-500">
                    {fmtTimeAgo(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-600">
            {selected.size === 0
              ? "Select backups to restore."
              : `Ready to restore ${selected.size} backup${selected.size === 1 ? "" : "s"}.`}
          </div>
          <button
            type="button"
            onClick={doRestore}
            disabled={pending || selected.size === 0}
            className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2"
          >
            <Undo2 className="w-4 h-4" />
            {pending ? "Restoring…" : `Restore ${selected.size} backup${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {applyMsg && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
          {applyMsg}
        </div>
      )}
      {report && report.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-xs font-semibold text-red-800 mb-2">Errors</div>
          <ul className="text-xs text-red-700 space-y-1 font-mono">
            {report.errors.map((e, i) => (
              <li key={i}>
                {e.backupId.slice(0, 8)}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

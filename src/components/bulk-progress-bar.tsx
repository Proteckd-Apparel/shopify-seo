"use client";

import { useEffect, useState } from "react";
import type { JobKind } from "@/lib/bulk-job-shared";

type Snapshot = {
  id: string;
  status: string;
  progress: number;
  total: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

// Live progress bar for a bulk server action. Polls the JobRun table every
// second so it picks up newly-started jobs automatically (no `active` prop
// coupling to parent state, which was unreliable with useTransition). Also
// survives page refreshes: if a job is still running when the page reloads,
// the bar reappears as soon as the first poll lands.
export function BulkProgressBar({ kind }: { kind: JobKind }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      // Must use fetch + route handler (not a server action) — Next.js
      // serializes server actions per-client, so polling calls would queue
      // behind the long-running apply action and only run after it finishes.
      let row: Snapshot | null = null;
      try {
        const res = await fetch(`/api/bulk-job?kind=${encodeURIComponent(kind)}`, {
          cache: "no-store",
        });
        if (res.ok) row = (await res.json()) as Snapshot | null;
      } catch {}
      if (cancelled) return;
      setSnap((prev) => {
        // If we've seen a newer row, show it. Otherwise preserve the last
        // terminal snapshot (don't flip back to null when the row is still
        // the most recent one).
        if (!row) return prev;
        if (!prev || row.id !== prev.id) return row;
        // Same job, update fields in place.
        return row;
      });
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [kind]);

  if (!snap) return null;

  const pct = snap.total > 0 ? Math.round((snap.progress / snap.total) * 100) : 0;
  const done = snap.status !== "running";
  const label = done
    ? snap.status === "failed"
      ? `Failed: ${snap.error ?? "unknown error"}`
      : `Done — ${snap.progress}/${snap.total}`
    : `${snap.progress}/${snap.total} (${pct}%)`;

  const barColor =
    snap.status === "failed"
      ? "bg-red-500"
      : done
        ? "bg-emerald-500"
        : "bg-indigo-600";

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 mt-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="text-slate-600 font-medium">Progress</div>
        <div className="font-mono text-slate-700">{label}</div>
      </div>
      <div className="h-2 bg-slate-100 rounded overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

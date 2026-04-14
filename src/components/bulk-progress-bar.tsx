"use client";

import { useEffect, useState } from "react";
import { pollJob } from "./bulk-progress-actions";
import type { JobKind } from "@/lib/bulk-job";

type Snapshot = {
  id: string;
  status: string;
  progress: number;
  total: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

// Shows a live progress bar for a bulk server action. When `active` flips
// true, starts polling getLatestJob(kind) every second until the row's
// finishedAt is set. Then freezes on the final numbers.
export function BulkProgressBar({
  kind,
  active,
}: {
  kind: JobKind;
  active: boolean;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function tick() {
      const row = await pollJob(kind);
      if (cancelled) return;
      setSnap(row);
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [kind, active]);

  if (!snap || !active) return null;

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

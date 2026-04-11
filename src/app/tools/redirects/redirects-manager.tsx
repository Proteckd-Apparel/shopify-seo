"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addRedirectAction, deleteRedirectAction } from "./actions";

type Redirect = { id: string; path: string; target: string };

export function RedirectsManager({ initial }: { initial: Redirect[] }) {
  const [list, setList] = useState(initial);
  const [path, setPath] = useState("");
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");

  function add() {
    if (!path || !target) return;
    setMsg(null);
    start(async () => {
      const r = await addRedirectAction(path, target);
      if (r.ok && r.redirect) {
        setList([r.redirect, ...list]);
        setPath("");
        setTarget("");
      } else {
        setMsg(r.message);
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this redirect?")) return;
    start(async () => {
      const r = await deleteRedirectAction(id);
      if (r.ok) setList(list.filter((x) => x.id !== id));
      else setMsg(r.message);
    });
  }

  const filtered = q
    ? list.filter(
        (r) =>
          r.path.toLowerCase().includes(q.toLowerCase()) ||
          r.target.toLowerCase().includes(q.toLowerCase()),
      )
    : list;

  return (
    <div className="max-w-4xl">
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Add redirect</h3>
        <div className="flex gap-2">
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/old-path"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded font-mono"
          />
          <span className="self-center text-slate-400">→</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="/new-path or https://..."
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded font-mono"
          />
          <button
            type="button"
            onClick={add}
            disabled={pending}
            className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            Add
          </button>
        </div>
        {msg && <div className="text-xs text-red-600 mt-2">{msg}</div>}
      </div>

      <div className="flex gap-2 mb-3 items-center text-sm">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter..."
          className="px-3 py-1.5 border border-slate-200 rounded w-64"
        />
        <span className="text-slate-500">{filtered.length} of {list.length}</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">From</th>
              <th className="text-left px-4 py-2">To</th>
              <th className="text-right px-4 py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-mono text-xs">{r.path}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.target}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => remove(r.id)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  No redirects.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

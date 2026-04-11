"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, X } from "lucide-react";
import { addSkipResource, removeSkip, searchResources } from "./actions";

type SkipRow = {
  id: string;
  resourceId: string | null;
  pattern: string | null;
  type: string;
  resource: {
    id: string;
    title: string | null;
    handle: string | null;
  } | null;
};

const TYPES = [
  { key: "product", label: "Products" },
  { key: "collection", label: "Collections" },
  { key: "article", label: "Articles" },
  { key: "page", label: "Pages" },
] as const;
type ResourceType = (typeof TYPES)[number]["key"];

export function SkipManager({
  initial,
  countsByType,
}: {
  initial: SkipRow[];
  countsByType: Record<string, number>;
}) {
  const [type, setType] = useState<ResourceType>("product");
  const [list, setList] = useState(initial);
  const [pickerOpen, setPickerOpen] = useState(false);

  const visible = list.filter((s) => s.type === type && s.resourceId);

  function onAdded(row: SkipRow) {
    setList((cur) => [row, ...cur]);
  }

  function onRemoved(id: string) {
    setList((cur) => cur.filter((s) => s.id !== id));
  }

  return (
    <div className="max-w-3xl">
      <div className="flex justify-center gap-1 mb-4">
        {TYPES.map((t) => {
          const count = countsByType[t.key] ?? 0;
          const active = type === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={`relative px-4 py-2 text-sm font-medium rounded ${
                active
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
              {count > 0 && (
                <span
                  className={`ml-2 inline-block w-5 h-5 text-[10px] rounded-full leading-5 ${
                    active ? "bg-white text-indigo-600" : "bg-red-500 text-white"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 mb-4">
        Add items to this list to ignore them entirely during the full
        optimization or any auto-optimize process. You can still optimize an
        item individually from the optimizer pages — Skip only blocks bulk
        runs.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Ignored Items
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        {visible.length === 0 ? (
          <div className="text-center text-sm text-slate-500 py-12">
            No items added yet
          </div>
        ) : (
          <ul>
            {visible.map((s) => (
              <SkipRowItem key={s.id} row={s} onRemoved={onRemoved} />
            ))}
          </ul>
        )}
      </div>

      {pickerOpen && (
        <Picker
          type={type}
          onClose={() => setPickerOpen(false)}
          onAdded={onAdded}
        />
      )}
    </div>
  );
}

function SkipRowItem({
  row,
  onRemoved,
}: {
  row: SkipRow;
  onRemoved: (id: string) => void;
}) {
  const [pending, start] = useTransition();
  function remove() {
    start(async () => {
      const r = await removeSkip(row.id);
      if (r.ok) onRemoved(row.id);
    });
  }
  return (
    <li className="flex items-center justify-between px-4 py-2 border-t border-slate-100 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">
          {row.resource?.title || row.resource?.handle || "—"}
        </div>
        <div className="text-xs text-slate-500 font-mono">
          {row.resource?.handle}
        </div>
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="p-1 text-red-600 hover:bg-red-50 rounded shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}

function Picker({
  type,
  onClose,
  onAdded,
}: {
  type: ResourceType;
  onClose: () => void;
  onAdded: (row: SkipRow) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; title: string; handle: string }>
  >([]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doSearch(value: string) {
    setQ(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    start(async () => {
      setResults(await searchResources(type, value));
    });
  }

  function add(row: { id: string; title: string; handle: string }) {
    setError(null);
    start(async () => {
      const r = await addSkipResource(row.id);
      if (r.ok) {
        onAdded({
          id: crypto.randomUUID(),
          resourceId: row.id,
          pattern: null,
          type,
          resource: { id: row.id, title: row.title, handle: row.handle },
        });
        onClose();
      } else {
        setError(r.message);
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">
            Add {type} to skip list
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <input
            value={q}
            onChange={(e) => doSearch(e.target.value)}
            placeholder={`Search ${type}s by title or handle…`}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          {pending && (
            <div className="text-xs text-slate-400 mt-2">Searching…</div>
          )}
          {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
          {results.length > 0 && (
            <ul className="mt-3 max-h-64 overflow-y-auto border border-slate-100 rounded">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => add(r)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0"
                  >
                    <div className="font-medium text-slate-900 truncate">
                      {r.title || r.handle}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      {r.handle}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

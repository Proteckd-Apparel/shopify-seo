"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { saveTags } from "./actions";

export function TagsEditor({
  productId,
  initialTags,
}: {
  productId: string;
  initialTags: string[];
}) {
  const [tags, setTags] = useState(initialTags);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function add() {
    const v = draft.trim();
    if (!v || tags.includes(v)) {
      setDraft("");
      return;
    }
    const next = [...tags, v];
    setTags(next);
    setDraft("");
    persist(next);
  }

  function remove(t: string) {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    persist(next);
  }

  function persist(next: string[]) {
    setMsg(null);
    start(async () => {
      const r = await saveTags(productId, next);
      if (!r.ok) setMsg(r.message);
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5 items-center">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full border border-indigo-200"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="hover:bg-indigo-200 rounded-full"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder="add tag..."
          className="px-2 py-0.5 text-xs border border-slate-200 rounded w-28 focus:outline-none focus:border-indigo-500"
        />
      </div>
      {pending && <div className="text-[10px] text-slate-400">Saving…</div>}
      {msg && <div className="text-[10px] text-red-600">{msg}</div>}
    </div>
  );
}

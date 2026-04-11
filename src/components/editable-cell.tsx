"use client";

import { useState, useTransition } from "react";
import { Check, X, Sparkles } from "lucide-react";

type SaveResult = { ok: boolean; message: string };
type GenerateResult = { ok: boolean; value?: string; message?: string };

export function EditableCell({
  initialValue,
  rowId,
  save,
  generate,
  multiline = false,
  optimalMin,
  optimalMax,
  placeholder,
}: {
  initialValue: string;
  rowId: string;
  save: (id: string, value: string) => Promise<SaveResult>;
  generate?: (id: string) => Promise<GenerateResult>;
  multiline?: boolean;
  optimalMin?: number;
  optimalMax?: number;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const [generating, startGenerating] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== savedValue;
  const len = value.length;
  const optimal =
    optimalMin !== undefined &&
    optimalMax !== undefined &&
    len >= optimalMin &&
    len <= optimalMax;
  const lenColor = !len
    ? "text-slate-400"
    : optimal
      ? "text-emerald-600"
      : len < (optimalMin ?? 0)
        ? "text-amber-600"
        : "text-red-600";

  function commit() {
    if (!dirty) return;
    setError(null);
    startTransition(async () => {
      const r = await save(rowId, value);
      if (r.ok) {
        setSavedValue(value);
      } else {
        setError(r.message);
      }
    });
  }

  function revert() {
    setValue(savedValue);
    setError(null);
  }

  function gen() {
    if (!generate) return;
    setError(null);
    startGenerating(async () => {
      const r = await generate(rowId);
      if (r.ok && r.value !== undefined) {
        setValue(r.value);
      } else {
        setError(r.message ?? "AI failed");
      }
    });
  }

  const Tag = multiline ? "textarea" : "input";

  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-start">
        <Tag
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={multiline ? 2 : undefined}
          className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
        />
        <div className="flex gap-1 shrink-0">
          {generate && (
            <button
              type="button"
              onClick={gen}
              disabled={generating || pending}
              className="p-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200 disabled:opacity-50"
              title="Generate with AI"
            >
              <Sparkles className="w-3 h-3" />
            </button>
          )}
          {dirty && (
            <>
              <button
                type="button"
                onClick={commit}
                disabled={pending}
                className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                title="Save"
              >
                <Check className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={revert}
                disabled={pending}
                className="p-1 rounded bg-slate-200 text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                title="Revert"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px]">
        {(optimalMin !== undefined || optimalMax !== undefined) && (
          <span className={lenColor}>
            {len} chars
            {optimalMin !== undefined && optimalMax !== undefined && (
              <> (target {optimalMin}-{optimalMax})</>
            )}
          </span>
        )}
        {pending && <span className="text-slate-400">Saving…</span>}
        {generating && <span className="text-violet-500">Generating…</span>}
        {error && <span className="text-red-600">{error}</span>}
      </div>
    </div>
  );
}

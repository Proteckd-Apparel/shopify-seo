"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import {
  COMMON_SEPARATORS,
  VARIABLE_LABELS,
  type TemplateConfig,
  type TemplateToken,
  type VariableKey,
} from "@/lib/template-engine";

export function TemplateBuilder({
  value,
  onChange,
  showImageVariables = false,
}: {
  value: TemplateConfig;
  onChange: (next: TemplateConfig) => void;
  showImageVariables?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const addToken = (tok: TemplateToken) => {
    onChange({ ...value, tokens: [...value.tokens, tok] });
    setPickerOpen(false);
  };

  const removeAt = (idx: number) => {
    onChange({
      ...value,
      tokens: value.tokens.filter((_, i) => i !== idx),
    });
  };

  const variables = (Object.keys(VARIABLE_LABELS) as VariableKey[]).filter(
    (k) =>
      showImageVariables ||
      (k !== "variant_title" && k !== "image_position"),
  );

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
        Template
      </div>
      <div className="p-5 space-y-4">
        {/* Token chips */}
        <div className="flex flex-wrap gap-1.5 items-center min-h-[2rem]">
          {value.tokens.length === 0 && (
            <span className="text-xs text-slate-400">
              Empty template — click Add to start.
            </span>
          )}
          {value.tokens.map((t, i) => (
            <Chip
              key={i}
              token={t}
              onRemove={() => removeAt(i)}
            />
          ))}
          <button
            type="button"
            onClick={() => setPickerOpen(!pickerOpen)}
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-slate-300 bg-white hover:bg-slate-50"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {/* Picker */}
        {pickerOpen && (
          <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Variables
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {variables.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addToken({ kind: "var", key: k })}
                  className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                >
                  {VARIABLE_LABELS[k]}
                </button>
              ))}
            </div>
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Separators
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {COMMON_SEPARATORS.map((sep) => (
                <button
                  key={sep}
                  type="button"
                  onClick={() => addToken({ kind: "lit", value: sep })}
                  className="text-xs px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 font-mono"
                >
                  {sep === " " ? "␣" : sep.trim() || sep}
                </button>
              ))}
            </div>
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Custom text
            </div>
            <CustomLiteralInput
              onAdd={(v) => addToken({ kind: "lit", value: v })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({
  token,
  onRemove,
}: {
  token: TemplateToken;
  onRemove: () => void;
}) {
  const isVar = token.kind === "var";
  const label = isVar
    ? VARIABLE_LABELS[token.key]
    : token.value === " "
      ? "␣"
      : token.value;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded ${
        isVar
          ? "bg-emerald-100 text-emerald-800"
          : "bg-slate-200 text-slate-700"
      }`}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:opacity-70"
        aria-label="Remove"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function CustomLiteralInput({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (v) {
              onAdd(v);
              setV("");
            }
          }
        }}
        placeholder="Type and press Enter"
        className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded"
      />
    </div>
  );
}

export function TemplateSettings({
  value,
  onChange,
  maxCharsHint,
}: {
  value: TemplateConfig;
  onChange: (next: TemplateConfig) => void;
  maxCharsHint?: string;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <label className="block">
        <div className="text-xs font-medium text-slate-700 mb-1">
          Max Characters
        </div>
        <input
          type="number"
          value={value.maxChars}
          onChange={(e) =>
            onChange({ ...value, maxChars: parseInt(e.target.value, 10) || 0 })
          }
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded"
        />
        {maxCharsHint && (
          <div className="text-[10px] text-slate-400 mt-1">{maxCharsHint}</div>
        )}
      </label>
      <label className="block">
        <div className="text-xs font-medium text-slate-700 mb-1">
          Capitalization
        </div>
        <select
          value={value.capitalization}
          onChange={(e) =>
            onChange({
              ...value,
              capitalization: e.target
                .value as TemplateConfig["capitalization"],
            })
          }
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
        >
          <option value="none">Do not change</option>
          <option value="title">Title Case</option>
          <option value="sentence">Sentence case</option>
          <option value="upper">UPPERCASE</option>
          <option value="lower">lowercase</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm pt-5">
        <input
          type="checkbox"
          checked={value.removeDuplicateWords}
          onChange={(e) =>
            onChange({ ...value, removeDuplicateWords: e.target.checked })
          }
        />
        Remove duplicate words
      </label>
    </div>
  );
}

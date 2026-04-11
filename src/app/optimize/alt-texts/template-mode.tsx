"use client";

import { useState, useTransition } from "react";
import {
  bulkApplyAltTemplate,
  previewAltTemplate,
  saveAltTemplate,
  type BulkAltResult,
} from "./template-actions";
import {
  TemplateBuilder,
  TemplateSettings,
} from "@/components/template-builder";
import type { TemplateConfig } from "@/lib/template-engine";
import type { TemplateScopeKey } from "@/lib/optimizer-config";

const TABS: Array<{ key: TemplateScopeKey; label: string }> = [
  { key: "products", label: "Products" },
  { key: "collections", label: "Collections" },
  { key: "articles", label: "Articles" },
];

export function AltTextsTemplateMode({
  initialTemplates,
}: {
  initialTemplates: Record<TemplateScopeKey, TemplateConfig>;
}) {
  const [scope, setScope] = useState<TemplateScopeKey>("products");
  const [templates, setTemplates] =
    useState<Record<TemplateScopeKey, TemplateConfig>>(initialTemplates);
  const [overwrite, setOverwrite] = useState(false);
  const [updateScope, setUpdateScope] = useState<"all" | "published" | "drafts">(
    "published",
  );
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    title: string;
    imageSrc: string;
    currentAlt: string | null;
    newAlt: string;
  } | null>(null);
  const [bulk, setBulk] = useState<BulkAltResult | null>(null);

  const tpl = templates[scope];

  function setTpl(next: TemplateConfig) {
    setTemplates({ ...templates, [scope]: next });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveAltTemplate(scope, tpl);
      setMsg(r.message);
    });
  }

  function runPreview() {
    setMsg(null);
    start(async () => {
      const r = await previewAltTemplate(scope, tpl);
      if (r.ok && r.sample) {
        setPreview({
          title: r.sample.title,
          imageSrc: r.sample.imageSrc,
          currentAlt: r.sample.currentAlt,
          newAlt: r.sample.newAlt,
        });
      } else {
        setMsg(r.message ?? "Preview failed");
      }
    });
  }

  function runBulk() {
    if (
      !confirm(
        `Apply this template to ${overwrite ? "ALL" : "missing"} alt texts in ${scope}?\n\nThis writes to Shopify.`,
      )
    )
      return;
    setBulk(null);
    start(async () => {
      const r = await bulkApplyAltTemplate(scope, tpl, overwrite, updateScope);
      setBulk(r);
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex justify-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setScope(t.key);
              setPreview(null);
              setBulk(null);
            }}
            className={`px-4 py-2 text-sm font-medium rounded ${
              scope === t.key
                ? "bg-indigo-600 text-white"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Updates your image alt texts to improve your SEO. When overwrite is
        active, all existing alt texts will be overwritten according to new
        settings. If overwrite is deactivated, only photos with missing alt
        texts will be updated.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-xs font-medium text-slate-700 mb-1">
                Update Published / Drafts
              </div>
              <select
                value={updateScope}
                onChange={(e) =>
                  setUpdateScope(
                    e.target.value as "all" | "published" | "drafts",
                  )
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="published">Published Only</option>
                <option value="drafts">Drafts Only</option>
                <option value="all">Process All</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm pt-5">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              Overwrite Existing
            </label>
          </div>
          <TemplateSettings
            value={tpl}
            onChange={setTpl}
            maxCharsHint="Hard cap on the rendered output."
          />
        </div>
      </div>

      <TemplateBuilder
        value={tpl}
        onChange={setTpl}
        showImageVariables={scope === "products"}
      />

      {preview && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
            Item Preview — {preview.title}
          </div>
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <div className="text-[10px] uppercase font-semibold text-amber-700">
                  Current alt text
                </div>
                <div className="text-sm text-slate-800">
                  {preview.currentAlt || (
                    <span className="italic text-slate-400">empty</span>
                  )}
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                <div className="text-[10px] uppercase font-semibold text-emerald-700">
                  New alt text
                </div>
                <div className="text-sm text-slate-800">{preview.newAlt}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {preview.newAlt.length} chars
                </div>
              </div>
            </div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${preview.imageSrc}&width=300`}
                alt={preview.newAlt}
                className="w-full rounded border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-2 shadow-lg">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60"
        >
          Save settings
        </button>
        <button
          type="button"
          onClick={runPreview}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Preview on sample
        </button>
        <button
          type="button"
          onClick={runBulk}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : `Update all ${scope}`}
        </button>
        {msg && <span className="text-xs text-slate-600 ml-2">{msg}</span>}
        {bulk && (
          <span
            className={`text-xs ml-2 ${
              bulk.ok ? "text-emerald-700" : "text-amber-700"
            }`}
          >
            {bulk.message}
          </span>
        )}
      </div>
    </div>
  );
}

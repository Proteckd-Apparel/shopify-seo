"use client";

import { useState, useTransition } from "react";
import {
  applyArticleSchemaToAll,
  applySiteWideSchemas,
  saveJsonLdConfig,
} from "./actions";
import type { OtherJsonLdConfig } from "@/lib/json-ld-config";

const TYPES: Array<{ key: keyof OtherJsonLdConfig; label: string; hint: string }> = [
  { key: "website", label: "WebSite", hint: "Site search action for Google" },
  { key: "organization", label: "Organization", hint: "Brand identity / logo" },
  { key: "article", label: "Article", hint: "Blog article schema" },
  { key: "blog", label: "Blog", hint: "Blog index schema" },
  { key: "breadcrumb", label: "Breadcrumb", hint: "Page hierarchy for Google" },
];

export function OtherTab({ initial }: { initial: OtherJsonLdConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function patch(k: keyof OtherJsonLdConfig, v: boolean) {
    setCfg({ ...cfg, [k]: v });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveJsonLdConfig({ other: cfg });
      setMsg(r.message);
    });
  }

  function apply() {
    setMsg(null);
    start(async () => {
      // Save first so the latest toggles are persisted, then write the
      // shop-level metafield that the storefront snippet reads.
      const s = await saveJsonLdConfig({ other: cfg });
      if (!s.ok) {
        setMsg(s.message);
        return;
      }
      const r = await applySiteWideSchemas();
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function applyArticles() {
    if (
      !confirm(
        "Apply Article + Breadcrumb schema to ALL blog articles? Writes a metafield on every article.",
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const r = await applyArticleSchemaToAll();
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Enable or disable various JSON-LD schema types to improve SEO. These
        site-wide schemas (WebSite, Organization, Blog) and per-page schemas
        (Article, Breadcrumb) will be rendered when you add the snippet
        below to your <code className="font-mono bg-amber-100 px-1 rounded">theme.liquid</code>.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Schema types
        </div>
        <ul className="divide-y divide-slate-100">
          {TYPES.map((t) => (
            <li
              key={t.key}
              className="flex items-center justify-between px-5 py-3"
            >
              <div>
                <div className="text-sm font-medium text-slate-900">
                  {t.label}
                </div>
                <div className="text-xs text-slate-500">{t.hint}</div>
              </div>
              <Toggle
                checked={cfg[t.key]}
                onChange={(v) => patch(t.key, v)}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <h3 className="font-semibold text-slate-900 mb-2">
          Theme snippet (one-time install)
        </h3>
        <p className="text-xs text-slate-500 mb-3">
          Add this to your <code className="bg-slate-100 px-1 rounded font-mono">layout/theme.liquid</code>{" "}
          inside the <code className="bg-slate-100 px-1 rounded font-mono">&lt;head&gt;</code> tag. It reads
          the metafield this app writes and the site-wide schemas you enabled
          above.
        </p>
        <pre className="bg-slate-50 border border-slate-100 rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre">
{`{%- comment -%} Shopify SEO: JSON-LD injection {%- endcomment -%}

{%- comment -%} Site-wide (WebSite / Organization / Blog): renders on every page {%- endcomment -%}
{%- if shop.metafields.custom.json_ld_sitewide -%}
  {%- assign sitewide = shop.metafields.custom.json_ld_sitewide.value -%}
  {%- for s in sitewide -%}
    <script type="application/ld+json">{{ s | json }}</script>
  {%- endfor -%}
{%- endif -%}

{%- comment -%} Per-page schemas (Product / Collection / Article).
    Each metafield value can be either a single object or an array of nodes.
    Loop emits one script per node so Google parses them as distinct entities. {%- endcomment -%}
{%- if request.page_type == 'product' and product.metafields.custom.json_ld -%}
  {%- assign jl = product.metafields.custom.json_ld.value -%}
  {%- if jl[0] -%}
    {%- for node in jl -%}
      <script type="application/ld+json">{{ node | json }}</script>
    {%- endfor -%}
  {%- else -%}
    <script type="application/ld+json">{{ jl | json }}</script>
  {%- endif -%}
{%- endif -%}
{%- if request.page_type == 'collection' and collection.metafields.custom.json_ld -%}
  {%- assign jl = collection.metafields.custom.json_ld.value -%}
  {%- if jl[0] -%}
    {%- for node in jl -%}
      <script type="application/ld+json">{{ node | json }}</script>
    {%- endfor -%}
  {%- else -%}
    <script type="application/ld+json">{{ jl | json }}</script>
  {%- endif -%}
{%- endif -%}
{%- if request.page_type == 'article' and article.metafields.custom.json_ld -%}
  {%- assign jl = article.metafields.custom.json_ld.value -%}
  {%- if jl[0] -%}
    {%- for node in jl -%}
      <script type="application/ld+json">{{ node | json }}</script>
    {%- endfor -%}
  {%- else -%}
    <script type="application/ld+json">{{ jl | json }}</script>
  {%- endif -%}
{%- endif -%}`}
        </pre>
      </div>

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
          onClick={apply}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : "Save & Apply site-wide"}
        </button>
        <button
          type="button"
          onClick={applyArticles}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-white border border-indigo-300 text-indigo-700 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-60"
        >
          Update all articles
        </button>
        {msg && (
          <span
            className={`text-xs ml-2 ${
              msg.startsWith("✅") ? "text-emerald-700" : "text-slate-600"
            }`}
          >
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import type { OptimizerConfig, ResourceConfig } from "@/lib/optimizer-config";
import { saveConfig, setAllOverwrites } from "./actions";

type ResourceKey = "products" | "collections" | "articles" | "pages";

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  products: "Products",
  collections: "Collections",
  articles: "Articles",
  pages: "Pages",
};

const RESOURCE_FIELDS: Array<{
  key: keyof ResourceConfig;
  label: string;
  overwriteKey?: keyof ResourceConfig;
}> = [
  { key: "metaTitles", label: "Meta Titles", overwriteKey: "metaTitlesOverwrite" },
  {
    key: "metaDescriptions",
    label: "Meta Descriptions",
    overwriteKey: "metaDescriptionsOverwrite",
  },
  { key: "altTexts", label: "Alt Texts", overwriteKey: "altTextsOverwrite" },
  { key: "htmlText", label: "HTML Text (description)", overwriteKey: "htmlTextOverwrite" },
  { key: "titles", label: "Titles (H1)" },
  { key: "urls", label: "Rewrite URLs" },
  { key: "jsonLd", label: "JSON-LD" },
  { key: "jsonLdFaq", label: "JSON-LD FAQ" },
  { key: "photoFilenames", label: "Photo Filenames" },
  { key: "resizePhotos", label: "Resize Photos" },
  { key: "compressPhotos", label: "Compress Photos" },
  { key: "tags", label: "Product Tags" },
  { key: "translations", label: "Translations" },
];

export function SettingsForm({ initial }: { initial: OptimizerConfig }) {
  const [cfg, setCfg] = useState<OptimizerConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function patchResource(key: ResourceKey, patch: Partial<ResourceConfig>) {
    setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  }

  function save() {
    setMsg(null);
    startTransition(async () => {
      const r = await saveConfig(cfg);
      setMsg(r.message);
    });
  }

  // Derived state: ON if ANY per-field *Overwrite flag is true across any
  // resource type. The toggle reflects "is overwrite happening anywhere?"
  // so a single ON light warns you that auto-runs may rewrite curated
  // copy, even if only one section/field has overwrite enabled.
  const anyOverwriteOn =
    cfg.products.metaTitlesOverwrite ||
    cfg.products.metaDescriptionsOverwrite ||
    cfg.products.altTextsOverwrite ||
    cfg.products.htmlTextOverwrite ||
    cfg.collections.metaTitlesOverwrite ||
    cfg.collections.metaDescriptionsOverwrite ||
    cfg.collections.altTextsOverwrite ||
    cfg.collections.htmlTextOverwrite ||
    cfg.articles.metaTitlesOverwrite ||
    cfg.articles.metaDescriptionsOverwrite ||
    cfg.articles.altTextsOverwrite ||
    cfg.articles.htmlTextOverwrite ||
    cfg.pages.metaTitlesOverwrite ||
    cfg.pages.metaDescriptionsOverwrite ||
    cfg.pages.altTextsOverwrite ||
    cfg.pages.htmlTextOverwrite;

  function toggleOverwriteAll(next: boolean) {
    if (
      next &&
      !confirm(
        "Turn ON overwrite for ALL fields across products, collections, articles, and pages?\n\nWarning: auto-optimize will regenerate every meta title, meta description, alt text, and body HTML on every run — including ones you've already curated.\n\nUsually you only want this for a one-time refresh after improving your AI rules / brand voice. For ongoing automation, leave this OFF.",
      )
    )
      return;
    if (
      !next &&
      !confirm(
        "Turn OFF every OVERWRITE toggle?\n\nAuto-optimize will then only fill empty fields. Existing curated copy stays untouched. This is the recommended setup for ongoing automation.",
      )
    )
      return;
    setMsg(null);
    startTransition(async () => {
      const r = await setAllOverwrites(next);
      setMsg(r.message);
      if (r.ok) {
        setCfg((c) => ({
          ...c,
          products: {
            ...c.products,
            metaTitlesOverwrite: next,
            metaDescriptionsOverwrite: next,
            altTextsOverwrite: next,
            htmlTextOverwrite: next,
          },
          collections: {
            ...c.collections,
            metaTitlesOverwrite: next,
            metaDescriptionsOverwrite: next,
            altTextsOverwrite: next,
            htmlTextOverwrite: next,
          },
          articles: {
            ...c.articles,
            metaTitlesOverwrite: next,
            metaDescriptionsOverwrite: next,
            altTextsOverwrite: next,
            htmlTextOverwrite: next,
          },
          pages: {
            ...c.pages,
            metaTitlesOverwrite: next,
            metaDescriptionsOverwrite: next,
            altTextsOverwrite: next,
            htmlTextOverwrite: next,
          },
        }));
      }
    });
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Master switch */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-900">
            Auto-optimize master switch
          </div>
          <div className="text-xs text-slate-600 mt-1">
            When ON, the optimizer will run automatically whenever a scan
            detects changed or new resources. (Background scheduler comes in
            a later phase — for now this just gates &quot;Optimize All&quot;.)
          </div>
        </div>
        <Toggle
          checked={cfg.masterAutoOptimize}
          onChange={(v) => setCfg((c) => ({ ...c, masterAutoOptimize: v }))}
        />
      </div>

      {/* Master overwrite toggle. Reflects whether ANY per-field
          overwrite flag is on across all four resource types — so a
          single ON light tells you auto-runs may rewrite curated copy.
          Click to flip every flag at once. Per-field overwrite pills
          below stay editable for advanced control. */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            Overwrite existing values
            <span
              className={`text-[10px] font-normal px-2 py-0.5 rounded ${
                anyOverwriteOn
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {anyOverwriteOn ? "ON — will regenerate curated copy" : "OFF — fill missing only"}
            </span>
          </div>
          <div className="text-xs text-slate-600 mt-1">
            ON = auto-optimize regenerates every meta title, description,
            alt text, and body across all resource types on every run.
            OFF = only empty fields get filled, your curated copy is never
            touched. Recommended OFF for ongoing automation. Individual
            OVERWRITE pills below stay editable if you need finer control.
          </div>
        </div>
        <Toggle
          checked={anyOverwriteOn}
          onChange={toggleOverwriteAll}
          disabled={pending}
        />
      </div>

      {/* AI brand voice */}
      <Card title="AI Rules / Brand Voice">
        <textarea
          value={cfg.notes}
          onChange={(e) => setCfg((c) => ({ ...c, notes: e.target.value }))}
          rows={5}
          placeholder="E.g. Friendly tone. Always mention free shipping. Never use the word 'cheap'."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded font-mono"
        />
      </Card>

      {/* Per-resource sections */}
      {(Object.keys(RESOURCE_LABELS) as ResourceKey[]).map((rk) => {
        const rc = cfg[rk];
        return (
          <Card
            key={rk}
            title={`Settings: ${RESOURCE_LABELS[rk].toUpperCase()}`}
            right={
              <Toggle
                checked={rc.enabled}
                onChange={(v) => patchResource(rk, { enabled: v })}
              />
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Field label="Auto-Optimize">
                <Toggle
                  checked={rc.enabled}
                  onChange={(v) => patchResource(rk, { enabled: v })}
                />
              </Field>
              <Field label="Update Published / Drafts">
                <select
                  value={rc.scope}
                  onChange={(e) =>
                    patchResource(rk, {
                      scope: e.target.value as ResourceConfig["scope"],
                    })
                  }
                  className="px-3 py-1 text-sm border border-slate-200 rounded bg-white"
                >
                  <option value="published">Published Only</option>
                  <option value="drafts">Drafts Only</option>
                  <option value="all">Process All</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
              {RESOURCE_FIELDS.map((f) => (
                <ToggleRow
                  key={String(f.key)}
                  label={f.label}
                  checked={!!rc[f.key]}
                  onChange={(v) =>
                    patchResource(rk, { [f.key]: v } as Partial<ResourceConfig>)
                  }
                  overwrite={
                    f.overwriteKey
                      ? {
                          checked: !!rc[f.overwriteKey],
                          onChange: (v) =>
                            patchResource(rk, {
                              [f.overwriteKey!]: v,
                            } as Partial<ResourceConfig>),
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </Card>
        );
      })}

      {/* Theme */}
      <Card
        title="Settings: Theme Images"
        right={
          <Toggle
            checked={cfg.themeImages.enabled}
            onChange={(v) =>
              setCfg((c) => ({
                ...c,
                themeImages: { ...c.themeImages, enabled: v },
              }))
            }
          />
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ToggleRow
            label="Resize"
            checked={cfg.themeImages.resize}
            onChange={(v) =>
              setCfg((c) => ({
                ...c,
                themeImages: { ...c.themeImages, resize: v },
              }))
            }
          />
          <ToggleRow
            label="Compress"
            checked={cfg.themeImages.compress}
            onChange={(v) =>
              setCfg((c) => ({
                ...c,
                themeImages: { ...c.themeImages, compress: v },
              }))
            }
          />
          <ToggleRow
            label="Alt Text"
            checked={cfg.themeImages.alt}
            onChange={(v) =>
              setCfg((c) => ({
                ...c,
                themeImages: { ...c.themeImages, alt: v },
              }))
            }
          />
        </div>
      </Card>

      {/* Skip rules */}
      <Card title="Skip Rules">
        <Field
          label="Skip page paths (one per line, supports * wildcard)"
          hint="e.g. /pages/legal/* — these will never be optimized"
        >
          <textarea
            value={cfg.skipPagesPatterns.join("\n")}
            onChange={(e) =>
              setCfg((c) => ({
                ...c,
                skipPagesPatterns: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded font-mono"
          />
        </Field>
        <Field label="Skip products with these tags (comma-separated)">
          <input
            value={cfg.skipProductsWithTags.join(", ")}
            onChange={(e) =>
              setCfg((c) => ({
                ...c,
                skipProductsWithTags: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded"
          />
        </Field>
        <Field label="Skip products by vendor (comma-separated)">
          <input
            value={cfg.skipProductsByVendor.join(", ")}
            onChange={(e) =>
              setCfg((c) => ({
                ...c,
                skipProductsByVendor: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              }))
            }
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded"
          />
        </Field>
      </Card>

      {/* Behavior */}
      <Card title="Behavior">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ToggleRow
            label="Do not re-optimize photos"
            checked={cfg.doNotReoptimizePhotos}
            onChange={(v) =>
              setCfg((c) => ({ ...c, doNotReoptimizePhotos: v }))
            }
          />
          <ToggleRow
            label="Do not re-optimize filenames"
            checked={cfg.doNotReoptimizeFilenames}
            onChange={(v) =>
              setCfg((c) => ({ ...c, doNotReoptimizeFilenames: v }))
            }
          />
          <ToggleRow
            label="Upscale photos"
            checked={cfg.upscalePhotos}
            onChange={(v) => setCfg((c) => ({ ...c, upscalePhotos: v }))}
          />
        </div>
      </Card>

      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between shadow-lg">
        <div className="text-sm text-slate-500">
          {msg && (
            <span
              className={
                msg.toLowerCase().includes("saved")
                  ? "text-emerald-600"
                  : "text-red-600"
              }
            >
              {msg}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">
          {title}
        </h3>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-3">
      <div className="text-xs font-medium text-slate-700 mb-1">{label}</div>
      {children}
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-slate-300"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  overwrite,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  overwrite?: { checked: boolean; onChange: (v: boolean) => void };
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <div className="flex items-center gap-2">
        {checked && overwrite && (
          <button
            type="button"
            onClick={() => overwrite.onChange(!overwrite.checked)}
            className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
              overwrite.checked
                ? "bg-red-100 text-red-700"
                : "bg-slate-100 text-slate-500"
            }`}
            title="Overwrite existing values when running"
          >
            Overwrite
          </button>
        )}
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

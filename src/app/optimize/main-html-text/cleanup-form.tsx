"use client";

import { useState, useTransition } from "react";
import {
  applyCleanupToAll,
  applyCleanupToOne,
  previewCleanup,
  saveCleanupConfig,
  searchResourcesForPicker,
  type ApplyResult,
  type CleanupPreview,
} from "./actions";
import { revertLastBulkRun } from "./revert-actions";
import type { HtmlCleanupConfig } from "@/lib/optimizer-config";

const TABS = [
  { key: "products", label: "Products", singular: "product" },
  { key: "collections", label: "Collections", singular: "collection" },
  { key: "articles", label: "Articles", singular: "article" },
  { key: "pages", label: "Pages", singular: "page" },
] as const;
type Scope = (typeof TABS)[number]["key"];

export function CleanupForm({
  initial,
}: {
  initial: Record<Scope, HtmlCleanupConfig>;
}) {
  const [scope, setScope] = useState<Scope>("products");
  const [configs, setConfigs] =
    useState<Record<Scope, HtmlCleanupConfig>>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [bulk, setBulk] = useState<ApplyResult | null>(null);
  const [pickerOpen, setPickerOpen] = useState<null | "preview" | "apply">(
    null,
  );

  const cfg = configs[scope];

  function patch(p: Partial<HtmlCleanupConfig>) {
    setConfigs({ ...configs, [scope]: { ...cfg, ...p } });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveCleanupConfig(scope, cfg);
      setMsg(r.message);
    });
  }

  function runPreview(id?: string) {
    setMsg(null);
    setPreview(null);
    start(async () => {
      const r = await previewCleanup(scope, id);
      setPreview(r);
      if (!r.ok) setMsg("❌ " + (r.message ?? "Preview failed"));
    });
  }

  function applyOne(id: string) {
    setMsg(null);
    start(async () => {
      const r = await applyCleanupToOne(scope, id);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function applyAll() {
    const aiWarning = cfg.aiRewrite
      ? "\n\n⚠️ AI rewrite is ON. This will use Claude credits and rewrite visible product text."
      : "";
    if (
      !confirm(
        `Apply HTML cleanup to ALL ${scope}? This writes to Shopify.${aiWarning}`,
      )
    )
      return;
    setMsg(null);
    setBulk(null);
    start(async () => {
      const r = await applyCleanupToAll(scope);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function dryRunAll() {
    setMsg(null);
    setBulk(null);
    start(async () => {
      const r = await applyCleanupToAll(scope, true);
      setBulk(r);
    });
  }

  function revert() {
    if (
      !confirm(
        `Revert ALL bodyHtml changes made to ${scope} in the last 60 minutes?\n\nThis restores the previous body for every resource the optimizer touched recently. Only run this if a bulk run made things worse.`,
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const r = await revertLastBulkRun(scope, 60);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
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
              setMsg(null);
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
        Cleans up the body HTML of your {scope}. By default this only does
        deterministic, reversible cleanups (alt text, lazyload, link titles,
        empty &lt;p&gt; removal). Visible text is <strong>not changed</strong>{" "}
        unless you explicitly enable AI rewrite below.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Update Published / Drafts">
              <select
                value={cfg.scope}
                onChange={(e) =>
                  patch({
                    scope: e.target.value as HtmlCleanupConfig["scope"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="published">Published Only</option>
                <option value="drafts">Drafts Only</option>
                <option value="all">Process All</option>
              </select>
            </Field>
            <ToggleRow
              label="Activate"
              checked={cfg.enabled}
              onChange={(v) => patch({ enabled: v })}
            />
          </div>

          <hr className="border-slate-100" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ToggleRow
              label="Add alt text to images (if missing)"
              checked={cfg.addAltTextsIfMissing}
              onChange={(v) => patch({ addAltTextsIfMissing: v })}
            />
            <ToggleRow
              label="Overwrite existing alts"
              checked={cfg.overwriteExistingAlts}
              onChange={(v) => patch({ overwriteExistingAlts: v })}
            />
            <ToggleRow
              label="Add loading=lazy to images"
              checked={cfg.addLazyloadToImages}
              onChange={(v) => patch({ addLazyloadToImages: v })}
            />
            <ToggleRow
              label="Add title attribute to links"
              checked={cfg.addTitlesToLinks}
              onChange={(v) => patch({ addTitlesToLinks: v })}
            />
            <ToggleRow
              label="Add aria-label to links"
              checked={cfg.addAriaLabelsToLinks}
              onChange={(v) => patch({ addAriaLabelsToLinks: v })}
            />
            <ToggleRow
              label="Remove all external links"
              checked={cfg.removeAllExternalLinks}
              onChange={(v) => patch({ removeAllExternalLinks: v })}
            />
            <ToggleRow
              label="Remove empty <p> tags"
              checked={cfg.removeEmptyPTags}
              onChange={(v) => patch({ removeEmptyPTags: v })}
            />
          </div>

          <hr className="border-slate-100" />

          <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
            <ToggleRow
              label="🪄 AI rewrite mode (Claude rewrites visible text)"
              checked={cfg.aiRewrite}
              onChange={(v) => patch({ aiRewrite: v })}
            />
            {cfg.aiRewrite && (
              <div className="mt-3">
                <div className="text-xs font-medium text-violet-900 mb-1">
                  Extra instructions for Claude
                </div>
                <textarea
                  value={cfg.aiInstructions}
                  onChange={(e) =>
                    patch({ aiInstructions: e.target.value })
                  }
                  rows={3}
                  placeholder="E.g. Use H2 for the first heading. Add a CTA at the end."
                  className="w-full px-3 py-2 text-xs border border-violet-200 rounded"
                />
                <div className="text-[11px] text-violet-700 mt-2">
                  ⚠️ AI mode rewrites visible product text. Always test on one
                  product first. Bulk runs are capped at 100 per click.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {preview && preview.ok && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-slate-500">
                Preview — {preview.title}
              </div>
              {preview.changes && (
                <div className="text-[11px] text-slate-500 mt-0.5">
                  alts +{preview.changes.altsAdded} · lazy +
                  {preview.changes.lazyloadAdded} · link titles +
                  {preview.changes.linkTitlesAdded} · aria +
                  {preview.changes.linkAriaLabelsAdded} · external stripped{" "}
                  {preview.changes.externalLinksStripped} · empty &lt;p&gt; -
                  {preview.changes.emptyParagraphsRemoved}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => preview.resourceId && applyOne(preview.resourceId)}
              disabled={pending}
              className="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              Apply this change
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
            <div>
              <div className="px-3 py-2 bg-red-50 text-xs uppercase font-semibold text-red-700">
                Before
              </div>
              <pre className="p-3 text-[10px] font-mono overflow-x-auto max-h-96 whitespace-pre-wrap">
                {preview.before}
              </pre>
            </div>
            <div>
              <div className="px-3 py-2 bg-emerald-50 text-xs uppercase font-semibold text-emerald-700">
                After
              </div>
              <pre className="p-3 text-[10px] font-mono overflow-x-auto max-h-96 whitespace-pre-wrap">
                {preview.after}
              </pre>
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
          onClick={() => runPreview()}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Preview on first
        </button>
        <button
          type="button"
          onClick={() => setPickerOpen("preview")}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
        >
          Preview specific
        </button>
        <button
          type="button"
          onClick={dryRunAll}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
        >
          Preview all
        </button>
        <button
          type="button"
          onClick={applyAll}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : `Update all ${scope}`}
        </button>
        <button
          type="button"
          onClick={revert}
          disabled={pending}
          className="ml-auto px-3 py-1.5 rounded bg-white border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 disabled:opacity-60"
          title="Revert any bodyHtml changes made to this scope in the last 60 minutes"
        >
          ↶ Revert last 60 min
        </button>
        {msg && <span className="text-xs text-slate-600 ml-2">{msg}</span>}
      </div>

      {bulk && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 text-xs">
          <div className={bulk.ok ? "text-emerald-700" : "text-amber-700"}>
            {bulk.message}
          </div>
          {bulk.preview && bulk.preview.length > 0 && (
            <div className="mt-3 max-h-96 overflow-y-auto border border-slate-200 rounded">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-1.5">Resource</th>
                    <th className="text-right px-3 py-1.5 w-20">Changes</th>
                    <th className="text-left px-3 py-1.5">Sample</th>
                  </tr>
                </thead>
                <tbody>
                  {bulk.preview.slice(0, 100).map((p) => (
                    <tr key={p.resourceId} className="border-t border-slate-100">
                      <td className="px-3 py-1 text-slate-700 truncate max-w-xs">
                        {p.title || p.handle || p.resourceId}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums text-slate-600">
                        {p.changeCount}
                      </td>
                      <td className="px-3 py-1 text-slate-500 truncate max-w-md">
                        {p.changeSummary.join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {bulk.preview.length > 100 && (
                <div className="px-3 py-1.5 text-slate-500 border-t border-slate-100">
                  + {bulk.preview.length - 100} more (showing first 100)
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {pickerOpen && (
        <Picker
          type={TABS.find((t) => t.key === scope)!.singular}
          onClose={() => setPickerOpen(null)}
          onPick={(id) => {
            setPickerOpen(null);
            runPreview(id);
          }}
        />
      )}
    </div>
  );
}

function Picker({
  type,
  onClose,
  onPick,
}: {
  type: string;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    Array<{ id: string; title: string; handle: string }>
  >([]);
  const [pending, start] = useTransition();
  function doSearch(value: string) {
    setQ(value);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    start(async () => setResults(await searchResourcesForPicker(type, value)));
  }
  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Pick a {type}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <input
            value={q}
            onChange={(e) => doSearch(e.target.value)}
            placeholder="Search by title or handle…"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:border-indigo-500"
            autoFocus
          />
          {pending && (
            <div className="text-xs text-slate-400 mt-2">Searching…</div>
          )}
          {results.length > 0 && (
            <ul className="mt-3 max-h-64 overflow-y-auto border border-slate-100 rounded">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onPick(r.id)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0"
                  >
                    <div className="font-medium text-slate-900 truncate">
                      {r.title || r.handle}
                    </div>
                    <div className="text-xs text-slate-500 font-mono truncate">
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-700 mb-1">{label}</div>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-700">{label}</span>
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
    </div>
  );
}

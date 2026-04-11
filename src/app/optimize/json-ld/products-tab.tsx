"use client";

import { useState, useTransition } from "react";
import {
  applyProductSchemaToAll,
  applyProductSchemaToOne,
  debugJudgeMeForResource,
  saveJsonLdConfig,
  scanThemeConflicts,
  disableThemeSchemas,
  enableThemeSchemas,
  searchProductsForPicker,
  type ConflictReport,
} from "./actions";
import type { ProductsJsonLdConfig } from "@/lib/json-ld-config";

export function ProductsTab({
  initial,
}: {
  initial: ProductsJsonLdConfig;
}) {
  const [cfg, setCfg] = useState<ProductsJsonLdConfig>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictReport | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [debugReport, setDebugReport] = useState<unknown>(null);
  const [debugPickerOpen, setDebugPickerOpen] = useState(false);

  function runJudgeMeDebug(id: string) {
    setDebugReport(null);
    setMsg(null);
    start(async () => {
      const r = await debugJudgeMeForResource(id);
      setDebugReport(r);
    });
  }

  function patch(p: Partial<ProductsJsonLdConfig>) {
    setCfg({ ...cfg, ...p });
  }

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveJsonLdConfig({ products: cfg });
      setMsg(r.message);
    });
  }

  function applyAll() {
    if (
      !confirm(
        "Apply this Product schema to ALL active products? This writes a metafield on every product.",
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const r = await applyProductSchemaToAll();
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function applyOne(id: string) {
    setMsg(null);
    start(async () => {
      const r = await applyProductSchemaToOne(id);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
    });
  }

  function scanConflicts() {
    start(async () => {
      setConflicts(await scanThemeConflicts());
    });
  }

  function disableExisting() {
    if (
      !confirm(
        "This will modify your theme files to comment out existing JSON-LD scripts. Reversible. Continue?",
      )
    )
      return;
    start(async () => {
      const r = await disableThemeSchemas();
      setMsg(r.message);
      setConflicts(null);
    });
  }

  function enableExisting() {
    start(async () => {
      const r = await enableThemeSchemas();
      setMsg(r.message);
      setConflicts(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Add a product schema to your pages to improve Google Search and Google
        Merchant listings. This microdata is invisible to visitors and only
        read by search engines.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Theme conflicts</h3>
            <p className="text-xs text-slate-500">
              Scan your theme for existing JSON-LD scripts that might conflict
              with the schema this app generates.
            </p>
          </div>
          <button
            type="button"
            onClick={scanConflicts}
            disabled={pending}
            className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {pending ? "Scanning…" : "Scan theme"}
          </button>
        </div>
        {conflicts && (
          <div className="mt-3 text-xs">
            <div className="font-mono text-slate-600">{conflicts.message}</div>
            {conflicts.conflicts.length > 0 && (
              <div className="mt-2">
                <ul className="space-y-1 mb-3">
                  {conflicts.conflicts.map((c, i) => (
                    <li
                      key={i}
                      className="px-2 py-1 bg-red-50 border border-red-200 rounded text-red-800"
                    >
                      <span className="font-mono">{c.filename}</span> —{" "}
                      {c.schemaType}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={disableExisting}
                    className="px-3 py-1 rounded bg-red-600 text-white text-xs"
                  >
                    Disable all in theme
                  </button>
                  <button
                    type="button"
                    onClick={enableExisting}
                    className="px-3 py-1 rounded bg-emerald-600 text-white text-xs"
                  >
                    Re-enable
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Settings
        </div>
        <div className="p-5 space-y-4">
          {/* Ratings row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Toggle
              label="Show Star Rating"
              checked={cfg.showStarRating}
              onChange={(v) => patch({ showStarRating: v })}
            />
            <Toggle
              label="Show Random Rating"
              checked={cfg.showRandomRating}
              onChange={(v) => patch({ showRandomRating: v })}
            />
            <Field label="Number Of Ratings">
              <select
                value={cfg.numberOfRatings}
                onChange={(e) =>
                  patch({
                    numberOfRatings: e.target
                      .value as ProductsJsonLdConfig["numberOfRatings"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="less_5">Less than 5</option>
                <option value="less_20">Less than 20</option>
                <option value="less_50">Less than 50</option>
                <option value="less_100">Less than 100</option>
              </select>
            </Field>
            <Toggle
              label="Always Show 5 Stars"
              checked={cfg.alwaysShow5Stars}
              onChange={(v) => patch({ alwaysShow5Stars: v })}
            />
            <Toggle
              label="Reset Random Ratings"
              checked={cfg.resetRandomRatings}
              onChange={(v) => patch({ resetRandomRatings: v })}
            />
          </div>

          <hr className="border-slate-100" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Toggle
              label="Always Show In-Stock"
              checked={cfg.alwaysShowInStock}
              onChange={(v) => patch({ alwaysShowInStock: v })}
            />
            <Field label="Brand Source">
              <select
                value={cfg.brandSource}
                onChange={(e) =>
                  patch({
                    brandSource: e.target
                      .value as ProductsJsonLdConfig["brandSource"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="store_name">Use store name</option>
                <option value="vendor">Use product vendor</option>
              </select>
            </Field>
            <Field label="Description Type">
              <select
                value={cfg.descriptionType}
                onChange={(e) =>
                  patch({
                    descriptionType: e.target
                      .value as ProductsJsonLdConfig["descriptionType"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="meta_description">Meta description</option>
                <option value="html_body">HTML body (stripped)</option>
                <option value="title">Title</option>
              </select>
            </Field>
            <Field label="Item Condition">
              <select
                value={cfg.itemCondition}
                onChange={(e) =>
                  patch({
                    itemCondition: e.target
                      .value as ProductsJsonLdConfig["itemCondition"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="new">New</option>
                <option value="refurbished">Refurbished</option>
                <option value="used">Used</option>
                <option value="damaged">Damaged</option>
              </select>
            </Field>
            <Field label="Gender">
              <select
                value={cfg.gender}
                onChange={(e) =>
                  patch({
                    gender: e.target.value as ProductsJsonLdConfig["gender"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="">not set</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="unisex">Unisex</option>
              </select>
            </Field>
            <Field label="Age Group">
              <select
                value={cfg.ageGroup}
                onChange={(e) =>
                  patch({
                    ageGroup: e.target
                      .value as ProductsJsonLdConfig["ageGroup"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="">not set</option>
                <option value="newborn">Newborn</option>
                <option value="infant">Infant</option>
                <option value="toddler">Toddler</option>
                <option value="kids">Kids</option>
                <option value="adult">Adult</option>
              </select>
            </Field>
          </div>

          <hr className="border-slate-100" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Handling Time Min (days)">
              <input
                type="number"
                value={cfg.handlingTimeMinDays}
                onChange={(e) =>
                  patch({ handlingTimeMinDays: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded"
              />
            </Field>
            <Field label="Handling Time Max (days)">
              <input
                type="number"
                value={cfg.handlingTimeMaxDays}
                onChange={(e) =>
                  patch({ handlingTimeMaxDays: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded"
              />
            </Field>
            <Toggle
              label="Free Shipping"
              checked={cfg.freeShipping}
              onChange={(v) => patch({ freeShipping: v })}
            />
            <Toggle
              label="Free Shipping Worldwide"
              checked={cfg.freeShippingWorldwide}
              onChange={(v) => patch({ freeShippingWorldwide: v })}
            />
            <Field label="Free Shipping Threshold ($)">
              <input
                type="number"
                value={cfg.freeShippingThreshold ?? ""}
                onChange={(e) =>
                  patch({
                    freeShippingThreshold:
                      e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded"
              />
            </Field>
            <Field label="Primary Shipping Country (ISO)">
              <input
                value={cfg.shippingRegion}
                onChange={(e) => patch({ shippingRegion: e.target.value })}
                placeholder="US"
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded"
              />
            </Field>
            <Field label="Currency (ISO 4217)">
              <input
                value={cfg.currency}
                onChange={(e) => patch({ currency: e.target.value })}
                placeholder="USD"
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded"
              />
            </Field>
          </div>
          <Field label="All shipping countries (comma-separated ISO codes)">
            <textarea
              rows={2}
              value={cfg.shippingCountries}
              onChange={(e) => patch({ shippingCountries: e.target.value })}
              placeholder="US,GB,DE,FR,..."
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded"
            />
          </Field>

          <hr className="border-slate-100" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Return Policy URL">
              <input
                value={cfg.returnPolicyUrl}
                onChange={(e) => patch({ returnPolicyUrl: e.target.value })}
                placeholder="https://example.com/policies/returns"
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded"
              />
            </Field>
            <Field label="Allow Returns">
              <select
                value={cfg.allowReturns}
                onChange={(e) =>
                  patch({
                    allowReturns: e.target
                      .value as ProductsJsonLdConfig["allowReturns"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="no_returns">No returns</option>
                <option value="x_days">Returns within X days</option>
                <option value="always">Returns always</option>
              </select>
            </Field>
            <Field label="Return Days Limit">
              <input
                type="number"
                value={cfg.returnDaysLimit}
                onChange={(e) =>
                  patch({ returnDaysLimit: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded"
              />
            </Field>
            <Field label="Return Method">
              <select
                value={cfg.returnMethod}
                onChange={(e) =>
                  patch({
                    returnMethod: e.target
                      .value as ProductsJsonLdConfig["returnMethod"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="by_mail">By mail</option>
                <option value="in_store">In store</option>
                <option value="either">Either</option>
              </select>
            </Field>
            <Field label="Return Fees">
              <select
                value={cfg.returnFees}
                onChange={(e) =>
                  patch({
                    returnFees: e.target
                      .value as ProductsJsonLdConfig["returnFees"],
                  })
                }
                className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-white"
              >
                <option value="free_shipping">Free shipping</option>
                <option value="customer_pays">Customer pays</option>
                <option value="restocking_fee">Restocking fee</option>
              </select>
            </Field>
          </div>
        </div>
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
          onClick={() => setPickerOpen(true)}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-white border border-indigo-300 text-indigo-700 text-sm font-semibold hover:bg-indigo-50 disabled:opacity-60"
        >
          Update one product
        </button>
        <button
          type="button"
          onClick={() => setDebugPickerOpen(true)}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-white border border-amber-300 text-amber-700 text-sm font-semibold hover:bg-amber-50 disabled:opacity-60"
        >
          Test Judge.me
        </button>
        <button
          type="button"
          onClick={applyAll}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : "Update all products"}
        </button>
      </div>

      {/* Persistent result panel — never disappears so we can debug */}
      {msg && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mt-3 text-sm font-mono break-all">
          <div className="text-xs uppercase text-slate-500 mb-1">Last result</div>
          <div
            className={
              msg.startsWith("✅") ? "text-emerald-700" : "text-red-700"
            }
          >
            {msg}
          </div>
        </div>
      )}

      {pickerOpen && (
        <ProductPicker
          title="Pick a product to test"
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setPickerOpen(false);
            applyOne(id);
          }}
        />
      )}

      {debugPickerOpen && (
        <ProductPicker
          title="Pick a product to test Judge.me"
          onClose={() => setDebugPickerOpen(false)}
          onPick={(id) => {
            setDebugPickerOpen(false);
            runJudgeMeDebug(id);
          }}
        />
      )}

      {debugReport != null && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-slate-500">
              Judge.me debug
            </div>
            <button
              type="button"
              onClick={() => setDebugReport(null)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              ✕
            </button>
          </div>
          <pre className="text-[10px] font-mono overflow-x-auto bg-slate-50 p-3 rounded max-h-96">
            {JSON.stringify(debugReport, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ProductPicker({
  title = "Pick a product to test",
  onClose,
  onPick,
}: {
  title?: string;
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
    start(async () => {
      setResults(await searchProductsForPicker(value));
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{title}</h3>
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
                <li
                  key={r.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() => onPick(r.id)}
                    className="text-left flex-1 min-w-0"
                  >
                    <div className="font-medium text-slate-900 truncate">
                      {r.title || r.handle}
                    </div>
                    <div className="text-xs text-slate-500 font-mono truncate">
                      {r.handle}
                    </div>
                  </button>
                  <a
                    href={`https://www.proteckd.com/products/${r.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-3 shrink-0 text-xs text-indigo-600 hover:underline"
                  >
                    view ↗
                  </a>
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-700">{label}</span>
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

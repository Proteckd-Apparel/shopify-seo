"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  type RobotsRule,
  type RuleType,
  addRule,
  deleteRule,
  setBoostImages,
  applyToTheme,
  readThemeRobotsFile,
  restoreDefault,
  testUrl,
} from "./actions";

const RULE_TYPES: RuleType[] = ["disallow", "allow", "sitemap", "crawl-delay"];
const UA_PRESETS = ["*", "Googlebot", "Googlebot-Image", "Bingbot", "adsbot-google"];

export function RobotsUI({
  initialRules,
  initialBoost,
  initialLive,
  domain,
}: {
  initialRules: RobotsRule[];
  initialBoost: boolean;
  initialLive: string | null;
  domain: string | null;
}) {
  const [rules, setRules] = useState(initialRules);
  const [boost, setBoost] = useState(initialBoost);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ua, setUa] = useState("*");
  const [type, setType] = useState<RuleType>("disallow");
  const [value, setValue] = useState("");
  const [showLive, setShowLive] = useState(false);
  const [liveContent, setLiveContent] = useState<string | null>(initialLive);
  const [themeFile, setThemeFile] = useState<string | null>(null);
  const [showThemeFile, setShowThemeFile] = useState(false);
  const [testUrlInput, setTestUrlInput] = useState("");
  const [testUaInput, setTestUaInput] = useState("Googlebot");
  const [testResult, setTestResult] = useState<string | null>(null);

  function onAdd() {
    if (!value.trim()) {
      setMsg("Rule value can't be empty");
      return;
    }
    setMsg(null);
    start(async () => {
      const r = await addRule({ ua, type, value });
      if (r.ok && r.rules) setRules(r.rules);
      setMsg(r.message);
      setValue("");
    });
  }

  function onDelete(id: string) {
    start(async () => {
      const r = await deleteRule(id);
      if (r.ok && r.rules) setRules(r.rules);
    });
  }

  function toggleBoost() {
    const next = !boost;
    setBoost(next);
    start(async () => {
      const r = await setBoostImages(next);
      setMsg(r.message);
    });
  }

  function onApply() {
    if (
      !confirm(
        "Write robots.txt.liquid to your live theme? Shopify keeps version history so you can roll back.",
      )
    )
      return;
    start(async () => {
      const r = await applyToTheme();
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
      if (r.ok && domain) {
        // Re-fetch live after a brief delay
        setTimeout(async () => {
          try {
            const live = await fetch(`https://${domain}/robots.txt`, {
              cache: "no-store",
            });
            setLiveContent(await live.text());
          } catch {}
        }, 1500);
      }
    });
  }

  function onView() {
    setShowLive((v) => !v);
  }

  function onEdit() {
    start(async () => {
      const r = await readThemeRobotsFile();
      setThemeFile(r.content ?? "(no robots.txt.liquid in theme — using Shopify default)");
      setShowThemeFile(true);
    });
  }

  function onRestore() {
    if (
      !confirm(
        "Reset robots.txt to Shopify's default and clear all custom rules? This rewrites the theme file.",
      )
    )
      return;
    start(async () => {
      const r = await restoreDefault();
      setMsg(r.message);
      if (r.ok) {
        setRules([]);
        setBoost(false);
      }
    });
  }

  function onTest() {
    if (!testUrlInput.trim()) return;
    setTestResult(null);
    start(async () => {
      const r = await testUrl({ url: testUrlInput, ua: testUaInput });
      setTestResult(
        r.ok
          ? (r.allowed ? "✅ ALLOWED — " : "🚫 BLOCKED — ") + r.message
          : "❌ " + r.message,
      );
    });
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Custom rules are stored here and merged into a generated{" "}
        <code>templates/robots.txt.liquid</code>. Click <strong>Apply to theme</strong>{" "}
        to write the file. Shopify&apos;s default user-agent groups are
        preserved — your rules are appended inside each matching group.
      </div>

      {/* Toggles */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Options
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-900">
                Boost Google Images
              </div>
              <div className="text-xs text-slate-500">
                Adds <code>Allow</code> rules so Googlebot-Image can crawl
                product images.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={boost}
              onClick={toggleBoost}
              disabled={pending}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                boost ? "bg-indigo-600" : "bg-slate-300"
              } disabled:opacity-60`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                  boost ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Add custom rule */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Add custom rule
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              User-agent
            </label>
            <input
              list="ua-presets"
              value={ua}
              onChange={(e) => setUa(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-mono"
            />
            <datalist id="ua-presets">
              {UA_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Rule type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as RuleType)}
              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              {RULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Rule value
            </label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="/cart or /sitemap.xml or 5"
              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded font-mono"
            />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button
              type="button"
              onClick={onAdd}
              disabled={pending}
              className="px-3 py-1.5 rounded bg-slate-900 text-white text-xs hover:bg-slate-800 disabled:opacity-60"
            >
              Add custom rule
            </button>
          </div>
        </div>
      </div>

      {/* Custom rules table */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Custom rules ({rules.length})
        </div>
        {rules.length === 0 ? (
          <div className="p-5 text-xs text-slate-500">No custom rules yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2 w-32">User-agent</th>
                <th className="text-left px-4 py-2 w-28">Type</th>
                <th className="text-left px-4 py-2">Value</th>
                <th className="text-right px-4 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono text-xs">{r.ua}</td>
                  <td className="px-4 py-2 text-xs text-sky-600">{r.type}</td>
                  <td className="px-4 py-2 font-mono text-xs break-all">
                    {r.value}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Test a URL */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-5 py-3 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-600 font-semibold">
          Test a URL
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              value={testUrlInput}
              onChange={(e) => setTestUrlInput(e.target.value)}
              placeholder="/products/example or full URL"
              className="sm:col-span-2 px-2 py-1.5 text-xs border border-slate-300 rounded font-mono"
            />
            <select
              value={testUaInput}
              onChange={(e) => setTestUaInput(e.target.value)}
              className="px-2 py-1.5 text-xs border border-slate-300 rounded bg-white"
            >
              {UA_PRESETS.filter((u) => u !== "*").map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onTest}
            disabled={pending}
            className="px-3 py-1.5 rounded bg-sky-600 text-white text-xs hover:bg-sky-700 disabled:opacity-60"
          >
            Test
          </button>
          {testResult && (
            <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
              {testResult}
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-4 bg-white border border-slate-200 rounded-lg p-3 flex flex-wrap items-center gap-2 shadow-lg">
        <button
          type="button"
          onClick={onApply}
          disabled={pending}
          className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Working…" : "Apply to theme"}
        </button>
        <button
          type="button"
          onClick={onView}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-60"
        >
          {showLive ? "Hide live robots.txt" : "View live robots.txt"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-white border border-slate-300 text-xs hover:bg-slate-50 disabled:opacity-60"
        >
          View theme file
        </button>
        <button
          type="button"
          onClick={onRestore}
          disabled={pending}
          className="px-3 py-1.5 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-60"
        >
          Restore default
        </button>
        {msg && (
          <span className="basis-full text-xs text-slate-700 mt-1">{msg}</span>
        )}
      </div>

      {showLive && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-xs uppercase tracking-wider text-slate-600 font-semibold mb-2">
            Live robots.txt {domain && <span className="text-slate-400">({domain})</span>}
          </h3>
          <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded font-mono overflow-x-auto whitespace-pre-wrap max-h-96">
            {liveContent ?? "(could not fetch)"}
          </pre>
        </div>
      )}

      {showThemeFile && themeFile && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <h3 className="text-xs uppercase tracking-wider text-slate-600 font-semibold mb-2">
            templates/robots.txt.liquid
          </h3>
          <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded font-mono overflow-x-auto whitespace-pre-wrap max-h-96">
            {themeFile}
          </pre>
        </div>
      )}
    </div>
  );
}

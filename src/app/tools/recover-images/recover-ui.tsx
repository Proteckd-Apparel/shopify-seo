"use client";

import { useState, useTransition } from "react";
import { ImageOff, Search, Wand2 } from "lucide-react";
import { runScan, runApply } from "./actions";
import type {
  BrokenRef,
  ScanReport,
  ApplyReport,
  Fix,
} from "@/lib/article-image-recovery";

function fmtBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function basenameOnly(url: string): string {
  const path = url.split("?")[0];
  return path.split("/").pop() ?? url;
}

export function RecoverImagesUI() {
  const [pending, start] = useTransition();
  const [report, setReport] = useState<ScanReport | null>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  // chosen[brokenIndex] = fileId of the candidate the user picked, or "skip"
  const [chosen, setChosen] = useState<Record<number, string>>({});
  const [applyReport, setApplyReport] = useState<ApplyReport | null>(null);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  function doScan() {
    setScanMsg(null);
    setReport(null);
    setChosen({});
    setApplyReport(null);
    setApplyMsg(null);
    start(async () => {
      const r = await runScan();
      if (!r.ok || !r.report) {
        setScanMsg(r.message ?? "Scan failed");
        return;
      }
      setReport(r.report);
      // Auto-pick the first candidate where there's exactly one match.
      const initialChoice: Record<number, string> = {};
      r.report.broken.forEach((b, i) => {
        if (b.candidates.length === 1) initialChoice[i] = b.candidates[0].id;
      });
      setChosen(initialChoice);
    });
  }

  function doApply() {
    if (!report) return;
    const fixes: Fix[] = [];
    report.broken.forEach((b, i) => {
      const fileId = chosen[i];
      if (!fileId || fileId === "skip") return;
      const candidate = b.candidates.find((c) => c.id === fileId);
      if (!candidate) return;
      fixes.push({
        resourceId: b.resourceId,
        resourceType: b.resourceType,
        oldUrl: b.oldUrl,
        newUrl: candidate.url,
      });
    });
    if (fixes.length === 0) {
      setApplyMsg("No matched fixes to apply.");
      return;
    }
    if (
      !confirm(
        `Apply ${fixes.length} URL rewrite${fixes.length === 1 ? "" : "s"} across ${
          new Set(fixes.map((f) => `${f.resourceType}:${f.resourceId}`)).size
        } resource(s)? This rewrites article/page/product body HTML on Shopify.`,
      )
    )
      return;
    setApplyMsg(null);
    setApplyReport(null);
    start(async () => {
      const r = await runApply(fixes);
      if (!r.ok || !r.report) {
        setApplyMsg(r.message ?? "Apply failed");
        return;
      }
      setApplyReport(r.report);
      setApplyMsg(
        `Done — updated ${r.report.resourcesUpdated} resources, ${r.report.fixesApplied} URL rewrites${
          r.report.failed > 0 ? `, ${r.report.failed} failed` : ""
        }.`,
      );
    });
  }

  function setChoice(i: number, fileId: string) {
    setChosen((prev) => ({ ...prev, [i]: fileId }));
  }

  const matchedCount = report
    ? Object.values(chosen).filter((v) => v && v !== "skip").length
    : 0;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        Scans every article, page, and product body HTML on Shopify for{" "}
        <code className="text-xs">cdn.shopify.com</code> image URLs that 404,
        then matches each broken URL against your current Files Library by
        filename prefix (so a broken{" "}
        <code className="text-xs">02_385703af-…</code> can be paired with a
        surviving <code className="text-xs">02_955b4283-…</code>). Read-only
        until you click Apply.
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <button
          type="button"
          onClick={doScan}
          disabled={pending}
          className="px-4 py-3 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          <Search className="w-4 h-4" />
          {pending && !report ? "Scanning…" : "Scan for broken images"}
        </button>
        {scanMsg && (
          <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {scanMsg}
          </div>
        )}
        {report && (
          <div className="mt-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-3 py-2">
            Scanned {report.scanned.articles} articles,{" "}
            {report.scanned.pages} pages, {report.scanned.products} products.{" "}
            Probed {report.candidateUrlCount} unique CDN URLs · found{" "}
            <strong>{report.brokenRefCount}</strong> broken references.
          </div>
        )}
      </div>

      {report && report.broken.length > 0 && (
        <>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
                Broken references ({report.broken.length})
              </div>
              <div className="text-xs text-slate-500">
                {matchedCount} matched · {report.broken.length - matchedCount}{" "}
                unmatched
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Resource</th>
                  <th className="text-left px-4 py-2">Broken URL</th>
                  <th className="text-left px-4 py-2 w-96">Replace with</th>
                </tr>
              </thead>
              <tbody>
                {report.broken.map((b, i) => (
                  <BrokenRow
                    key={i}
                    refData={b}
                    chosen={chosen[i] ?? ""}
                    onChange={(v) => setChoice(i, v)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 flex items-center justify-between gap-4">
            <div className="text-xs text-slate-600">
              {matchedCount} of {report.broken.length} URLs ready to rewrite.
            </div>
            <button
              type="button"
              onClick={doApply}
              disabled={pending || matchedCount === 0}
              className="px-4 py-2 rounded bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2"
            >
              <Wand2 className="w-4 h-4" />
              {pending && report ? "Applying…" : `Apply ${matchedCount} fix${matchedCount === 1 ? "" : "es"}`}
            </button>
          </div>

          {applyMsg && (
            <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
              {applyMsg}
            </div>
          )}
          {applyReport && applyReport.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-xs font-semibold text-red-800 mb-2">
                Errors
              </div>
              <ul className="text-xs text-red-700 space-y-1 font-mono">
                {applyReport.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {report && report.broken.length === 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-900 inline-flex items-center gap-2">
          <ImageOff className="w-4 h-4" />
          No broken image references found.
        </div>
      )}
    </div>
  );
}

function BrokenRow({
  refData,
  chosen,
  onChange,
}: {
  refData: BrokenRef;
  chosen: string;
  onChange: (v: string) => void;
}) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <div className="text-xs font-medium text-slate-800">
          {refData.resourceTitle || refData.resourceHandle || refData.resourceId}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
          {refData.resourceType} · {refData.resourceHandle}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="font-mono text-xs text-slate-700 break-all">
          {basenameOnly(refData.oldUrl)}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          prefix: <code>{refData.prefix}</code> · {refData.candidates.length}{" "}
          candidate{refData.candidates.length === 1 ? "" : "s"}
        </div>
      </td>
      <td className="px-4 py-3">
        {refData.candidates.length === 0 ? (
          <div className="text-xs text-amber-700">
            No matching file in current library.
          </div>
        ) : (
          <select
            value={chosen}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono"
          >
            <option value="">— choose —</option>
            <option value="skip">Skip this URL</option>
            {refData.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.filename} ({fmtBytes(c.size)})
              </option>
            ))}
          </select>
        )}
      </td>
    </tr>
  );
}

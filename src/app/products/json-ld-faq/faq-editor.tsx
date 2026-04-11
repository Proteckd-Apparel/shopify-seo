"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  generateFaqsAI,
  loadFaqsForProduct,
  saveFaqsForProduct,
} from "./actions";
import type { FaqItem } from "@/lib/json-ld-generators";

export function FaqEditButton({
  productId,
  productTitle,
}: {
  productId: string;
  productTitle: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
      >
        Edit FAQs
      </button>
      {open && (
        <FaqModal
          productId={productId}
          productTitle={productTitle}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FaqModal({
  productId,
  productTitle,
  onClose,
}: {
  productId: string;
  productTitle: string;
  onClose: () => void;
}) {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    start(async () => {
      const existing = await loadFaqsForProduct(productId);
      setFaqs(existing);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function addFaq() {
    setFaqs([...faqs, { question: "", answer: "" }]);
  }

  function removeFaq(idx: number) {
    setFaqs(faqs.filter((_, i) => i !== idx));
  }

  function updateFaq(idx: number, patch: Partial<FaqItem>) {
    setFaqs(faqs.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function save() {
    const cleaned = faqs
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter((f) => f.question && f.answer);
    setMsg(null);
    start(async () => {
      const r = await saveFaqsForProduct(productId, cleaned);
      setMsg((r.ok ? "✅ " : "❌ ") + r.message);
      if (r.ok) setFaqs(cleaned);
    });
  }

  function aiGenerate() {
    setMsg(null);
    start(async () => {
      const r = await generateFaqsAI(productId, 5);
      if (r.ok && r.faqs) {
        setFaqs([...faqs, ...r.faqs]);
        setMsg(`✅ Generated ${r.faqs.length} FAQs (review and save)`);
      } else {
        setMsg("❌ " + (r.message ?? "AI failed"));
      }
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-3xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Edit FAQs</h3>
            <div className="text-xs text-slate-500 truncate max-w-md">
              {productTitle}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : faqs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              No FAQs yet. Click <strong>Add FAQ</strong> or{" "}
              <strong>AI generate</strong> below.
            </div>
          ) : (
            faqs.map((f, i) => (
              <div
                key={i}
                className="bg-white border border-slate-200 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-500">
                    FAQ #{i + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFaq(i)}
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  value={f.question}
                  onChange={(e) => updateFaq(i, { question: e.target.value })}
                  placeholder="Question"
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-indigo-500"
                />
                <textarea
                  value={f.answer}
                  onChange={(e) => updateFaq(i, { answer: e.target.value })}
                  placeholder="Answer"
                  rows={2}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addFaq}
            disabled={pending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-slate-300 text-sm hover:bg-slate-50 disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" /> Add FAQ
          </button>
          <button
            type="button"
            onClick={aiGenerate}
            disabled={pending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-violet-100 text-violet-700 text-sm hover:bg-violet-200 disabled:opacity-60"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI generate
          </button>
          <div className="ml-auto flex items-center gap-2">
            {msg && (
              <span
                className={`text-xs ${
                  msg.startsWith("✅") ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {msg}
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="px-4 py-1.5 rounded bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60"
            >
              {pending ? "Working…" : "Save & apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

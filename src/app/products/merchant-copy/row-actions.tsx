"use client";

import { useState, useTransition } from "react";
import { generateAndSaveForProduct } from "./actions";

export function RowActions({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await generateAndSaveForProduct(productId);
            setMsg(r.message);
          })
        }
        disabled={pending}
        className="px-3 py-1 text-xs border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 disabled:opacity-50"
      >
        {pending ? "Generating…" : "Generate"}
      </button>
      {msg && <div className="text-xs text-slate-600">{msg}</div>}
    </div>
  );
}

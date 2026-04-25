// Pre-flight cost estimates for bulk AI operations.
//
// Numbers are derived from the actual prompt sizes in lib/ai-generate.ts
// + lib/vision-ai.ts measured against Claude Haiku 4.5 pricing
// ($1.00/MTok input, $5.00/MTok output as of 2026-04). Estimates are
// intentionally rounded UP so the user sees a worst-case ceiling.
//
// Sanity check: a 200-row click on meta titles is the largest single
// operation, and even that lands under a quarter at ~$0.30. Pricing
// drift > 20% (e.g. Anthropic raises Haiku rates) → bump these.

export type AiOp =
  | "meta_title"
  | "meta_description"
  | "alt_text"
  | "merchant_copy"
  | "vision_alt";

// Cents per row, conservative ceiling. Multiply by row count for the
// pre-flight quote shown on the bulk-action confirm dialog.
export const AI_COST_PER_ROW_CENTS: Record<AiOp, number> = {
  meta_title: 0.15, // ~500 in / 80 out tokens, $0.0015
  meta_description: 0.25, // ~600 in / 200 out tokens, $0.0025
  alt_text: 0.10, // ~300 in / 80 out tokens, $0.0010
  merchant_copy: 1.00, // larger prompt + multi-section output, ~$0.01
  vision_alt: 0.50, // image input is the bulk of cost, ~$0.005
};

// Format cents as a USD string. Anything under $1 shows as "$0.18";
// $1+ rounds to nearest cent. No trailing zeros stripped — "$0.10" not "$0.1".
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 1) return "$" + dollars.toFixed(2);
  return "$" + dollars.toFixed(2);
}

// Pre-flight estimate string for a bulk action. Rounds up so the user
// always sees the ceiling, never a low-ball.
export function estimateBulkCost(op: AiOp, rowCount: number): string {
  const totalCents = AI_COST_PER_ROW_CENTS[op] * rowCount;
  return formatUsd(Math.ceil(totalCents * 100) / 100);
}

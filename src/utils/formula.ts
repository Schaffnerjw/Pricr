// Legacy formula evaluator — used ONLY by demo / pre-engine schemas (the new line-item pricing
// engine has no formulas). Errors are surfaced to the caller instead of silently returning $0.
export interface FormulaResult { value: number; error?: string; }

export function evaluateFormulaSafe(formula: string, values: Record<string, any>, pricing: Record<string, number>): FormulaResult {
  try {
    const ctx = { ...values, ...pricing };
    const fn = new Function(...Object.keys(ctx), `return ${formula}`);
    const r = fn(...Object.values(ctx));
    if (typeof r === "number" && isFinite(r)) return { value: r };
    return { value: 0, error: "Formula did not evaluate to a number" };
  } catch (e) {
    return { value: 0, error: e instanceof Error ? e.message : "Formula evaluation failed" };
  }
}

// Back-compat: returns just the number (callers that render literal-number summary lines never error).
export function evaluateFormula(formula: string, values: Record<string, any>, pricing: Record<string, number>): number {
  return evaluateFormulaSafe(formula, values, pricing).value;
}

export function evaluateCondition(condition: string, values: Record<string, any>, pricing: Record<string, number>): boolean {
  try {
    const ctx = { ...values, ...pricing };
    const fn = new Function(...Object.keys(ctx), `return ${condition}`);
    return Boolean(fn(...Object.values(ctx)));
  } catch { return false; }
}

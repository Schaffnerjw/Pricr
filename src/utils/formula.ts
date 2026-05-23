export function evaluateFormula(formula: string, values: Record<string,any>, pricing: Record<string,number>): number {
  try { const ctx={...values,...pricing}; const fn=new Function(...Object.keys(ctx),`return ${formula}`); const r=fn(...Object.values(ctx)); return typeof r==="number"&&isFinite(r)?r:0; } catch { return 0; }
}
export function evaluateCondition(condition: string, values: Record<string,any>, pricing: Record<string,number>): boolean {
  try { const ctx={...values,...pricing}; const fn=new Function(...Object.keys(ctx),`return ${condition}`); return Boolean(fn(...Object.values(ctx))); } catch { return false; }
}

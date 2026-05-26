// ── The line item model ──
// Every quote is a list of LineItems and the total is always their sum. No formulas, no fuzzy
// matching, no dual regimes. See src/utils/pricingEngine.ts for the single source of truth.

export type LineItemType = "material" | "labor" | "flat" | "addon" | "discount";

export interface LineItem {
  id: string;
  sectionId: string;
  sectionName: string;
  label: string;       // "TimberTech Reserve — 320 sq ft"
  quantity: number;
  unit: string;        // "sq ft" | "lf" | "hour" | "flat" | "each"
  rate: number;        // exact rate (dollars), looked up by ID — never by name
  total: number;       // quantity * rate, computed deterministically (dollars)
  type: LineItemType;
  optionId: string;    // the exact ID of the selected option in the schema
  rateSource: string;  // the exact field/option ID the rate came from (audit trail)
  error?: string;      // set (never silent) when the rate could not be resolved
}

export interface QuoteTotal {
  lineItems: LineItem[];
  subtotal: number;       // sum of non-discount line items (dollars)
  discount: number;       // total discount amount (dollars, positive)
  tax: number;
  total: number;          // subtotal - discount + tax
  deposit: number;        // deposit percent (0–100)
  depositAmount: number;  // dollars due as deposit
  minimum: number;        // configured minimum charge (0 if none)
  belowMin: boolean;      // true when the computed total was raised to the minimum
  hasErrors: boolean;     // true if any line item failed to resolve its rate
}

// What the rep selected, keyed by section id.
export interface SectionSelection {
  optionIds: string[];                 // selected option ids (one for single-select, many for multi)
  quantities: Record<string, number>;  // optionId → quantity (for measured / labor sections)
  labels?: Record<string, string>;     // optionId → label, for legacy fallback rate matching
  rates?: Record<string, number>;      // optionId → rate, for legacy fallback rate matching
}
export type QuoteSelections = Record<string, SectionSelection>;

export interface AddOnSelection {
  id: string;
  label: string;
  price: number;
}

export type DiscountInput =
  | { mode: "amount"; value: number; reason?: string }
  | { mode: "percent"; value: number; reason?: string }
  | null;

export interface PricingConfig {
  taxRate?: number;        // percent (e.g. 7) or fraction (<1, treated as fraction); 0 if none
  minimumCharge?: number;
  depositPercent?: number;
}

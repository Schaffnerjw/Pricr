// Generic template — the home for any contractor whose work doesn't match a preset trade. Intentionally
// minimal: the user shapes it via AddFieldSheet / SchemaEditor (which are already trade-aware and
// give the full set of unit choices). Customer info is captured by QuoteScreen (customerName + notes
// + brand contact on the proposal); the schema below is for PRICING.
//
// Repeatable line items — they live in the engine's line-item model: every selected field becomes a
// line item with quantity × rate. The contractor adds line items by tapping "Add Field" in the Quote
// editor (Common Fields / Quick Setup), which is now wired with the expanded unit dropdown (day /
// week / month / project / each / hour / sq ft / linear ft / flat).
import { QuoteSchema } from "../../types";

export function buildGenericTemplate(tradeName?: string): QuoteSchema {
  const trade = (tradeName || "").trim() || "Custom Trade";
  return {
    trade,
    fields: [], // Empty — the contractor builds it out from scratch with AddFieldSheet.
    // Sensible structural defaults; every priced rate the contractor adds gets its own *Rate key.
    pricing: { depositPercent: 50, taxRate: 0, minimumCharge: 0 },
    addOns: [],
    calculation: "",   // engine path uses deriveSections + line items (no formula string needed)
    summaryLines: [],
  };
}

// Metadata for a future TradePicker. Icon picked from the canonical Feather set.
export const GENERIC_META = {
  id: "generic" as const,
  label: "Other / Generic",
  icon: "grid" as const,        // Feather "grid" — generic apps/categories
  depositDefault: 50,
};

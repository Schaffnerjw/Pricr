// Trade-specific "Common fields" offered as one-tap pills in AddFieldSheet. Each is fully first-class:
// drops in via the same schemaEditorOps + same QuoteSchema shape as any other field, with a blank
// price and a placeholder hint so the contractor sets their own rate. Pure data — testable.

export type AddType = "measure" | "yesno" | "pickone" | "calculated";

export interface CommonField {
  label: string;
  type: AddType;
  rate: number;            // 0 = blank (contractor sets it)
  unit: string;            // hr / each / flat / sq ft / lf …
  placeholder: string;     // e.g. "e.g. $75"
  options?: { label: string; rate: number; unit?: string }[]; // pickone only
}

// Normalize free-form trade strings ("Deck Building", "Decking", "Decks…") → a stable id.
export function tradeIdFromName(trade?: string | null): "roadside" | "handyman" | "decks" | "construction" | "generic" {
  const t = (trade || "").toLowerCase();
  if (/roadside|mechanic|tow|auto/.test(t)) return "roadside";
  if (/handyman|handy/.test(t)) return "handyman";
  if (/deck/.test(t)) return "decks";
  if (/construction|build|remodel|gen contract/.test(t)) return "construction";
  return "generic";
}

// All prices BLANK (rate: 0); each pill drops in with a helpful placeholder hint.
const ROADSIDE: CommonField[] = [
  { label: "Tow distance", type: "measure", rate: 0, unit: "each", placeholder: "Miles" },
  { label: "Vehicle weight class", type: "pickone", rate: 0, unit: "flat", placeholder: "Pick a class",
    options: [{ label: "Light", rate: 0 }, { label: "Medium", rate: 0 }, { label: "Heavy", rate: 0 }] },
  { label: "Emergency surcharge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $75" },
];
const HANDYMAN: CommonField[] = [
  { label: "Travel beyond city limits", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $40" },
  { label: "Disposal fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $50" },
  { label: "Permit assistance fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $75" },
];
const DECKS: CommonField[] = [
  { label: "Lighting package", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $450" },
  { label: "Privacy wall", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $850" },
  { label: "Built-in planter", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $250" },
];
const CONSTRUCTION: CommonField[] = [
  { label: "Architect fee passthrough", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $1,500" },
  { label: "Engineering fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $900" },
  { label: "Demolition disposal", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $600" },
];

// Generic trade gets no trade-specific extras — just the basic chip types in AddFieldSheet.
export function commonFieldsForTrade(trade?: string | null): CommonField[] {
  switch (tradeIdFromName(trade)) {
    case "roadside": return ROADSIDE;
    case "handyman": return HANDYMAN;
    case "decks": return DECKS;
    case "construction": return CONSTRUCTION;
    case "generic": default: return [];
  }
}

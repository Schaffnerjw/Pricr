// Trade-specific "Common fields" offered as one-tap pills in AddFieldSheet. Each is fully first-class:
// drops in via the same schemaEditorOps + same QuoteSchema shape as any other field, with a blank
// price and a placeholder hint so the contractor sets their own rate. Pure data — testable.
//
// Coverage rule: every defined trade returns ≥6 options so contractors have meaningful starting
// chips; the agnostic GENERIC list serves any trade that doesn't match a specific bucket (the bug
// that motivated this expansion was a property-management business seeing deck-only pills).

export type AddType = "measure" | "yesno" | "pickone" | "calculated";

export interface CommonField {
  label: string;
  type: AddType;
  rate: number;            // 0 = blank (contractor sets it)
  unit: string;            // hr / each / flat / sq ft / lf …
  placeholder: string;     // e.g. "e.g. $75"
  options?: { label: string; rate: number; unit?: string }[]; // pickone only
}

// Normalize free-form trade strings ("Deck Building", "Decking", "Decks…", "property management",
// "Photography") → a stable id. Order matters: more-specific regexes first so a trade name like
// "Property Management & Handyman Services" lands on property-management rather than handyman.
export type TradeId = "roadside" | "handyman" | "decks" | "construction" | "property-management" | "cleaning" | "photography" | "landscaping" | "hvac" | "generic";
export function tradeIdFromName(trade?: string | null): TradeId {
  const t = (trade || "").toLowerCase();
  if (/property\s*manag|landlord|rental\s*manag/.test(t)) return "property-management";
  if (/roadside|mechanic|\btow\b|automotive/.test(t)) return "roadside";
  if (/photograph|videograph/.test(t)) return "photography";
  if (/landscap|lawn|yard\s*care|garden/.test(t)) return "landscaping";
  if (/hvac|heating|cooling|air\s*condition/.test(t)) return "hvac";
  if (/cleaning|janitor|housekeep|maid/.test(t)) return "cleaning";
  if (/deck\b|decking/.test(t)) return "decks";
  if (/construction|build|remodel|gen.*contract/.test(t)) return "construction";
  if (/handyman|handy/.test(t)) return "handyman";
  return "generic";
}

// All prices BLANK (rate: 0); each pill drops in with a helpful placeholder hint. Targeting
// 6–8 per trade so the contractor has real specialization choices, not 2 token chips.
const ROADSIDE: CommonField[] = [
  { label: "Tow distance", type: "measure", rate: 0, unit: "each", placeholder: "Miles" },
  { label: "Vehicle weight class", type: "pickone", rate: 0, unit: "flat", placeholder: "Pick a class",
    options: [{ label: "Light", rate: 0 }, { label: "Medium", rate: 0 }, { label: "Heavy", rate: 0 }] },
  { label: "Emergency surcharge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $75" },
  { label: "After-hours surcharge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $50" },
  { label: "Hookup / service call", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $95" },
  { label: "Winch / recovery", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $150" },
  { label: "Storage per day", type: "measure", rate: 0, unit: "day", placeholder: "Days" },
];
const HANDYMAN: CommonField[] = [
  { label: "Travel beyond city limits", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $40" },
  { label: "Disposal fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $50" },
  { label: "Permit assistance fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $75" },
  { label: "Labor hours", type: "measure", rate: 0, unit: "hour", placeholder: "Hourly rate" },
  { label: "Materials markup", type: "measure", rate: 0, unit: "each", placeholder: "Markup %" },
  { label: "After-hours surcharge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $60" },
  { label: "Trip charge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $50" },
];
const DECKS: CommonField[] = [
  { label: "Lighting package", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $450" },
  { label: "Privacy wall", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $850" },
  { label: "Built-in planter", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $250" },
  { label: "Stairs", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $800" },
  { label: "Permit", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $200" },
  { label: "Demo / tear-out", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $500" },
  { label: "Delivery", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $150" },
  { label: "Frame protection", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $300" },
];
const CONSTRUCTION: CommonField[] = [
  { label: "Architect fee passthrough", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $1,500" },
  { label: "Engineering fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $900" },
  { label: "Demolition disposal", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $600" },
  { label: "Permit", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $400" },
  { label: "Site cleanup", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $350" },
  { label: "Materials markup", type: "measure", rate: 0, unit: "each", placeholder: "Markup %" },
  { label: "Project management", type: "measure", rate: 0, unit: "hour", placeholder: "Hourly rate" },
];
const PROPERTY_MANAGEMENT: CommonField[] = [
  { label: "Monthly management fee", type: "measure", rate: 0, unit: "month", placeholder: "Per month" },
  { label: "Lease-up fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $500" },
  { label: "Tenant placement fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $450" },
  { label: "Inspection fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $125" },
  { label: "Late fee handling", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $50" },
  { label: "Eviction filing", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $250" },
  { label: "Maintenance coordination", type: "measure", rate: 0, unit: "hour", placeholder: "Hourly rate" },
];
const CLEANING: CommonField[] = [
  { label: "Square footage", type: "measure", rate: 0, unit: "sq ft", placeholder: "Per sq ft" },
  { label: "Deep clean surcharge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $75" },
  { label: "Inside oven / fridge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $40" },
  { label: "Inside cabinets", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $35" },
  { label: "Window washing", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $50" },
  { label: "Move-in / move-out", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $125" },
  { label: "Pet surcharge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $25" },
];
const PHOTOGRAPHY: CommonField[] = [
  { label: "Session hours", type: "measure", rate: 0, unit: "hour", placeholder: "Hourly rate" },
  { label: "Travel beyond city", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $75" },
  { label: "Rush edit (48h)", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $150" },
  { label: "Additional retouching", type: "measure", rate: 0, unit: "each", placeholder: "Per photo" },
  { label: "Print package", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $200" },
  { label: "Second shooter", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $300" },
  { label: "Drone footage", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $200" },
];
const LANDSCAPING: CommonField[] = [
  { label: "Square footage", type: "measure", rate: 0, unit: "sq ft", placeholder: "Per sq ft" },
  { label: "Mulch / soil", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $250" },
  { label: "Tree / stump removal", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $400" },
  { label: "Sprinkler work", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $300" },
  { label: "Disposal / hauling", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $150" },
  { label: "Edging", type: "measure", rate: 0, unit: "linear ft", placeholder: "Per lf" },
  { label: "Seasonal cleanup", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $200" },
];
const HVAC: CommonField[] = [
  { label: "Service call", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $95" },
  { label: "Diagnostic fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $125" },
  { label: "Labor hours", type: "measure", rate: 0, unit: "hour", placeholder: "Hourly rate" },
  { label: "After-hours surcharge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $150" },
  { label: "Refrigerant", type: "measure", rate: 0, unit: "each", placeholder: "Per lb" },
  { label: "Permit", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $150" },
  { label: "Old unit disposal", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $100" },
];
// Agnostic fallback: useful chips for any trade we don't have a specific bucket for. Replaces
// the previous deck-only FIELD_TEMPLATES (Permit / Demo / Delivery / Labor / Stairs) that
// surfaced for property managers, photographers, etc.
const GENERIC: CommonField[] = [
  { label: "Travel fee", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $50" },
  { label: "Materials markup", type: "measure", rate: 0, unit: "each", placeholder: "Markup %" },
  { label: "Disposal / hauling", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $75" },
  { label: "Permit", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $150" },
  { label: "After-hours surcharge", type: "yesno", rate: 0, unit: "flat", placeholder: "e.g. $50" },
  { label: "Labor hours", type: "measure", rate: 0, unit: "hour", placeholder: "Hourly rate" },
];

export function commonFieldsForTrade(trade?: string | null): CommonField[] {
  switch (tradeIdFromName(trade)) {
    case "roadside": return ROADSIDE;
    case "handyman": return HANDYMAN;
    case "decks": return DECKS;
    case "construction": return CONSTRUCTION;
    case "property-management": return PROPERTY_MANAGEMENT;
    case "cleaning": return CLEANING;
    case "photography": return PHOTOGRAPHY;
    case "landscaping": return LANDSCAPING;
    case "hvac": return HVAC;
    case "generic": default: return GENERIC;
  }
}

// Job-notes textarea placeholder — trade-aware example, agnostic fallback. The previous hardcoded
// "TimberTech in Mocha color, gate on south side, deck off master bedroom" example surfaced for
// every trade including property management, photography, cleaning… The agnostic prompt covers
// the common categories without committing to a domain.
export function jobNotesPlaceholderForTrade(trade?: string | null): string {
  switch (tradeIdFromName(trade)) {
    case "decks": return "e.g. TimberTech in Mocha color, gate on south side, deck off master bedroom";
    case "construction": return "e.g. Permits in hand, work weekdays 8-4, owner occupied";
    case "handyman": return "e.g. Side door access, dog on premises, parking on street";
    case "roadside": return "e.g. Customer at mile marker 142 northbound, 4-door sedan, won't start";
    case "property-management": return "e.g. Vacant unit, lockbox code from owner, inspect HVAC + appliances";
    case "cleaning": return "e.g. 3 beds 2 baths, pet-friendly products, key under mat, prefer eco supplies";
    case "photography": return "e.g. Golden hour 7-8pm, two outfit changes, edit RAW + provide JPEGs";
    case "landscaping": return "e.g. Front + side yards only, no chemicals (kids/pets), haul away debris";
    case "hvac": return "e.g. 3-ton unit, attic access via garage, breaker panel labeled in basement";
    default: return "e.g. Specific colors or materials, site access notes, deadlines, special requests";
  }
}

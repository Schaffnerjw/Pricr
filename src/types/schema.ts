// ── Strict schema types for the pricing pipeline ──
// These types make the money path impossible to call with the wrong shape. The legacy QuoteSchema
// (src/types/index.ts) is preserved for demo compatibility; new schemas carry the strict `sections`
// below (with explicit option IDs + rates) which the pricing engine consumes deterministically.

export type SectionPattern =
  | "MATERIAL_MEASUREMENT"   // pick a material (or several) and enter a measurement: qty × rate
  | "SYSTEM_CONFIG_QUANTITY" // pick a system + config, then a quantity
  | "FLAT_RATE"              // fixed-price toggles
  | "LABOR"                  // hours × rate
  | "ADDON";                 // optional add-on

// One selectable, priced option. The rate is stored WITH the option — looked up by `id`,
// never by fuzzy name matching.
export interface SchemaOption {
  id: string;
  label: string;
  rate: number;          // dollars (whole or fractional); the engine converts to cents internally
  unit: string;          // "sq ft" | "lf" | "hour" | "flat" | "each" | …
  subsystemId?: string;  // SYSTEM_CONFIG_QUANTITY: which system this config belongs to
  // Linked/derived pricing: when set, this option's quantity is taken from the option named `linkedTo`
  // and priced at `multiplier` per unit (e.g. Frame Protection = Frame Materials qty × $0.50/sq ft).
  linkedTo?: string;
  multiplier?: number;
}

export interface AddOnDefinition {
  id: string;
  label: string;
  price: number;
}

// A legacy flat field (demo / pre-strict schemas). Kept so the deprecated path still type-checks.
export interface LegacyField {
  id: string;
  label: string;
  type: "number" | "selector" | "toggle" | "area";
  options?: string[];
  placeholder?: string;
  unit?: string;
  group?: string;
}

// A strict, render- and pricing-ready section. Explicit links, explicit multi-select — nothing
// inferred from names.
export interface SchemaSection {
  id: string;
  name: string;
  pattern: SectionPattern;
  options: SchemaOption[];
  quantityUnit?: string;     // MATERIAL_MEASUREMENT / LABOR: the unit the quantity is measured in
  quantityFieldId?: string;  // explicit link to the measurement field (no "first same-unit field" guessing)
  allowMultiSelect: boolean; // explicit — set at import/wizard time, never inferred from the name
}

// The strict schema. `sections` drives the pricing engine; the legacy fields are optional and only
// present on demo / pre-migration schemas so they keep calculating via the deprecated formula path.
export interface StrictQuoteSchema {
  trade: string;
  businessName?: string;
  sections: SchemaSection[];
  addOns: AddOnDefinition[];
  depositPercent: number;
  taxRate?: number;
  minimumCharge?: number;
  // Legacy fields kept for demo compatibility:
  pricing?: Record<string, number>;
  calculation?: string;
  fields?: LegacyField[];
}

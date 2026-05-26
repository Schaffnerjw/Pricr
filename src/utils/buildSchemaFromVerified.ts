import { AddOn, FieldGroup, FieldUnit, QuoteSchema, SchemaField, SummaryLine } from "../types";

// The unit choices the import editor / wizard offer the human. These are HUMAN-facing labels.
export type VerifiedUnit = "sq ft" | "lf" | "hour" | "each" | "flat" | "section" | "other";

export interface VerifiedItem { id: string; name: string; price: number; unit: VerifiedUnit; notes?: string; }
export interface VerifiedCategory { id: string; name: string; items: VerifiedItem[]; }
// A grouped, priced choice. Two shapes:
//  • per-unit: `quantityLabel` set → a quantity field × the selected option's rate (deck: sq ft × material).
//  • flat: `quantityLabel` omitted → a pick-one of fixed-price options (package tiers); `optional` adds "None".
// Produced by the wizard (variants) and by the import grouping (same-unit items in a category).
export interface VerifiedSelector { label?: string; quantityLabel?: string; unit: VerifiedUnit; optional?: boolean; options: { name: string; rate: number }[]; }
export interface VerifiedAddOn { id: string; name: string; price: number; }
export interface VerifiedData {
  trade: string;
  businessName?: string;
  categories: VerifiedCategory[];
  selectors?: VerifiedSelector[];
  addOns: VerifiedAddOn[];
  depositPercent: number;
  minimumCharge?: number;
}

// Human unit → the app's FieldUnit enum. "section"/"other" map to per-item counting ("each").
const UNIT_MAP: Record<VerifiedUnit, FieldUnit> = {
  "sq ft": "sqft", "lf": "lf", "hour": "hr", "each": "each", "flat": "flat", "section": "each", "other": "each",
};
const GROUP_FOR_UNIT: Record<string, FieldGroup> = {
  sqft: "dimensions", lf: "dimensions", room: "dimensions", load: "dimensions", ton: "dimensions",
  hr: "details", each: "extras", vehicle: "details", flat: "fees", percent: "fees",
};

// camelCase id from a label, unique against ids already used.
function slugId(label: string, used: Set<string>): string {
  const base = String(label || "field").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join("") || "field";
  let id = base; let n = 2;
  while (used.has(id) || /^\d/.test(id)) { id = /^\d/.test(id) ? `f${id}` : `${base}${n++}`; }
  used.add(id);
  return id;
}

// ── THE deterministic builder. Pure TypeScript: structured, human-verified input in → exact
// QuoteSchema out. No AI, no parsing, no possible failure. Used by BOTH the import flow and the wizard.
export function buildSchemaFromVerified(data: VerifiedData): QuoteSchema {
  const ids = new Set<string>();
  const fields: SchemaField[] = [];
  const pricing: Record<string, number> = { depositPercent: Number(data.depositPercent) || 0, taxRate: 0, minimumCharge: Number(data.minimumCharge) || 0 };
  const addOns: AddOn[] = [];
  const terms: string[] = [];
  const lines: SummaryLine[] = [];

  // 1) Grouped priced choices (selectors) — the antidote to one-field-per-product. A category of
  //    same-unit items collapses to ONE selector (+ a quantity for per-unit pricing) instead of N fields.
  for (const sel of data.selectors || []) {
    const opts = (sel.options || []).filter(o => o && o.name && typeof o.rate === "number");
    if (opts.length === 0) continue;
    const selLabel = sel.label || "Material";
    const unit = UNIT_MAP[sel.unit] || "each";
    const selId = slugId(selLabel, ids);
    const optKeys = opts.map(o => { const key = slugId(o.name, ids) + "Rate"; pricing[key] = o.rate; return { opt: o.name, key }; });
    const optionNames = sel.optional ? ["None", ...opts.map(o => o.name)] : opts.map(o => o.name);
    // rate selected by the chosen option; unmatched (incl. "None") → 0, except a required per-unit
    // selector falls back to the first option so an unset selector still prices something.
    const fallback = sel.optional ? "0" : optKeys[0].key;
    const rateExpr = optKeys.map(o => `${selId} == ${JSON.stringify(o.opt)} ? ${o.key}`).join(" : ") + ` : ${fallback}`;

    if (sel.quantityLabel) {
      // Per-unit: quantity × selected option's rate.
      const qtyId = slugId(sel.quantityLabel, ids);
      fields.push({ id: qtyId, label: sel.quantityLabel, type: "number", unit, group: GROUP_FOR_UNIT[unit] || "dimensions", placeholder: `Enter ${sel.quantityLabel.toLowerCase()}` });
      fields.push({ id: selId, label: selLabel, type: "selector", unit, group: "materials", options: optionNames });
      const term = `(${qtyId} || 0) * (${rateExpr})`;
      terms.push(term);
      lines.push({ label: `${sel.quantityLabel} ({${qtyId}})`, value: term });
    } else {
      // Flat pick-one (package tiers): the selected option's flat price.
      fields.push({ id: selId, label: selLabel, type: "selector", unit: "flat", group: "details", options: optionNames });
      terms.push(`(${rateExpr})`);
      lines.push({ label: selLabel, value: rateExpr });
    }
  }

  // 2) Category items → number (per-unit quantity) or toggle (flat on/off) fields.
  for (const cat of data.categories || []) {
    for (const item of cat.items || []) {
      if (!item || !item.name) continue;
      const id = slugId(item.name, ids);
      const rateKey = `${id}Rate`;
      pricing[rateKey] = Number(item.price) || 0;
      if (item.unit === "flat") {
        fields.push({ id, label: item.name, type: "toggle", unit: "flat", group: "fees" });
        terms.push(`(${id} ? ${rateKey} : 0)`);
        lines.push({ label: item.name, value: rateKey, showIf: `${id} == true` });
      } else {
        const unit = UNIT_MAP[item.unit] || "each";
        const field: SchemaField = { id, label: item.name, type: "number", unit, group: GROUP_FOR_UNIT[unit] || "dimensions", placeholder: item.notes?.trim() ? item.notes.trim() : `Enter ${item.name.toLowerCase()}` };
        fields.push(field);
        const term = `(${id} || 0) * ${rateKey}`;
        terms.push(term);
        lines.push({ label: `${item.name} ({${id}})`, value: term });
      }
    }
  }

  // 3) Add-ons.
  const addOnIds = new Set<string>();
  for (const a of data.addOns || []) {
    if (!a || !a.name) continue;
    addOns.push({ id: slugId(a.name, addOnIds), label: a.name, price: Number(a.price) || 0 });
  }

  return {
    trade: (data.trade || "").trim(),
    fields,
    pricing,
    addOns,
    calculation: terms.length ? terms.join(" + ") : "0",
    summaryLines: lines,
  };
}

export function verifiedItemCount(categories: VerifiedCategory[]): number {
  return (categories || []).reduce((s, c) => s + (c.items?.length || 0), 0);
}

// Human quantity label for a per-unit group (e.g. all the $/sq ft items in a category).
function quantityLabelFor(unit: VerifiedUnit): string {
  switch (unit) {
    case "sq ft": return "Square Footage";
    case "lf": return "Linear Feet";
    case "hour": return "Hours";
    case "section": return "Sections";
    default: return "Quantity";
  }
}

// Collapse an import's verified categories into the GROUPED SELECTOR + QUANTITY pattern: within a
// category, items that share a unit become ONE selector (pick the product) — per-unit groups add a
// single quantity field, flat groups become a pick-one of package tiers. Singletons stay as one field.
// This turns "69 fields for a deck company" into a handful of selectors + quantities.
export function groupImportCategories(categories: VerifiedCategory[]): { selectors: VerifiedSelector[]; items: VerifiedItem[] } {
  const selectors: VerifiedSelector[] = [];
  const items: VerifiedItem[] = [];
  for (const cat of categories || []) {
    const byUnit: Record<string, VerifiedItem[]> = {};
    for (const it of cat.items || []) { if (!it || !it.name) continue; (byUnit[it.unit] = byUnit[it.unit] || []).push(it); }
    const units = Object.keys(byUnit) as VerifiedUnit[];
    const selectorGroups = units.filter(u => byUnit[u].length >= 2).length; // for label disambiguation
    for (const u of units) {
      const group = byUnit[u];
      if (group.length < 2) { items.push(...group); continue; } // a lone item stays a single field
      const label = selectorGroups > 1 ? `${cat.name} (per ${u})` : cat.name;
      const options = group.map(g => ({ name: g.name, rate: g.price }));
      if (u === "flat") selectors.push({ label, unit: "flat", optional: true, options }); // pick-one tier
      else selectors.push({ label, quantityLabel: quantityLabelFor(u), unit: u, options }); // product × quantity
    }
  }
  return { selectors, items };
}

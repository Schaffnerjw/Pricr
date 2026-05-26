import { AddOn, FieldGroup, FieldUnit, QuoteSchema, SchemaField, SummaryLine } from "../types";

// The unit choices the import editor / wizard offer the human. These are HUMAN-facing labels.
export type VerifiedUnit = "sq ft" | "lf" | "hour" | "each" | "flat" | "section" | "other";

export interface VerifiedItem { id: string; name: string; price: number; unit: VerifiedUnit; notes?: string; }
export interface VerifiedCategory { id: string; name: string; items: VerifiedItem[]; }
// A variant-priced quantity group (the deck case: square footage × the selected material's rate).
// Produced by the wizard; the import editor leaves this empty (a flat list has one price per item).
export interface VerifiedSelector { quantityLabel: string; unit: VerifiedUnit; options: { name: string; rate: number }[]; }
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

  // 1) Variant-priced quantity groups (selectors): quantity field × selected option rate.
  for (const sel of data.selectors || []) {
    const opts = (sel.options || []).filter(o => o && o.name && typeof o.rate === "number");
    if (opts.length === 0) continue;
    const unit = UNIT_MAP[sel.unit] || "each";
    const qtyId = slugId(sel.quantityLabel || "Quantity", ids);
    fields.push({ id: qtyId, label: sel.quantityLabel || "Quantity", type: "number", unit, group: GROUP_FOR_UNIT[unit] || "dimensions", placeholder: `Enter ${(sel.quantityLabel || "quantity").toLowerCase()}` });
    const selId = slugId("Material", ids);
    const optKeys: { opt: string; key: string }[] = [];
    for (const o of opts) { const key = slugId(o.name, ids) + "Rate"; pricing[key] = o.rate; optKeys.push({ opt: o.name, key }); }
    fields.push({ id: selId, label: "Material", type: "selector", unit, group: "materials", options: opts.map(o => o.name) });
    const ternary = optKeys.map(o => `${selId} == ${JSON.stringify(o.opt)} ? ${o.key}`).join(" : ") + ` : ${optKeys[0].key}`;
    const term = `(${qtyId} || 0) * (${ternary})`;
    terms.push(term);
    lines.push({ label: `${sel.quantityLabel} ({${qtyId}})`, value: term });
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

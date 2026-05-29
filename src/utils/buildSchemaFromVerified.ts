import { AddOn, FieldGroup, FieldUnit, QuoteSchema, QuoteSection, SchemaField, SummaryLine } from "../types";
import { SchemaOption } from "../types/schema";
import { slugId } from "./helpers";
import { optionPrice } from "./quote";

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

// ── THE deterministic builder. Pure TypeScript: structured, human-verified input in → exact
// QuoteSchema out. No AI, no parsing, no possible failure. Used by BOTH the import flow and the wizard.
export function buildSchemaFromVerified(data: VerifiedData): QuoteSchema {
  const ids = new Set<string>();
  const fields: SchemaField[] = [];
  const pricing: Record<string, number> = { depositPercent: Number(data.depositPercent) || 0, taxRate: 0, minimumCharge: Number(data.minimumCharge) || 0 };
  const addOns: AddOn[] = [];
  const terms: string[] = [];
  const lines: SummaryLine[] = [];
  // Exact option metadata (id + rate) per field — built here where the rates are known, so the pricing
  // engine can look rates up by ID and never by fuzzy name matching.
  const optionsByField: Record<string, SchemaOption[]> = {};

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
    // Exact options for the engine: id = the rate key without its "Rate" suffix; label IS the stored value.
    optionsByField[selId] = opts.map((o, i) => ({ id: optKeys[i].key.replace(/Rate$/, ""), label: o.name, rate: o.rate, unit }));

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
        optionsByField[id] = [{ id, label: item.name, rate: Number(item.price) || 0, unit: "flat" }];
      } else {
        const unit = UNIT_MAP[item.unit] || "each";
        const field: SchemaField = { id, label: item.name, type: "number", unit, group: GROUP_FOR_UNIT[unit] || "dimensions", placeholder: item.notes?.trim() ? item.notes.trim() : `Enter ${item.name.toLowerCase()}` };
        fields.push(field);
        const term = `(${id} || 0) * ${rateKey}`;
        terms.push(term);
        lines.push({ label: `${item.name} ({${id}})`, value: term });
        optionsByField[id] = [{ id, label: item.name, rate: Number(item.price) || 0, unit }];
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
    sections: deriveSections(fields, pricing, optionsByField),
  };
}

// Default multi-select rule (shared with QuoteScreen). A section is MULTI-select unless it looks like
// a primary material choice: all options share one unit AND the section name carries a material
// keyword (decking/flooring/roofing/…). So independent-component sections ("Deck Components & Trim",
// "Deck Lighting") allow several picks; a material pick ("Decking Materials") stays single.
const MATERIAL_KEYWORDS = /material|decking|flooring|roofing|siding|insulation|paint|carpet/i;
export function defaultAllowMultiSelect(name: string, options: { unit?: string }[]): boolean {
  const allSameUnit = !options || options.length <= 1 || options.every(o => o.unit === options[0].unit);
  return !(allSameUnit && MATERIAL_KEYWORDS.test(name || ""));
}

// Best-effort exact rate for a selector option from the pricing table (used only on the Kit re-derive
// path, which has fields+pricing but not the original option→rate map). Exact key first, then a
// last-resort fuzzy match so a re-derived schema still prices rather than breaking.
function reconstructOptions(field: SchemaField, pricing: Record<string, number>): SchemaOption[] {
  const used = new Set<string>();
  return (field.options || []).filter(o => o && o !== "None").map(name => {
    const key = slugId(name, used) + "Rate";
    const rate = typeof pricing[key] === "number" ? pricing[key] : (optionPrice(name, pricing) ?? 0);
    return { id: slugId(name, new Set()), label: name, rate, unit: field.unit || "each" };
  });
}

// Derive the single-page render metadata from a built schema's fields. Deterministic and reusable
// (also called by QuoteScreen after the in-quote Kit agent rewrites a schema, so the new UI persists).
// Pairs each material selector with a same-unit quantity field (MATERIAL_MEASUREMENT), treats lone
// number fields as rate × quantity (LABOR), and groups toggles into one FLAT_RATE section. When
// `optionsByField` is supplied (the build path) options carry EXACT ids+rates; otherwise they are
// reconstructed from pricing.
//
// `priorSections` (Path B persistence fix): the sections array as it existed BEFORE this re-derive.
// When supplied, this function PRESERVES kernel-set structural state — section.name, allowMultiSelect,
// pattern, and empty-section survival — that would otherwise be destroyed every time deriveSections
// ran after a Kit / editor mutation. Without this, sectionsToRename / sectionsToSetProperty /
// sectionsToAdd / fieldsToMove (for toggles) all looked like they applied but were silently undone
// during persist + re-render. Legacy schemas (called WITHOUT priorSections) get the original
// derive-from-scratch behavior unchanged.
export function deriveSections(
  fields: SchemaField[],
  pricing: Record<string, number>,
  optionsByField?: Record<string, SchemaOption[]>,
  defaultSectionIds?: string[],
  priorSections?: QuoteSection[],
): QuoteSection[] {
  const out: QuoteSection[] = [];
  const isDefault = (id: string) => Array.isArray(defaultSectionIds) && defaultSectionIds.includes(id);
  const usedQty = new Set<string>();
  const opts = (f: SchemaField): SchemaOption[] => optionsByField?.[f.id] || reconstructOptions(f, pricing);
  // Lookup of prior sections by id, so each freshly-derived section can inherit custom state the
  // kernel may have written (rename, allowMultiSelect flip, pattern, etc.).
  const priorById = new Map<string, QuoteSection>();
  for (const p of priorSections || []) priorById.set(p.id, p);
  // Merge derived state with prior overrides. Prior wins for `name`, `allowMultiSelect`, `pattern`
  // when explicitly set on the prior section — these are the four fields the kernel structural ops
  // can mutate. Everything else comes from the derived shape (which is rebuilt fresh every call).
  const mergePrior = (derived: QuoteSection): QuoteSection => {
    const prior = priorById.get(derived.id);
    if (!prior) return derived;
    return {
      ...derived,
      ...(prior.name ? { name: prior.name } : {}),
      ...(typeof prior.allowMultiSelect === "boolean" ? { allowMultiSelect: prior.allowMultiSelect } : {}),
      ...(prior.pattern ? { pattern: prior.pattern } : {}),
    };
  };
  for (const sel of fields.filter(f => f.type === "selector")) {
    const qty = fields.find(f => (f.type === "number" || f.type === "area") && f.unit === sel.unit && !usedQty.has(f.id));
    const options = opts(sel);
    if (qty) {
      usedQty.add(qty.id);
      // Multi-select unless this looks like a primary MATERIAL choice (same unit + a material keyword
      // in the section name). So "Deck Components & Trim"/"Deck Lighting" = multi; "Decking Materials" = single.
      out.push(mergePrior({ id: sel.id, name: sel.label, pattern: "MATERIAL_MEASUREMENT", materialFieldId: sel.id, quantityFieldId: qty.id, unit: qty.unit, options, allowMultiSelect: defaultAllowMultiSelect(sel.label, options), defaultOn: isDefault(sel.id) }));
    } else {
      // Flat pick-one tier (packages): single-select alternatives.
      out.push(mergePrior({ id: sel.id, name: sel.label, pattern: "MATERIAL_MEASUREMENT", materialFieldId: sel.id, unit: sel.unit, options, allowMultiSelect: false, defaultOn: isDefault(sel.id) }));
    }
  }
  for (const num of fields.filter(f => (f.type === "number" || f.type === "area") && !usedQty.has(f.id))) {
    out.push(mergePrior({ id: num.id, name: num.label, pattern: "LABOR", quantityFieldId: num.id, unit: num.unit, laborRate: pricing[`${num.id}Rate`] ?? 0, options: opts(num), allowMultiSelect: false, defaultOn: isDefault(num.id) }));
  }
  // Toggles. Bucket by `field.group` when the group points at a KNOWN prior section (so a moved
  // toggle lands in its declared section instead of unconditionally going to _flat_fees). Anything
  // without a matching prior section falls into the legacy `_flat_fees` bucket.
  const toggles = fields.filter(f => f.type === "toggle");
  const optionForToggle = (t: SchemaField): SchemaOption => {
    const base = (optionsByField?.[t.id]?.[0]) || { id: t.id, label: t.label, rate: pricing[`${t.id}Rate`] ?? 0, unit: "flat" };
    // Carry linked/derived pricing from the field onto the option so the engine can price it.
    return { ...base, ...(t.linkedTo ? { linkedTo: t.linkedTo } : {}), ...(typeof t.multiplier === "number" ? { multiplier: t.multiplier } : {}) };
  };
  const bucketsById = new Map<string, SchemaField[]>();
  for (const t of toggles) {
    const targetId = (t.group && priorById.has(t.group)) ? t.group : "_flat_fees";
    if (!bucketsById.has(targetId)) bucketsById.set(targetId, []);
    bucketsById.get(targetId)!.push(t);
  }
  // Emit a section per bucket. The _flat_fees bucket gets the legacy default ("Fees & Options",
  // FLAT_RATE, allowMultiSelect:true); user-declared buckets reuse the prior section's metadata
  // (so the kernel's rename / allowMultiSelect / pattern survive) but get fresh options.
  for (const [bucketId, list] of bucketsById) {
    const options = list.map(optionForToggle);
    const prior = priorById.get(bucketId);
    if (prior) {
      out.push({ ...prior, options, itemFieldIds: list.map(f => f.id) });
    } else {
      // Default _flat_fees bucket — runs whenever there are toggles without a declared section.
      out.push({ id: "_flat_fees", name: "Fees & Options", pattern: "FLAT_RATE", itemFieldIds: list.map(f => f.id), options, allowMultiSelect: true, defaultOn: isDefault("_flat_fees") });
    }
  }
  // Empty-section survival: a section added via sectionsToAdd has no backing field yet, so neither
  // the selector loop nor the toggles bucket emit it. Append any prior section that's not already
  // represented in `out`, with its existing options carried through.
  for (const p of priorSections || []) {
    if (!out.some(o => o.id === p.id)) {
      out.push({ ...p, options: p.options || [] });
    }
  }
  return out;
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

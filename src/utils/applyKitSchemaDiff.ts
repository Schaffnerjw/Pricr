// Applies the new conversational-Kit SCHEMA_DIFF format to a (legacy) QuoteSchema. Pure: never
// mutates the input (returns a fresh object), never throws (failures land in `errors`), never evals.
// Field lookup reuses the exact same fuzzy normalize() as executeKitCommand so matching is consistent.
import { AddOn, QuoteSchema, SchemaField } from "../types";
import { normalize } from "./executeKitCommand";
import { slugId } from "./helpers";

export interface KitFieldUpdate {
  identifier: string;
  changes: {
    label?: string;
    rate?: number;
    unit?: string;
    type?: "toggle" | "number" | "select";
    linkedTo?: string;
    multiplier?: number;
    isOptional?: boolean;
  };
}
export interface KitFieldAdd {
  sectionIdentifier?: string;
  label: string;
  rate: number;
  unit: string;
  type: "toggle" | "number" | "select";
  linkedTo?: string;
  multiplier?: number;
}
export interface KitSchemaDiff {
  fieldsToUpdate?: KitFieldUpdate[];
  fieldsToAdd?: KitFieldAdd[];
  fieldsToRemove?: string[];
  addOnsToAdd?: { label: string; price: number; unit?: string }[];
  addOnsToUpdate?: { identifier: string; price?: number; label?: string }[];
  addOnsToRemove?: string[];
  depositPercent?: number | null;
}

const lower = (s?: string) => (s || "").toLowerCase().trim();

// Deep-enough clone of the parts a diff can touch (mirrors executeKitCommand.cloneSchema).
function cloneSchema(s: QuoteSchema): QuoteSchema {
  return {
    ...s,
    fields: (s.fields || []).map(f => ({ ...f, options: f.options ? [...f.options] : f.options })),
    pricing: { ...(s.pricing || {}) },
    addOns: (s.addOns || []).map(a => ({ ...a })),
    summaryLines: (s.summaryLines || []).map(l => ({ ...l })),
    sections: (s.sections || []).map(sec => ({ ...sec, options: (sec.options || []).map(o => ({ ...o })) })),
  };
}

// Tiered fuzzy lookup (exact id → exact label → normalized id → normalized label → partial). Returns
// the first item at the highest-priority tier, so a partial can never override an exact match.
function tieredFind<T>(items: T[], ident: string, idOf: (t: T) => string, labelOf: (t: T) => string): T | undefined {
  if (!ident) return undefined;
  const ni = normalize(ident), li = lower(ident);
  const tiers: ((t: T) => boolean)[] = [
    t => idOf(t) === ident,
    t => lower(labelOf(t)) === li,
    t => normalize(idOf(t)) === ni,
    t => normalize(labelOf(t)) === ni,
    t => { const nl = normalize(labelOf(t)); return !!nl && !!ni && (nl.includes(ni) || ni.includes(nl)); },
  ];
  for (const tier of tiers) { const m = items.find(tier); if (m) return m; }
  return undefined;
}

const mapType = (t?: string): SchemaField["type"] => (t === "select" ? "selector" : t === "number" ? "number" : t === "toggle" ? "toggle" : "number");
const unitFor = (type: SchemaField["type"], unit?: string): SchemaField["unit"] => (type === "toggle" ? "flat" : ((unit || "each") as SchemaField["unit"]));
const groupFor = (type: SchemaField["type"]): SchemaField["group"] => (type === "toggle" ? "fees" : type === "selector" ? "materials" : "dimensions");
const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

export function applyKitSchemaDiff(
  schema: QuoteSchema,
  diff: KitSchemaDiff,
): { schema: QuoteSchema; changes: string[]; errors: string[] } {
  const next = cloneSchema(schema);
  const changes: string[] = [];
  const errors: string[] = [];
  if (!diff || typeof diff !== "object") return { schema, changes, errors: ["Empty change"] };

  // ── fieldsToUpdate ──
  for (const u of diff.fieldsToUpdate || []) {
    if (!u || !u.identifier) continue;
    const f = tieredFind(next.fields || [], u.identifier, x => x.id, x => x.label);
    if (!f) { errors.push(`Couldn't find "${u.identifier}"`); continue; }
    const c = u.changes || {};
    const parts: string[] = [];
    if (c.label) { f.label = c.label; parts.push(`renamed to ${c.label}`); }
    if (c.type) { f.type = mapType(c.type); if (f.type === "toggle") f.unit = "flat"; parts.push(`type ${c.type}`); }
    if (c.unit && f.type !== "toggle") { f.unit = c.unit as SchemaField["unit"]; }
    if (typeof c.isOptional === "boolean") { f.isOptional = c.isOptional; parts.push(c.isOptional ? "optional" : "required"); }
    if (c.linkedTo) { f.linkedTo = c.linkedTo; }
    if (typeof c.multiplier === "number") { f.multiplier = c.multiplier; }
    if (typeof c.rate === "number") { next.pricing[`${f.id}Rate`] = c.rate; }
    if (c.linkedTo || typeof c.multiplier === "number") {
      const mult = typeof c.multiplier === "number" ? c.multiplier : (typeof c.rate === "number" ? c.rate : f.multiplier);
      parts.push(`linked to ${c.linkedTo || f.linkedTo}${typeof mult === "number" ? ` × ${money(mult)}` : ""}`);
    } else if (typeof c.rate === "number") {
      parts.push(`rate ${money(c.rate)}${c.unit ? `/${c.unit}` : ""}`);
    }
    changes.push(`Updated ${f.label}${parts.length ? `: ${parts.join(", ")}` : ""}`);
  }

  // ── fieldsToAdd ──
  for (const a of diff.fieldsToAdd || []) {
    if (!a || !a.label) continue;
    const used = new Set((next.fields || []).map(f => f.id));
    const id = slugId(a.label, used);
    const type = mapType(a.type);
    const field: SchemaField = {
      id, label: a.label, type, unit: unitFor(type, a.unit), group: groupFor(type),
      ...(type === "selector" ? { options: [] } : {}),
      ...(a.linkedTo ? { linkedTo: a.linkedTo } : {}),
      ...(typeof a.multiplier === "number" ? { multiplier: a.multiplier } : {}),
    };
    next.fields = [...(next.fields || []), field];
    next.pricing[`${id}Rate`] = Number(a.rate) || 0;
    if (a.linkedTo) changes.push(`Added ${a.label}: linked to ${a.linkedTo}${typeof a.multiplier === "number" ? ` × ${money(a.multiplier)}` : ""}`);
    else changes.push(`Added ${a.label} at ${money(Number(a.rate) || 0)} ${a.unit || (type === "toggle" ? "flat" : "each")}`);
  }

  // ── fieldsToRemove ──
  for (const ident of diff.fieldsToRemove || []) {
    const f = tieredFind(next.fields || [], ident, x => x.id, x => x.label);
    if (!f) { errors.push(`Couldn't find "${ident}" to remove`); continue; }
    next.fields = (next.fields || []).filter(x => x.id !== f.id);
    delete next.pricing[`${f.id}Rate`];
    for (const sec of next.sections || []) sec.options = (sec.options || []).filter(o => o.id !== f.id);
    changes.push(`Removed ${f.label}`);
  }

  // ── addOnsToAdd ──
  for (const a of diff.addOnsToAdd || []) {
    if (!a || !a.label) continue;
    const id = slugId(a.label, new Set((next.addOns || []).map(x => x.id)));
    next.addOns = [...(next.addOns || []), { id, label: a.label, price: Number(a.price) || 0 }];
    changes.push(`Added ${a.label} add-on at ${money(Number(a.price) || 0)} ${a.unit || "flat"}`);
  }

  // ── addOnsToUpdate ──
  for (const u of diff.addOnsToUpdate || []) {
    if (!u || !u.identifier) continue;
    const a = tieredFind<AddOn>(next.addOns || [], u.identifier, x => x.id, x => x.label);
    if (!a) { errors.push(`Couldn't find add-on "${u.identifier}"`); continue; }
    const parts: string[] = [];
    if (typeof u.price === "number") { a.price = u.price; parts.push(`price ${money(u.price)}`); }
    if (u.label) { a.label = u.label; parts.push(`renamed to ${u.label}`); }
    changes.push(`Updated ${a.label} add-on${parts.length ? `: ${parts.join(", ")}` : ""}`);
  }

  // ── addOnsToRemove ──
  for (const ident of diff.addOnsToRemove || []) {
    const a = tieredFind<AddOn>(next.addOns || [], ident, x => x.id, x => x.label);
    if (!a) { errors.push(`Couldn't find add-on "${ident}" to remove`); continue; }
    next.addOns = (next.addOns || []).filter(x => x.id !== a.id);
    changes.push(`Removed ${a.label} add-on`);
  }

  // ── depositPercent (null = unchanged) ──
  if (typeof diff.depositPercent === "number") {
    next.pricing.depositPercent = diff.depositPercent;
    (next as QuoteSchema & { depositPercent?: number }).depositPercent = diff.depositPercent;
    changes.push(`Set deposit to ${diff.depositPercent}%`);
  }

  return { schema: changes.length ? next : schema, changes, errors };
}

// Deterministic application of Kit's structured SCHEMA_UPDATE diff to a QuoteSchema. Operates on
// fields + pricing (the canonical inputs) — QuoteScreen re-derives sections/options from those, so a
// field/rate change immediately re-renders and re-prices. No formulas are executed here; nothing is
// guessed beyond a case-insensitive field-name match when no id is supplied.
import { FieldUnit, QuoteSchema, SchemaField } from "../types";
import { slugId } from "./helpers";

export interface KitSchemaUpdate {
  action: "update_field" | "add_field" | "remove_field" | "update_rate" | "change_type";
  fieldId?: string;
  fieldName?: string;
  changes?: { type?: string; rate?: number; label?: string; unit?: string; group?: string };
}

export interface KitApplyResult { schema: QuoteSchema; changed: boolean; summary: string }

const norm = (s?: string) => (s || "").toLowerCase().trim();
const TYPE_MAP: Record<string, SchemaField["type"]> = {
  number: "number", counter: "number", text: "number", area: "area",
  toggle: "toggle", "yes-no toggle": "toggle", "yes/no": "toggle",
  selector: "selector", select: "selector", dropdown: "selector",
};
const UNIT_MAP: Record<string, FieldUnit> = {
  "sq ft": "sqft", "sqft": "sqft", "square feet": "sqft",
  "lf": "lf", "linear ft": "lf", "linear feet": "lf",
  "flat": "flat", "each": "each", "hour": "hr", "hr": "hr",
  "percent": "percent", "room": "room", "load": "load", "vehicle": "vehicle", "ton": "ton",
};
const mapType = (t?: string): SchemaField["type"] | undefined => (t ? TYPE_MAP[norm(t)] : undefined);
const mapUnit = (u?: string): FieldUnit | undefined => (u ? (UNIT_MAP[norm(u)] || (u as FieldUnit)) : undefined);

export function applyKitSchemaUpdate(schema: QuoteSchema, u: KitSchemaUpdate): KitApplyResult {
  if (!schema || !u || !u.action) return { schema, changed: false, summary: "" };
  const fields: SchemaField[] = [...(schema.fields || [])];
  const pricing: Record<string, number> = { ...(schema.pricing || {}) };
  const c = u.changes || {};

  const findIdx = (): number => {
    let i = u.fieldId ? fields.findIndex(f => f.id === u.fieldId) : -1;
    if (i < 0 && u.fieldName) i = fields.findIndex(f => norm(f.label) === norm(u.fieldName) || norm(f.id) === norm(u.fieldName));
    if (i < 0 && u.fieldId) i = fields.findIndex(f => norm(f.label) === norm(u.fieldId)); // model sometimes puts the label in fieldId
    return i;
  };
  const done = (summary: string): KitApplyResult => ({ schema: { ...schema, fields, pricing }, changed: true, summary });
  const noop: KitApplyResult = { schema, changed: false, summary: "" };

  switch (u.action) {
    case "update_rate": {
      const i = findIdx();
      if (i < 0 || typeof c.rate !== "number") return noop;
      pricing[`${fields[i].id}Rate`] = c.rate;
      return done(`Updated ${fields[i].label} to $${c.rate.toLocaleString()}`);
    }
    case "update_field": {
      const i = findIdx();
      if (i < 0) return noop;
      const f = { ...fields[i] };
      if (c.label) f.label = c.label;
      const nt = mapType(c.type); if (nt) f.type = nt;
      const nu = mapUnit(c.unit); if (nu) f.unit = nu;
      if (f.type === "toggle") f.unit = "flat";
      if (c.group) f.group = c.group as SchemaField["group"];
      fields[i] = f;
      if (typeof c.rate === "number") pricing[`${f.id}Rate`] = c.rate;
      return done(`Updated ${f.label}`);
    }
    case "change_type": {
      const i = findIdx();
      const nt = mapType(c.type);
      if (i < 0 || !nt) return noop;
      const f = { ...fields[i], type: nt };
      if (nt === "toggle") f.unit = "flat";
      else { const nu = mapUnit(c.unit); if (nu) f.unit = nu; }
      fields[i] = f;
      if (typeof c.rate === "number") pricing[`${f.id}Rate`] = c.rate;
      return done(`Changed ${f.label} to a ${nt === "toggle" ? "yes/no" : nt} field`);
    }
    case "remove_field": {
      const i = findIdx();
      if (i < 0) return noop;
      const f = fields[i];
      fields.splice(i, 1);
      delete pricing[`${f.id}Rate`];
      return done(`Removed ${f.label}`);
    }
    case "add_field": {
      const used = new Set(fields.map(f => f.id));
      const label = c.label || u.fieldName || "New field";
      const id = u.fieldId && !used.has(u.fieldId) ? u.fieldId : slugId(label, used);
      const type = mapType(c.type) || "number";
      const unit: FieldUnit = type === "toggle" ? "flat" : (mapUnit(c.unit) || "each");
      const group = (c.group as SchemaField["group"]) || (type === "toggle" ? "fees" : "dimensions");
      const field: SchemaField = { id, label, type, unit, group, ...(type === "selector" ? { options: [] } : {}) };
      fields.push(field);
      if (typeof c.rate === "number") pricing[`${id}Rate`] = c.rate;
      return done(`Added ${label}`);
    }
    default:
      return noop;
  }
}

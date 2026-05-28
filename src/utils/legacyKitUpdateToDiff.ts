// Adapter for the legacy SCHEMA_UPDATE format → unified SCHEMA_DIFF.
// Preserves the original UNIT_MAP / TYPE_MAP normalization ("sq ft"→"sqft", "linear ft"→"lf",
// "dropdown"→"select") so persisted unit/type strings stay behavior-identical when the legacy
// fallback in QuoteScreen routes through applyKitSchemaDiff. Returning null means "nothing
// applicable" — caller treats it as a no-op.
import { KitFieldAdd, KitFieldUpdate, KitSchemaDiff } from "./applyKitSchemaDiff";

export interface KitSchemaUpdate {
  action: "update_field" | "add_field" | "remove_field" | "update_rate" | "change_type";
  fieldId?: string;
  fieldName?: string;
  changes?: { type?: string; rate?: number; label?: string; unit?: string; group?: string };
}

const norm = (s?: string) => (s || "").toLowerCase().trim();
const TYPE_MAP: Record<string, "number" | "toggle" | "select"> = {
  number: "number", counter: "number", text: "number",
  toggle: "toggle", "yes-no toggle": "toggle", "yes/no": "toggle",
  selector: "select", select: "select", dropdown: "select",
};
const UNIT_MAP: Record<string, string> = {
  "sq ft": "sqft", "sqft": "sqft", "square feet": "sqft",
  "lf": "lf", "linear ft": "lf", "linear feet": "lf",
  "flat": "flat", "each": "each", "hour": "hr", "hr": "hr",
  "percent": "percent", "room": "room", "load": "load", "vehicle": "vehicle", "ton": "ton",
};
const mapType = (t?: string): "number" | "toggle" | "select" | undefined => (t ? TYPE_MAP[norm(t)] : undefined);
const mapUnit = (u?: string): string | undefined => (u ? (UNIT_MAP[norm(u)] || u) : undefined);

export function legacyKitUpdateToDiff(u: KitSchemaUpdate | null | undefined): KitSchemaDiff | null {
  if (!u || !u.action) return null;
  const c = u.changes || {};
  const ident = u.fieldId || u.fieldName || "";

  switch (u.action) {
    case "update_rate": {
      if (typeof c.rate !== "number" || !ident) return null;
      return { fieldsToUpdate: [{ identifier: ident, changes: { rate: c.rate } }] };
    }
    case "update_field": {
      if (!ident) return null;
      const changes: KitFieldUpdate["changes"] = {};
      if (c.label) changes.label = c.label;
      const nt = mapType(c.type); if (nt) changes.type = nt;
      const nu = mapUnit(c.unit); if (nu) changes.unit = nu;
      if (typeof c.rate === "number") changes.rate = c.rate;
      return { fieldsToUpdate: [{ identifier: ident, changes }] };
    }
    case "change_type": {
      if (!ident) return null;
      const nt = mapType(c.type);
      if (!nt) return null;
      const changes: KitFieldUpdate["changes"] = { type: nt };
      if (c.label) changes.label = c.label;
      if (nt !== "toggle") { const nu = mapUnit(c.unit); if (nu) changes.unit = nu; }
      if (typeof c.rate === "number") changes.rate = c.rate;
      return { fieldsToUpdate: [{ identifier: ident, changes }] };
    }
    case "remove_field": {
      if (!ident) return null;
      return { fieldsToRemove: [ident] };
    }
    case "add_field": {
      const label = c.label || u.fieldName || "New field";
      const type = mapType(c.type) || "number";
      const unit = type === "toggle" ? "flat" : (mapUnit(c.unit) || "each");
      const rate = typeof c.rate === "number" ? c.rate : 0;
      const add: KitFieldAdd = { label, rate, unit, type };
      return { fieldsToAdd: [add] };
    }
    default:
      return null;
  }
}

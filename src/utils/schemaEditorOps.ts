// Pure, deterministic operations for the manual Schema Editor (Settings only). Each returns a NEW
// schema (never mutates input) and never throws. Field-adding ops delegate to the already-tested
// applyKitSchemaDiff so the editor and Kit write through the exact same vetted mutators.
import { QuoteSchema, SchemaField, SchemaVersion, SchemaVersionSource, User } from "../types";
import { SchemaOption } from "../types/schema";
import { isAdminRole } from "../hooks/useIsAdmin";
import { applyKitSchemaDiff } from "./applyKitSchemaDiff";
import { slugId } from "./helpers";

// Only admins/superadmins may edit the quote tool — the editor renders a permission gate otherwise.
export const canEditSchema = (user?: Pick<User, "role"> | null): boolean => isAdminRole(user);

// "Something you measure" → a number field priced per unit.
export function addMeasurementField(schema: QuoteSchema, name: string, rate: number, unit: string): QuoteSchema {
  return applyKitSchemaDiff(schema, { fieldsToAdd: [{ label: name, rate, unit, type: "number" }] }).schema;
}

// "Something you include or not" → a flat on/off toggle.
export function addToggleField(schema: QuoteSchema, name: string, price: number): QuoteSchema {
  return applyKitSchemaDiff(schema, { fieldsToAdd: [{ label: name, rate: price, unit: "flat", type: "toggle" }] }).schema;
}

// "Calculates from another field" → a toggle whose amount = source qty × multiplier.
export function addCalculatedField(schema: QuoteSchema, name: string, linkedTo: string, multiplier: number): QuoteSchema {
  return applyKitSchemaDiff(schema, { fieldsToAdd: [{ label: name, rate: 0, unit: "flat", type: "toggle", linkedTo, multiplier }] }).schema;
}

// "Pick one from a list" → a selector field with priced options. applyKitSchemaDiff can't carry option
// rates, so this builds the selector directly (still pure, still never mutates input).
export function addSelectField(schema: QuoteSchema, name: string, options: { label: string; rate: number; unit?: string }[]): QuoteSchema {
  const next: QuoteSchema = {
    ...schema,
    fields: (schema.fields || []).map(f => ({ ...f })),
    pricing: { ...(schema.pricing || {}) },
  };
  const id = slugId(name, new Set((next.fields || []).map(f => f.id)));
  const optionLabels = options.map(o => o.label).filter(Boolean);
  const field: SchemaField = { id, label: name, type: "selector", unit: (options[0]?.unit || "each") as SchemaField["unit"], group: "materials", options: optionLabels };
  next.fields = [...(next.fields || []), field];
  // Mirror option rates into pricing keyed by option slug so deriveSections/hints resolve them.
  for (const o of options) { if (o.label) next.pricing[`${slugId(o.label, new Set())}Rate`] = Number(o.rate) || 0; }
  return next;
}

// Move a field within schema.fields (drives section order via deriveSections). Pure; out-of-range
// indices are clamped/no-op. Used by the editor's drag / up-down reorder controls.
export function reorderFields(schema: QuoteSchema, fromIndex: number, toIndex: number): QuoteSchema {
  const fields = (schema.fields || []).map(f => ({ ...f }));
  if (fromIndex < 0 || fromIndex >= fields.length) return schema;
  const to = Math.max(0, Math.min(fields.length - 1, toIndex));
  const [moved] = fields.splice(fromIndex, 1);
  fields.splice(to, 0, moved);
  return { ...schema, fields };
}

// Toggle a section's allowMultiSelect property. Routes through the same applyKitSchemaDiff kernel
// path Kit uses so any rule changes (whitelist, persistence semantics) apply uniformly. Returns the
// input schema unchanged on kernel failure (an unknown section id — defensive, the editor passes
// real ids derived from the live draft so this branch should never fire in practice).
export function setSectionAllowMultiSelect(schema: QuoteSchema, sectionId: string, allowMultiSelect: boolean): QuoteSchema {
  const r = applyKitSchemaDiff(schema, { sectionsToSetProperty: [{ sectionIdentifier: sectionId, property: "allowMultiSelect", value: allowMultiSelect }] });
  return r.changes.length > 0 ? r.schema : schema;
}

// Toggle a section's "default on" flag (pre-selected on new quotes). Persists to schema.defaultSectionIds
// (stable across deriveSections) AND mirrors onto schema.sections[].defaultOn when sections are present.
export function setSectionDefault(schema: QuoteSchema, sectionId: string, defaultOn: boolean): QuoteSchema {
  const ids = new Set(schema.defaultSectionIds || []);
  if (defaultOn) ids.add(sectionId); else ids.delete(sectionId);
  return {
    ...schema,
    defaultSectionIds: Array.from(ids),
    sections: (schema.sections || []).map(sec => sec.id === sectionId ? { ...sec, defaultOn } : sec),
  };
}

// Append a version-history entry, keeping only the most recent 5. Pure.
export function pushSchemaVersion(history: SchemaVersion[] | undefined, schema: QuoteSchema, source: SchemaVersionSource, timestamp = Date.now()): SchemaVersion[] {
  return [{ timestamp, source, schema }, ...(history || [])].slice(0, 5);
}

// Map of section id → true for every section flagged defaultOn. Used by QuoteScreen to pre-select
// common sections on a new quote (saves the rep several taps).
export function defaultActiveSections(sections: { id: string; defaultOn?: boolean }[] | undefined): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const sec of sections || []) { if (sec.defaultOn) out[sec.id] = true; }
  return out;
}

// Re-export so editor consumers have the option type handy.
export type { SchemaOption };

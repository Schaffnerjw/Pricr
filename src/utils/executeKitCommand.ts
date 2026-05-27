// Pure, deterministic executor for Kit commands. NEVER mutates the input schema (returns a fresh
// object via clones), NEVER throws (all failures land in result.error), NEVER calls an API or eval.
//
// Field lookup order: sections[].options[] → fields[] → addOns[] (by id, then case-insensitive label).
// Because QuoteScreen re-derives sections from fields+pricing, rate/structure edits are written to the
// AUTHORITATIVE fields+pricing (and mirrored into a matching section option when present) so the change
// survives re-derivation. Schemas that carry only sections (no fields) are edited in-place on options.
import { AddOn, QuoteSchema, QuoteSection, SchemaField } from "../types";
import { SchemaOption } from "../types/schema";
import { slugId } from "./helpers";
import { logger } from "./logger";
import { KitCommand, KitCommandResult } from "./kitCommands";

const lower = (s?: string) => (s || "").toLowerCase().trim();
// "Frame Protection ($0.50/sqft)" → "frameprotection050sqft". Used for forgiving (but exact-first) matching.
// Exported so applyKitSchemaDiff reuses the exact same fuzzy normalization.
export const normalize = (s?: string) => lower(s).replace(/[^a-z0-9]/g, "");

// Deep-enough clone of the parts a command can touch.
function cloneSchema(s: QuoteSchema): QuoteSchema {
  return {
    ...s,
    fields: (s.fields || []).map(f => ({ ...f, options: f.options ? [...f.options] : f.options })),
    pricing: { ...(s.pricing || {}) },
    addOns: (s.addOns || []).map(a => ({ ...a })),
    summaryLines: (s.summaryLines || []).map(l => ({ ...l })),
    sections: (s.sections || []).map(sec => ({ ...sec, options: (sec.options || []).map(o => ({ ...o })), itemFieldIds: sec.itemFieldIds ? [...sec.itemFieldIds] : sec.itemFieldIds })),
  };
}

// Tiered match — returns the first item matching at the highest-priority tier. Partial (tier 5) is the
// LAST resort, so exact id/label matches always win and a partial can never override an exact one.
function tieredMatch<T>(items: T[], ident: string, idOf: (t: T) => string, labelOf: (t: T) => string): T | undefined {
  if (!ident) return undefined;
  const ni = normalize(ident), li = lower(ident);
  const tiers: ((t: T) => boolean)[] = [
    t => idOf(t) === ident,                                   // 1: exact id
    t => lower(labelOf(t)) === li,                            // 2: exact label (case-insensitive)
    t => normalize(idOf(t)) === ni,                           // 3: normalized id
    t => normalize(labelOf(t)) === ni,                        // 4: normalized label
    t => { const nl = normalize(labelOf(t)); return !!nl && !!ni && (nl.includes(ni) || ni.includes(nl)); }, // 5: partial
  ];
  for (const tier of tiers) { const m = items.find(tier); if (m) return m; }
  return undefined;
}

type Target =
  | { kind: "option"; section: QuoteSection; option: SchemaOption }
  | { kind: "field"; field: SchemaField }
  | { kind: "addon"; addon: AddOn };
const targetId = (t: Target) => (t.kind === "option" ? t.option.id : t.kind === "field" ? t.field.id : t.addon.id);
const targetLabel = (t: Target) => (t.kind === "option" ? t.option.label : t.kind === "field" ? t.field.label : t.addon.label);

// Resolve a field identifier across ALL locations — section options → fields → add-ons (location
// priority) and exact-before-partial (tier priority within the flattened list).
function resolveTarget(s: QuoteSchema, ident: string): Target | null {
  logger.debug("[KitLookup] searching for:", ident);
  logger.debug("[KitLookup] schema.fields:", (s.fields || []).map(f => f.id + "|" + f.label));
  logger.debug("[KitLookup] schema.sections options:", (s.sections || []).flatMap(sec => (sec.options || []).map(o => o.id + "|" + o.label)));
  logger.debug("[KitLookup] schema.addOns:", (s.addOns || []).map(a => a.id + "|" + a.label));
  const targets: Target[] = [
    ...(s.sections || []).flatMap(section => (section.options || []).map(option => ({ kind: "option", section, option } as Target))),
    ...(s.fields || []).map(field => ({ kind: "field", field } as Target)),
    ...(s.addOns || []).map(addon => ({ kind: "addon", addon } as Target)),
  ];
  return tieredMatch(targets, ident, targetId, targetLabel) || null;
}

// Comma-separated list of every referenceable name, so a not-found error lets Kit self-correct.
function availableFields(s: QuoteSchema): string {
  const labels = [
    ...(s.sections || []).flatMap(sec => (sec.options || []).map(o => o.label)),
    ...(s.fields || []).map(f => f.label),
    ...(s.addOns || []).map(a => a.label),
  ];
  return Array.from(new Set(labels.filter(Boolean))).join(", ");
}
const notFound = (s: QuoteSchema, ident: string) => `Field "${ident}" not found. Available fields: ${availableFields(s)}`;
function findAddon(s: QuoteSchema, ident: string): AddOn | undefined {
  return tieredMatch(s.addOns || [], ident, a => a.id, a => a.label);
}

const ok = (schema: QuoteSchema, command: KitCommand, description: string): { schema: QuoteSchema; result: KitCommandResult } =>
  ({ schema, result: { success: true, command, description } });
const fail = (schema: QuoteSchema, command: KitCommand, error: string): { schema: QuoteSchema; result: KitCommandResult } =>
  ({ schema, result: { success: false, command, description: "", error } });

export function executeKitCommand(schema: QuoteSchema, command: KitCommand): { schema: QuoteSchema; result: KitCommandResult } {
  if (!command || !command.type) return fail(schema, command, "No command");
  const next = cloneSchema(schema);

  switch (command.type) {
    case "NO_CHANGE":
      return ok(schema, command, "No change");

    case "UPDATE_DEPOSIT": {
      next.pricing.depositPercent = command.percent;
      (next as QuoteSchema & { depositPercent?: number }).depositPercent = command.percent; // mirror for compatibility
      return ok(next, command, `Set deposit to ${command.percent}%`);
    }

    case "UPDATE_TRADE":
      next.trade = command.trade;
      return ok(next, command, `Set trade to ${command.trade}`);

    case "UPDATE_RATE": {
      const t = resolveTarget(next, command.fieldIdentifier);
      logger.debug("[KitLookup] UPDATE_RATE resolved:", t ? `${t.kind}:${targetId(t)}` : "none");
      if (!t) return fail(schema, command, notFound(next, command.fieldIdentifier));
      if (t.kind === "option") {
        t.option.rate = command.newRate;
        if (command.unit) t.option.unit = command.unit;
        next.pricing[`${t.option.id}Rate`] = command.newRate; // keep re-derive consistent
        return ok(next, command, `Updated ${t.option.label} to $${command.newRate}`);
      }
      if (t.kind === "field") { next.pricing[`${t.field.id}Rate`] = command.newRate; return ok(next, command, `Updated ${t.field.label} to $${command.newRate}`); }
      t.addon.price = command.newRate;
      return ok(next, command, `Updated ${t.addon.label} to $${command.newRate}`);
    }

    case "RENAME_FIELD": {
      // Keep the id (and its pricing key) stable; only relabel — renaming the id would orphan rates.
      const t = resolveTarget(next, command.fieldIdentifier);
      if (!t) return fail(schema, command, notFound(next, command.fieldIdentifier));
      if (t.kind === "option") t.option.label = command.newLabel;
      else if (t.kind === "field") t.field.label = command.newLabel;
      else t.addon.label = command.newLabel;
      return ok(next, command, `Renamed to ${command.newLabel}`);
    }

    case "CHANGE_FIELD_TYPE": {
      const t = resolveTarget(next, command.fieldIdentifier);
      if (!t) return fail(schema, command, notFound(next, command.fieldIdentifier));
      const fieldId = t.kind === "field" ? t.field.id : t.kind === "option" ? t.option.id : null;
      const f = fieldId ? (next.fields || []).find(x => x.id === fieldId) : null;
      if (!f) return fail(schema, command, `"${command.fieldIdentifier}" can't change type (no underlying field).`);
      f.type = command.newType === "select" ? "selector" : command.newType;
      if (f.type === "toggle") f.unit = "flat";
      return ok(next, command, `Changed ${f.label} to ${command.newType}`);
    }

    case "ADD_FIELD": {
      const used = new Set((next.fields || []).map(f => f.id));
      const id = slugId(command.label, used);
      const type: SchemaField["type"] = command.fieldType === "select" ? "selector" : command.fieldType;
      const unit = (type === "toggle" ? "flat" : command.unit || "each") as SchemaField["unit"];
      const group = (type === "toggle" ? "fees" : "dimensions") as SchemaField["group"];
      next.fields = [...(next.fields || []), { id, label: command.label, type, unit, group, ...(type === "selector" ? { options: [] } : {}) }];
      next.pricing[`${id}Rate`] = command.rate;
      // Mirror into a matching section's options for an immediate view; otherwise create a section so a
      // sections-only schema also reflects the add. QuoteScreen re-derives from fields anyway.
      const option: SchemaOption = { id, label: command.label, rate: command.rate, unit: String(unit) };
      const sec = tieredMatch(next.sections || [], command.sectionIdentifier, x => x.id, x => x.name);
      if (sec) sec.options = [...(sec.options || []), option];
      else if ((next.sections || []).length) next.sections = [...(next.sections || []), { id: slugId(command.sectionIdentifier || command.label, new Set()), name: command.sectionIdentifier || command.label, pattern: type === "toggle" ? "FLAT_RATE" : "MATERIAL_MEASUREMENT", options: [option], allowMultiSelect: type !== "selector" }];
      return ok(next, command, `Added ${command.label}`);
    }

    case "REMOVE_FIELD": {
      const t = resolveTarget(next, command.fieldIdentifier);
      if (!t) return fail(schema, command, notFound(next, command.fieldIdentifier));
      if (t.kind === "addon") {
        next.addOns = (next.addOns || []).filter(x => x.id !== t.addon.id);
        return ok(next, command, `Removed ${t.addon.label}`);
      }
      const fieldId = t.kind === "option" ? t.option.id : t.field.id;
      const label = t.kind === "option" ? t.option.label : t.field.label;
      next.fields = (next.fields || []).filter(x => x.id !== fieldId);
      delete next.pricing[`${fieldId}Rate`];
      // Pull the matching option out of every section, then drop any section left with no options.
      for (const sec of next.sections || []) sec.options = (sec.options || []).filter(o => o.id !== fieldId);
      next.sections = (next.sections || []).filter(sec => !Array.isArray(sec.options) || sec.options.length > 0);
      return ok(next, command, `Removed ${label}`);
    }

    case "ADD_SECTION": {
      const id = slugId(command.name, new Set((next.sections || []).map(s => s.id)));
      next.sections = [...(next.sections || []), { id, name: command.name, pattern: (command.pattern as QuoteSection["pattern"]) || "MATERIAL_MEASUREMENT", options: [], allowMultiSelect: true }];
      return ok(next, command, `Added section ${command.name}`);
    }

    case "REMOVE_SECTION": {
      const sec = tieredMatch(next.sections || [], command.sectionIdentifier, x => x.id, x => x.name);
      if (!sec) return fail(schema, command, `Section "${command.sectionIdentifier}" not found`);
      next.sections = (next.sections || []).filter(s => s.id !== sec.id);
      return ok(next, command, `Removed section ${sec.name}`);
    }

    case "ADD_ADDON": {
      const id = slugId(command.label, new Set((next.addOns || []).map(a => a.id)));
      next.addOns = [...(next.addOns || []), { id, label: command.label, price: command.price }];
      return ok(next, command, `Added add-on ${command.label}`);
    }

    case "UPDATE_ADDON": {
      const a = findAddon(next, command.addonIdentifier);
      if (!a) return fail(schema, command, `Add-on "${command.addonIdentifier}" not found`);
      if (typeof command.newPrice === "number") a.price = command.newPrice;
      if (command.newLabel) a.label = command.newLabel;
      return ok(next, command, `Updated add-on ${a.label}`);
    }

    case "REMOVE_ADDON": {
      const a = findAddon(next, command.addonIdentifier);
      if (!a) return fail(schema, command, `Add-on "${command.addonIdentifier}" not found`);
      next.addOns = (next.addOns || []).filter(x => x.id !== a.id);
      return ok(next, command, `Removed add-on ${a.label}`);
    }

    default:
      return fail(schema, command, "Unknown command");
  }
}

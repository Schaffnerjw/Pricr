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
import { KitCommand, KitCommandResult } from "./kitCommands";

const norm = (s?: string) => (s || "").toLowerCase().trim();
const flatNorm = (s?: string) => norm(s).replace(/[^a-z0-9]/g, "");

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

const matchByIdOrLabel = (idOrLabel: string, id: string, label: string): boolean =>
  norm(idOrLabel) === norm(id) || norm(idOrLabel) === norm(label) || flatNorm(idOrLabel) === flatNorm(label) || flatNorm(idOrLabel) === flatNorm(id);

function findField(s: QuoteSchema, ident: string): SchemaField | undefined {
  return (s.fields || []).find(f => matchByIdOrLabel(ident, f.id, f.label));
}
function findOption(s: QuoteSchema, ident: string): { section: QuoteSection; option: SchemaOption } | undefined {
  for (const section of s.sections || []) {
    const option = (section.options || []).find(o => matchByIdOrLabel(ident, o.id, o.label));
    if (option) return { section, option };
  }
  return undefined;
}
function findAddon(s: QuoteSchema, ident: string): AddOn | undefined {
  return (s.addOns || []).find(a => matchByIdOrLabel(ident, a.id, a.label));
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
      const opt = findOption(next, command.fieldIdentifier);
      if (opt) {
        opt.option.rate = command.newRate;
        if (command.unit) opt.option.unit = command.unit;
        next.pricing[`${opt.option.id}Rate`] = command.newRate; // keep re-derive consistent
        return ok(next, command, `Updated ${opt.option.label} to $${command.newRate}`);
      }
      const f = findField(next, command.fieldIdentifier);
      if (f) {
        next.pricing[`${f.id}Rate`] = command.newRate;
        return ok(next, command, `Updated ${f.label} to $${command.newRate}`);
      }
      const a = findAddon(next, command.fieldIdentifier);
      if (a) { a.price = command.newRate; return ok(next, command, `Updated ${a.label} to $${command.newRate}`); }
      return fail(schema, command, `Field "${command.fieldIdentifier}" not found`);
    }

    case "RENAME_FIELD": {
      // Keep the id (and its pricing key) stable; only relabel — renaming the id would orphan rates.
      const f = findField(next, command.fieldIdentifier);
      if (f) { f.label = command.newLabel; return ok(next, command, `Renamed to ${command.newLabel}`); }
      const opt = findOption(next, command.fieldIdentifier);
      if (opt) { opt.option.label = command.newLabel; return ok(next, command, `Renamed to ${command.newLabel}`); }
      const a = findAddon(next, command.fieldIdentifier);
      if (a) { a.label = command.newLabel; return ok(next, command, `Renamed to ${command.newLabel}`); }
      return fail(schema, command, `Field "${command.fieldIdentifier}" not found`);
    }

    case "CHANGE_FIELD_TYPE": {
      const f = findField(next, command.fieldIdentifier);
      if (!f) return fail(schema, command, `Field "${command.fieldIdentifier}" not found`);
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
      const sec = (next.sections || []).find(x => matchByIdOrLabel(command.sectionIdentifier, x.id, x.name) || norm(x.name).includes(norm(command.sectionIdentifier)));
      if (sec) sec.options = [...(sec.options || []), option];
      else if ((next.sections || []).length) next.sections = [...(next.sections || []), { id: slugId(command.sectionIdentifier || command.label, new Set()), name: command.sectionIdentifier || command.label, pattern: type === "toggle" ? "FLAT_RATE" : "MATERIAL_MEASUREMENT", options: [option], allowMultiSelect: type !== "selector" }];
      return ok(next, command, `Added ${command.label}`);
    }

    case "REMOVE_FIELD": {
      const f = findField(next, command.fieldIdentifier);
      if (f) {
        next.fields = (next.fields || []).filter(x => x.id !== f.id);
        delete next.pricing[`${f.id}Rate`];
      }
      const opt = findOption(next, command.fieldIdentifier);
      if (opt) {
        opt.section.options = (opt.section.options || []).filter(o => o.id !== opt.option.id);
        delete next.pricing[`${opt.option.id}Rate`];
        if ((opt.section.options || []).length === 0) next.sections = (next.sections || []).filter(s => s.id !== opt.section.id);
      }
      if (!f && !opt) return fail(schema, command, `Field "${command.fieldIdentifier}" not found`);
      return ok(next, command, `Removed ${f?.label || opt?.option.label || command.fieldIdentifier}`);
    }

    case "ADD_SECTION": {
      const id = slugId(command.name, new Set((next.sections || []).map(s => s.id)));
      next.sections = [...(next.sections || []), { id, name: command.name, pattern: (command.pattern as QuoteSection["pattern"]) || "MATERIAL_MEASUREMENT", options: [], allowMultiSelect: true }];
      return ok(next, command, `Added section ${command.name}`);
    }

    case "REMOVE_SECTION": {
      const sec = (next.sections || []).find(x => matchByIdOrLabel(command.sectionIdentifier, x.id, x.name));
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

// Maps the QuoteScreen field-value state ↔ the strict engine model. Centralized so the screen and
// computeTotals() read selections the same way (no divergent interpretations of the state).
import { QuoteSchema, QuoteSection } from "../types";
import { AddOnSelection, QuoteSelections } from "../types/lineItems";
import { SchemaOption, SchemaSection } from "../types/schema";

// Multi-select per-item keys live in fieldValues under these names (the option LABEL is the suffix,
// matching what QuoteScreen writes when the rep taps an independent item).
export const selKey = (materialFieldId: string, label: string) => `${materialFieldId}::sel::${label}`;
export const qtyKey = (materialFieldId: string, label: string) => `${materialFieldId}::qty::${label}`;

// A section carries explicit option metadata (built by buildSchemaFromVerified / deriveSections).
export const sectionHasOptions = (s: QuoteSection): boolean => Array.isArray(s.options) && s.options.length > 0;

// True when the schema can be priced by the engine (every priced section carries option ids+rates).
export function schemaUsesEngine(schema?: QuoteSchema | null): boolean {
  const sections = schema?.sections || [];
  return sections.length > 0 && sections.some(sectionHasOptions);
}

// Legacy superset QuoteSection → strict engine SchemaSection.
export function toStrictSections(sections?: QuoteSection[]): SchemaSection[] {
  return (sections || []).map(s => ({
    id: s.id,
    name: s.name,
    pattern: s.pattern,
    options: (s.options || []) as SchemaOption[],
    quantityUnit: s.unit,
    quantityFieldId: s.quantityFieldId,
    allowMultiSelect: !!s.allowMultiSelect,
  }));
}

// Build engine selections from the screen's fieldValues, mapping selected option LABELS → option IDs
// by EXACT equality (labels are unique within a section; this is an id lookup, never a fuzzy match).
export function selectionsFromFieldValues(schema: QuoteSchema, fieldValues: Record<string, any>): QuoteSelections {
  const out: QuoteSelections = {};
  for (const sec of schema?.sections || []) {
    const options = sec.options || [];
    if (sec.pattern === "FLAT_RATE") {
      const optionIds = options.filter(o => fieldValues[o.id]).map(o => o.id);
      if (optionIds.length) out[sec.id] = { optionIds, quantities: {} };
      continue;
    }
    if (sec.pattern === "LABOR") {
      const qty = Number(fieldValues[sec.quantityFieldId || ""]) || 0;
      const opt = options[0];
      if (opt && qty > 0) out[sec.id] = { optionIds: [opt.id], quantities: { [opt.id]: qty } };
      continue;
    }
    // MATERIAL_MEASUREMENT (and SYSTEM_CONFIG_QUANTITY)
    const matId = sec.materialFieldId || sec.id;
    if (sec.allowMultiSelect) {
      const optionIds: string[] = [];
      const quantities: Record<string, number> = {};
      for (const o of options) {
        if (fieldValues[selKey(matId, o.label)]) {
          optionIds.push(o.id);
          quantities[o.id] = Number(fieldValues[qtyKey(matId, o.label)]) || 0;
        }
      }
      if (optionIds.length) out[sec.id] = { optionIds, quantities };
    } else {
      const label = fieldValues[matId];
      const opt = options.find(o => o.label === label);
      if (opt) {
        const q = sec.quantityFieldId ? (Number(fieldValues[sec.quantityFieldId]) || 0) : 1;
        out[sec.id] = { optionIds: [opt.id], quantities: { [opt.id]: q } };
      }
    }
  }
  return out;
}

export function addOnSelectionsFrom(schema: QuoteSchema, addOnIds: string[]): AddOnSelection[] {
  return (addOnIds || [])
    .map(id => { const a = schema?.addOns?.find(x => x.id === id); return a ? { id: a.id, label: a.label, price: a.price || 0 } : null; })
    .filter((x): x is AddOnSelection => !!x);
}

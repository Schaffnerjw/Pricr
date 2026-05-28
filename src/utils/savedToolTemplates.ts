// Pure list helpers for the user's saved tool-templates (the SHAPE of the tool, not a quote draft).
// Distinct from QuoteTemplate (which stores fieldValues for a starting-point quote). The schema
// itself is just stashed verbatim in the config jsonb — no migration needed.
import { QuoteSchema, SavedToolTemplate } from "../types";

let seq = 0;
const newId = () => `stpl_${Date.now()}_${seq++}`;

// Add a fresh template (newest first). Replaces any existing template with the same (trimmed) name.
export function addSavedToolTemplate(
  list: SavedToolTemplate[] | undefined,
  name: string,
  schema: QuoteSchema,
  tradeName?: string,
): SavedToolTemplate[] {
  const safeName = (name || "").trim() || "Untitled tool";
  const entry: SavedToolTemplate = {
    id: newId(), name: safeName, timestamp: Date.now(),
    schema: cloneSchema(schema),
    ...(tradeName ? { tradeName } : {}),
  };
  const without = (list || []).filter(t => t.name.trim().toLowerCase() !== safeName.toLowerCase());
  return [entry, ...without];
}

export function removeSavedToolTemplate(list: SavedToolTemplate[] | undefined, id: string): SavedToolTemplate[] {
  return (list || []).filter(t => t.id !== id);
}

// Make a fresh copy of an existing template (own id + timestamp + " (copy)" name).
export function duplicateSavedToolTemplate(list: SavedToolTemplate[] | undefined, id: string): SavedToolTemplate[] {
  const src = (list || []).find(t => t.id === id);
  if (!src) return list || [];
  const copy: SavedToolTemplate = { id: newId(), name: `${src.name} (copy)`, timestamp: Date.now(), schema: cloneSchema(src.schema), tradeName: src.tradeName };
  return [copy, ...(list || [])];
}

export function getSavedToolTemplate(list: SavedToolTemplate[] | undefined, id: string): SavedToolTemplate | undefined {
  return (list || []).find(t => t.id === id);
}

// Deep-enough clone of the parts a saved template needs (mirrors executeKitCommand's cloneSchema).
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

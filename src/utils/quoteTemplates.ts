// Pure helpers for saved quote templates (stored in business config.quoteTemplates). Never mutate input.
import { QuoteTemplate } from "../types";

let tplSeq = 0;
const newTemplateId = () => `tpl_${Date.now()}_${tplSeq++}`;

// Add a template to the front of the list. Replaces any existing template with the same (trimmed) name.
export function addTemplate(
  list: QuoteTemplate[] | undefined,
  t: { name: string; fieldValues: Record<string, any>; activeSections?: Record<string, boolean>; selectedAddOns?: string[] },
): QuoteTemplate[] {
  const name = (t.name || "").trim() || "Untitled template";
  const entry: QuoteTemplate = {
    id: newTemplateId(), name,
    fieldValues: { ...(t.fieldValues || {}) },
    activeSections: t.activeSections ? { ...t.activeSections } : undefined,
    selectedAddOns: t.selectedAddOns ? [...t.selectedAddOns] : undefined,
    createdAt: Date.now(),
  };
  const without = (list || []).filter(x => x.name.trim().toLowerCase() !== name.toLowerCase());
  return [entry, ...without];
}

// What a new quote should be pre-filled with when starting from a template.
export function templateToInitialValues(t: QuoteTemplate): { fieldValues: Record<string, any>; activeSections?: Record<string, boolean>; selectedAddOns?: string[] } {
  return { fieldValues: { ...(t.fieldValues || {}) }, activeSections: t.activeSections ? { ...t.activeSections } : undefined, selectedAddOns: t.selectedAddOns ? [...t.selectedAddOns] : undefined };
}

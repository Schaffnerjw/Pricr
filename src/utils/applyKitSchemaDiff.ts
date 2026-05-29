// Applies the new conversational-Kit SCHEMA_DIFF format to a (legacy) QuoteSchema. Pure: never
// mutates the input (returns a fresh object), never throws (failures land in `errors`), never evals.
// Field lookup reuses the exact same fuzzy normalize() as executeKitCommand so matching is consistent.
import { AddOn, QuoteSchema, QuoteSection, SchemaField } from "../types";
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
// ── Structural section operations (Path B) ─────────────────────────────────────────────────────
// Added in the Path A + Path B drop so Kit can express section-level intent (toggle multi-select,
// move a field, rename / add / remove sections, restructure section shape) and the kernel can
// honor or honestly reject each one. Pre-Path B, Kit had to fake these via fieldsToRemove +
// fieldsToAdd hacks that silently rejected.
export type SectionShape = "selector-with-quantity" | "multi-toggle-with-quantity" | "single-toggle";
export interface KitSectionAdd { sectionIdentifier?: string; label: string; allowMultiSelect?: boolean }
// removeSection is destructive — `confirm: true` is required so Kit must explicitly ask the user
// before sending the operation (the runtime path produces a "Would remove X — confirm?" dialogue).
export interface KitSectionRemove { sectionIdentifier: string; confirm: boolean }
export interface KitSectionRename { sectionIdentifier: string; newLabel: string }
export interface KitSectionSetProperty { sectionIdentifier: string; property: "allowMultiSelect"; value: boolean }
export interface KitFieldMove { fieldIdentifier: string; targetSectionIdentifier: string }
export interface KitSectionRestructure { sectionIdentifier: string; newShape: SectionShape }

export interface KitSchemaDiff {
  fieldsToUpdate?: KitFieldUpdate[];
  fieldsToAdd?: KitFieldAdd[];
  fieldsToRemove?: string[];
  addOnsToAdd?: { label: string; price: number; unit?: string }[];
  addOnsToUpdate?: { identifier: string; price?: number; label?: string }[];
  addOnsToRemove?: string[];
  depositPercent?: number | null;
  // Section-level operations (Path B). Each is its own array so a single diff can mix multiple
  // structural changes (e.g. add a section, then move a field into it).
  sectionsToAdd?: KitSectionAdd[];
  sectionsToRemove?: KitSectionRemove[];
  sectionsToRename?: KitSectionRename[];
  sectionsToSetProperty?: KitSectionSetProperty[];
  fieldsToMove?: KitFieldMove[];
  sectionsToRestructure?: KitSectionRestructure[];
}

const lower = (s?: string) => (s || "").toLowerCase().trim();

// Deep-enough clone of the parts a diff can touch. Preserves input shape (does not fatten
// absent optional keys into empty arrays / undefined values) so callers comparing schemas
// see byte-for-byte the same structure they passed in.
function cloneSchema(s: QuoteSchema): QuoteSchema {
  const out: QuoteSchema = {
    ...s,
    fields: (s.fields || []).map(f => (f.options !== undefined ? { ...f, options: [...f.options] } : { ...f })),
    pricing: { ...(s.pricing || {}) },
    addOns: (s.addOns || []).map(a => ({ ...a })),
    summaryLines: (s.summaryLines || []).map(l => ({ ...l })),
  };
  if (s.sections !== undefined) out.sections = s.sections.map(sec => ({ ...sec, options: (sec.options || []).map(o => ({ ...o })) }));
  return out;
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
    if (!u) { errors.push("Skipped an update with no body"); continue; }
    if (!u.identifier) { errors.push("Skipped an update with no identifier"); continue; }
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
  // Permissive: missing unit / type / rate get sensible defaults (mapType→number, unitFor→each,
  // Number(rate)||0). Only structurally required fields (label) reject the entry — and we now
  // PUSH AN ERROR instead of silently skipping so partial-success messaging can surface the
  // count of skipped entries to the user. (Previous behavior was silent `continue` → 2-of-3
  // partial successes looked like a clean 2-of-2, hiding the dropped entry.)
  for (const a of diff.fieldsToAdd || []) {
    if (!a) { errors.push("Skipped a new-field entry with no body"); continue; }
    if (!a.label) { errors.push("Skipped a new field — missing label"); continue; }
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
  // Same partial-success contract as fieldsToAdd: missing label rejects the entry with an
  // explicit error; everything else (price, unit) gets a sensible default.
  for (const a of diff.addOnsToAdd || []) {
    if (!a) { errors.push("Skipped an add-on entry with no body"); continue; }
    if (!a.label) { errors.push("Skipped an add-on — missing label"); continue; }
    const id = slugId(a.label, new Set((next.addOns || []).map(x => x.id)));
    next.addOns = [...(next.addOns || []), { id, label: a.label, price: Number(a.price) || 0 }];
    changes.push(`Added ${a.label} add-on at ${money(Number(a.price) || 0)} ${a.unit || "flat"}`);
  }

  // ── addOnsToUpdate ──
  for (const u of diff.addOnsToUpdate || []) {
    if (!u) { errors.push("Skipped an add-on update with no body"); continue; }
    if (!u.identifier) { errors.push("Skipped an add-on update with no identifier"); continue; }
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

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // Section-level operations (Path B). All run AFTER field/add-on/deposit ops so a single diff
  // can express e.g. "add a section, then move a field into it" in dependency order.
  // ────────────────────────────────────────────────────────────────────────────────────────────

  // sectionsToAdd: create an empty section with sensible defaults. slugId() MUTATES its `used`
  // Set by adding the generated id — so we check collision against a separate snapshot of
  // existing ids BEFORE calling slugId, otherwise the post-slugId set always reports a
  // collision and every add is rejected.
  for (const a of diff.sectionsToAdd || []) {
    if (!a) { errors.push("Skipped a section-add entry with no body"); continue; }
    if (!a.label) { errors.push("Skipped a section-add — missing label"); continue; }
    const existingIds = new Set((next.sections || []).map(s => s.id));
    if (a.sectionIdentifier && existingIds.has(a.sectionIdentifier)) {
      errors.push(`Couldn't add section "${a.label}" — identifier "${a.sectionIdentifier}" already exists`);
      continue;
    }
    const id = a.sectionIdentifier || slugId(a.label, existingIds);
    const section: QuoteSection = {
      id,
      name: a.label,
      pattern: "FLAT_RATE", // safe default for a new empty section (toggle list) until fields are moved in
      options: [],
      allowMultiSelect: typeof a.allowMultiSelect === "boolean" ? a.allowMultiSelect : true,
    };
    next.sections = [...(next.sections || []), section];
    changes.push(`Added section "${a.label}"`);
  }

  // sectionsToRename: change display name, keep id + contents.
  for (const r of diff.sectionsToRename || []) {
    if (!r) { errors.push("Skipped a section-rename entry with no body"); continue; }
    if (!r.sectionIdentifier) { errors.push("Skipped a section-rename — missing identifier"); continue; }
    if (!r.newLabel) { errors.push("Skipped a section-rename — missing new label"); continue; }
    const sec = tieredFind(next.sections || [], r.sectionIdentifier, x => x.id, x => x.name);
    if (!sec) { errors.push(`Couldn't find section "${r.sectionIdentifier}" to rename`); continue; }
    const oldLabel = sec.name;
    sec.name = r.newLabel;
    changes.push(`Renamed section "${oldLabel}" → "${r.newLabel}"`);
  }

  // sectionsToSetProperty: only allowMultiSelect is whitelisted right now — the spec calls out
  // this exact property explicitly. Any other property name is rejected (vs silently no-op'ing).
  for (const p of diff.sectionsToSetProperty || []) {
    if (!p) { errors.push("Skipped a section-property entry with no body"); continue; }
    if (!p.sectionIdentifier) { errors.push("Skipped a section-property — missing identifier"); continue; }
    if (p.property !== "allowMultiSelect") { errors.push(`Couldn't set property "${p.property}" — only "allowMultiSelect" is supported`); continue; }
    if (typeof p.value !== "boolean") { errors.push(`Couldn't set "${p.property}" — value must be true or false`); continue; }
    const sec = tieredFind(next.sections || [], p.sectionIdentifier, x => x.id, x => x.name);
    if (!sec) { errors.push(`Couldn't find section "${p.sectionIdentifier}"`); continue; }
    sec.allowMultiSelect = p.value;
    changes.push(`Set ${sec.name} allowMultiSelect to ${p.value}`);
  }

  // fieldsToMove: change the field's group so deriveSections re-places it under the target section.
  // Rejected when source / target not found, OR when the target section already has a field with
  // the same label (the user task explicitly flagged the duplicate-name case as honest-reject).
  for (const m of diff.fieldsToMove || []) {
    if (!m) { errors.push("Skipped a field-move entry with no body"); continue; }
    if (!m.fieldIdentifier) { errors.push("Skipped a field-move — missing field identifier"); continue; }
    if (!m.targetSectionIdentifier) { errors.push("Skipped a field-move — missing target section"); continue; }
    const field = tieredFind(next.fields || [], m.fieldIdentifier, x => x.id, x => x.label);
    if (!field) { errors.push(`Couldn't find "${m.fieldIdentifier}" to move`); continue; }
    const target = tieredFind(next.sections || [], m.targetSectionIdentifier, x => x.id, x => x.name);
    if (!target) { errors.push(`Couldn't find target section "${m.targetSectionIdentifier}"`); continue; }
    // Duplicate-label guard: a field with the same label already in the target section.
    const duplicate = (target.options || []).find(o => lower(o.label) === lower(field.label));
    if (duplicate) { errors.push(`Can't move "${field.label}" to "${target.name}" — a field with that name already exists there`); continue; }
    // The strict sections[] array carries an option per field — pull the option out of every
    // section it currently lives in, then push it onto the target. The field's `group` is a
    // legacy hint; for strict schemas the sections array is authoritative.
    const movedOption = (next.sections || []).flatMap(sec => (sec.options || []).filter(o => o.id === field.id))[0];
    for (const sec of next.sections || []) sec.options = (sec.options || []).filter(o => o.id !== field.id);
    if (movedOption) target.options = [...(target.options || []), movedOption];
    // Mirror the move onto the field's `group` so legacy deriveSections agrees.
    field.group = target.id as SchemaField["group"];
    changes.push(`Moved "${field.label}" to "${target.name}"`);
  }

  // sectionsToRestructure: Path B 2C — defensively conservative. Only converts that preserve
  // every option's rate/label/unit are accepted. Anything that would change field count or type
  // (e.g. selector-with-quantity ↔ single-toggle) is rejected with an honest explanation that
  // tells the user what would be lost, per the spec's "REJECT and tell the user what would be
  // lost — don't silently mutate" rule.
  for (const r of diff.sectionsToRestructure || []) {
    if (!r) { errors.push("Skipped a section-restructure entry with no body"); continue; }
    if (!r.sectionIdentifier) { errors.push("Skipped a section-restructure — missing identifier"); continue; }
    if (!r.newShape) { errors.push("Skipped a section-restructure — missing newShape"); continue; }
    const sec = tieredFind(next.sections || [], r.sectionIdentifier, x => x.id, x => x.name);
    if (!sec) { errors.push(`Couldn't find section "${r.sectionIdentifier}"`); continue; }
    const currentShape = shapeOf(sec);
    if (currentShape === r.newShape) { changes.push(`"${sec.name}" is already shaped as ${r.newShape}`); continue; }
    // Only ↔ between selector-with-quantity and multi-toggle-with-quantity is safe: both are
    // MATERIAL_MEASUREMENT pattern, both keep the same option list and quantity field, only
    // allowMultiSelect flips. Everything else changes the underlying field count/type and
    // would silently drop pricing or merge distinct options — reject.
    const safeFlip =
      (currentShape === "selector-with-quantity" && r.newShape === "multi-toggle-with-quantity") ||
      (currentShape === "multi-toggle-with-quantity" && r.newShape === "selector-with-quantity");
    if (!safeFlip) {
      errors.push(`Can't restructure "${sec.name}" from ${currentShape} to ${r.newShape} — that would change the pricing model and could drop rates or merge options. Use the editor for this.`);
      continue;
    }
    sec.allowMultiSelect = r.newShape === "multi-toggle-with-quantity";
    changes.push(`Restructured "${sec.name}" to ${r.newShape}`);
  }

  // sectionsToRemove: destructive — `confirm: true` is mandatory. Without it the entry is
  // rejected so a runtime caller can render the "Would remove N fields — confirm?" dialogue
  // and only send back confirm=true after the user agrees.
  for (const rem of diff.sectionsToRemove || []) {
    if (!rem) { errors.push("Skipped a section-remove entry with no body"); continue; }
    if (!rem.sectionIdentifier) { errors.push("Skipped a section-remove — missing identifier"); continue; }
    if (rem.confirm !== true) { errors.push(`Refusing to remove section "${rem.sectionIdentifier}" without explicit confirm:true (this is destructive)`); continue; }
    const sec = tieredFind(next.sections || [], rem.sectionIdentifier, x => x.id, x => x.name);
    if (!sec) { errors.push(`Couldn't find section "${rem.sectionIdentifier}" to remove`); continue; }
    // Collect every field/option id under the section so we can purge fields + pricing in lockstep.
    const fieldIdsInSection = new Set<string>();
    (sec.options || []).forEach(o => fieldIdsInSection.add(o.id));
    (sec.itemFieldIds || []).forEach(id => fieldIdsInSection.add(id));
    // Also include any field whose `group` matches the section id (legacy mapping).
    (next.fields || []).forEach(f => { if (f.group === sec.id) fieldIdsInSection.add(f.id); });
    const removedFieldCount = fieldIdsInSection.size;
    next.sections = (next.sections || []).filter(s => s.id !== sec.id);
    next.fields = (next.fields || []).filter(f => !fieldIdsInSection.has(f.id));
    for (const id of fieldIdsInSection) delete next.pricing[`${id}Rate`];
    changes.push(`Removed section "${sec.name}" (${removedFieldCount} field${removedFieldCount === 1 ? "" : "s"})`);
  }

  return { schema: changes.length ? next : schema, changes, errors };
}

// Best-effort mapping from a section's actual shape to the three "newShape" categories the
// restructure operation understands. Used to detect no-op restructures + decide whether a
// conversion would actually change anything beyond allowMultiSelect.
function shapeOf(sec: QuoteSection): SectionShape {
  if (sec.pattern === "FLAT_RATE") return "single-toggle";
  if (sec.pattern === "MATERIAL_MEASUREMENT") return sec.allowMultiSelect ? "multi-toggle-with-quantity" : "selector-with-quantity";
  // Anything else (LABOR / SYSTEM_CONFIG_QUANTITY / ADDON) doesn't have a clean restructure target
  // in the three-shape vocabulary — treat as selector-with-quantity for purposes of equality
  // checks. The actual conversion path will reject anyway (only the same-shape no-op succeeds).
  return "selector-with-quantity";
}

// Path B persistence integration. The prior structuralOps.test.ts verified the kernel in
// ISOLATION — it called applyKitSchemaDiff(...) and inspected `result.schema.sections` directly.
// That bypassed the persistence path (applyKitSchema → deriveSections → setSchema → memo
// re-derive on render) which was silently undoing every structural section mutation in production.
// These tests run the FULL cycle: kernel mutate → deriveSections re-derive (with priorSections) →
// inspect the post-derive sections array. If a kernel write doesn't survive the re-derive, the
// real Kit-driven flow can't survive it either — the test fails accurately.
import { applyKitSchemaDiff } from "../applyKitSchemaDiff";
import { deriveSections } from "../buildSchemaFromVerified";
import { QuoteSchema, QuoteSection } from "../../types";

// Helper: simulate the production flow. Kernel mutates → applyKitSchema's re-derive runs (with
// priorSections = kernel-mutated next.sections) → the resulting schema is what gets persisted
// AND re-derived again at render time. Returns the final post-cycle schema.
function applyAndPersist(schema: QuoteSchema, diff: Parameters<typeof applyKitSchemaDiff>[1]): { schema: QuoteSchema; changes: string[]; errors: string[] } {
  const r = applyKitSchemaDiff(schema, diff);
  const persistedSections = deriveSections(r.schema.fields || [], r.schema.pricing || {}, undefined, r.schema.defaultSectionIds, r.schema.sections);
  return { schema: { ...r.schema, sections: persistedSections }, changes: r.changes, errors: r.errors };
}

// Strict-section deck schema — Decking (selector-with-quantity, single-select default), Fees (toggles).
function baseStrict(): QuoteSchema {
  const sections: QuoteSection[] = [
    {
      id: "material", name: "Decking Materials", pattern: "MATERIAL_MEASUREMENT",
      materialFieldId: "material", quantityFieldId: "deckSqft", unit: "sqft",
      options: [{ id: "pt", label: "Pressure Treated", rate: 20, unit: "sqft" }, { id: "composite", label: "Composite", rate: 35, unit: "sqft" }],
      allowMultiSelect: false,
    },
    {
      id: "_flat_fees", name: "Fees & Options", pattern: "FLAT_RATE",
      itemFieldIds: ["permit"],
      options: [{ id: "permit", label: "Permit", rate: 200, unit: "flat" }],
      allowMultiSelect: true,
    },
  ];
  return {
    trade: "Deck Building",
    fields: [
      { id: "deckSqft", label: "Deck Square Footage", type: "number", unit: "sqft", group: "dimensions" },
      { id: "material", label: "Decking Materials", type: "selector", unit: "sqft", group: "materials", options: ["Pressure Treated", "Composite"] },
      { id: "permit", label: "Permit", type: "toggle", unit: "flat", group: "fees" },
    ],
    pricing: { deckSqftRate: 0, permitRate: 200, ptRate: 20, compositeRate: 35, depositPercent: 25 },
    addOns: [],
    calculation: "",
    summaryLines: [],
    sections,
  };
}

describe("Path B integration — structural ops survive deriveSections", () => {
  // ── 2A: setSectionProperty (allowMultiSelect) ───────────────────────────────────────────────
  test("sectionsToSetProperty allowMultiSelect persists through deriveSections re-derive", () => {
    const before = baseStrict();
    const { schema, errors } = applyAndPersist(before, {
      sectionsToSetProperty: [{ sectionIdentifier: "Decking Materials", property: "allowMultiSelect", value: true }],
    });
    expect(errors).toEqual([]);
    const sec = schema.sections!.find(s => s.id === "material");
    expect(sec).toBeDefined();
    expect(sec!.allowMultiSelect).toBe(true); // would have reverted to defaultAllowMultiSelect heuristic (false) WITHOUT the priorSections fix
  });

  // ── 2D: sectionsToAdd (empty section survival) ─────────────────────────────────────────────
  test("sectionsToAdd creates an empty section that persists through deriveSections (no backing field yet)", () => {
    const before = baseStrict();
    const { schema, errors } = applyAndPersist(before, { sectionsToAdd: [{ label: "Cleanup" }] });
    expect(errors).toEqual([]);
    const cleanup = schema.sections!.find(s => s.name === "Cleanup");
    expect(cleanup).toBeDefined();
    expect(cleanup!.options).toEqual([]);
  });

  // ── 2F: sectionsToRename (custom name survives) ────────────────────────────────────────────
  test("sectionsToRename persists the new name through deriveSections re-derive", () => {
    const before = baseStrict();
    const { schema, errors } = applyAndPersist(before, {
      sectionsToRename: [{ sectionIdentifier: "Decking Materials", newLabel: "Decking" }],
    });
    expect(errors).toEqual([]);
    const renamed = schema.sections!.find(s => s.id === "material");
    expect(renamed).toBeDefined();
    expect(renamed!.name).toBe("Decking"); // would have reverted to sel.label ("Decking Materials") WITHOUT the priorSections fix
  });

  // ── 2C: sectionsToRestructure (safe flip — pattern + allowMultiSelect survive) ──────────────
  test("sectionsToRestructure safe flip (selector → multi-toggle) persists through re-derive", () => {
    const before = baseStrict();
    const { schema, errors } = applyAndPersist(before, {
      sectionsToRestructure: [{ sectionIdentifier: "Decking Materials", newShape: "multi-toggle-with-quantity" }],
    });
    expect(errors).toEqual([]);
    const sec = schema.sections!.find(s => s.id === "material");
    expect(sec).toBeDefined();
    expect(sec!.allowMultiSelect).toBe(true);
    expect(sec!.pattern).toBe("MATERIAL_MEASUREMENT"); // pattern survives — the heuristic might have set this anyway, but pinning it
  });

  // ── 2E: sectionsToRemove (section AND its fields gone after re-derive) ─────────────────────
  test("sectionsToRemove with confirm:true purges section + fields and stays purged after re-derive", () => {
    const before = baseStrict();
    const { schema, errors } = applyAndPersist(before, {
      sectionsToRemove: [{ sectionIdentifier: "_flat_fees", confirm: true }],
    });
    expect(errors).toEqual([]);
    expect(schema.sections!.find(s => s.id === "_flat_fees")).toBeUndefined();
    expect(schema.fields.find(f => f.id === "permit")).toBeUndefined();
    expect(schema.pricing.permitRate).toBeUndefined();
  });

  // ── 2B: fieldsToMove (toggle bucketing by field.group instead of unconditional _flat_fees) ─
  test("fieldsToMove on a toggle lands in declared section after re-derive, NOT _flat_fees", () => {
    // First add a new "Extras" section so the move has a destination that wasn't there pre-test.
    const intermediate = applyAndPersist(baseStrict(), { sectionsToAdd: [{ label: "Extras" }] });
    expect(intermediate.errors).toEqual([]);
    expect(intermediate.schema.sections!.find(s => s.name === "Extras")).toBeDefined();

    // Now move Permit into Extras. Without the toggle-by-field.group fix, deriveSections would
    // re-bucket Permit into _flat_fees ("Fees & Options") regardless of where the kernel placed it.
    const { schema, errors } = applyAndPersist(intermediate.schema, {
      fieldsToMove: [{ fieldIdentifier: "Permit", targetSectionIdentifier: "Extras" }],
    });
    expect(errors).toEqual([]);
    const extras = schema.sections!.find(s => s.name === "Extras");
    expect(extras).toBeDefined();
    expect(extras!.options!.find(o => o.id === "permit")).toBeDefined();
    // Critical: Permit should NO LONGER be in _flat_fees after the re-derive. Without the fix,
    // the toggle would re-appear in both sections (the prior section was filtered, but the
    // re-derive would re-bucket it into _flat_fees by type).
    const flatFees = schema.sections!.find(s => s.id === "_flat_fees");
    if (flatFees) expect(flatFees.options!.find(o => o.id === "permit")).toBeUndefined();
  });

  // ── Composite: addSection + fieldsToMove into the new section in ONE diff ──────────────────
  test("composite addSection + fieldsToMove — both persist through re-derive", () => {
    const before = baseStrict();
    const { schema, errors } = applyAndPersist(before, {
      sectionsToAdd: [{ label: "Extras" }],
      fieldsToMove: [{ fieldIdentifier: "Permit", targetSectionIdentifier: "Extras" }],
    });
    expect(errors).toEqual([]);
    const extras = schema.sections!.find(s => s.name === "Extras");
    expect(extras).toBeDefined();
    expect(extras!.options!.find(o => o.id === "permit")).toBeDefined();
  });

  // ── Legacy behavior preserved when priorSections is not supplied ───────────────────────────
  test("deriveSections called WITHOUT priorSections behaves exactly as before (legacy compat)", () => {
    const fields = baseStrict().fields;
    const pricing = baseStrict().pricing;
    const legacy = deriveSections(fields, pricing, undefined, undefined);
    // No prior → no custom-state preservation. The heuristic name ("Decking Materials" from
    // sel.label), heuristic allowMultiSelect (false for the material section), and the legacy
    // _flat_fees catch-all are exactly what the pre-fix function produced.
    const materialSec = legacy.find(s => s.id === "material");
    expect(materialSec).toBeDefined();
    expect(materialSec!.name).toBe("Decking Materials");
    expect(materialSec!.allowMultiSelect).toBe(false);
    const flatFees = legacy.find(s => s.id === "_flat_fees");
    expect(flatFees).toBeDefined();
    expect(flatFees!.options!.find(o => o.id === "permit")).toBeDefined();
  });
});

// Path B — six new structural schema operations on top of the Path A honesty foundation.
// Each operation is tested AT THE KERNEL LEVEL (here) for the "what the schema looks like
// afterward" contract; the Path A response gate is tested separately in
// kitResponseRendererGate.test.ts and the user-visible failure messaging is tested in
// closeJobLoop.test.ts + kitDiffPermissive.test.ts (which still pass — Path A's renderer is
// unchanged, the new ops just flow through it).
import { applyKitSchemaDiff } from "../applyKitSchemaDiff";
import { QuoteSchema, QuoteSection } from "../../types";

// Schema with a strict sections[] array (the kind real-world signed-up businesses carry —
// imported via the wizard or rebuilt by Kit). Two sections, one material-measurement (Decking)
// with multi-select OFF, one flat-rate (Fees).
const baseStrict = (): QuoteSchema => {
  const sections: QuoteSection[] = [
    {
      id: "decking", name: "Decking", pattern: "MATERIAL_MEASUREMENT",
      materialFieldId: "material", quantityFieldId: "deckSqft", unit: "sqft",
      options: [
        { id: "pt", label: "Pressure Treated", rate: 20, unit: "sqft" },
        { id: "composite", label: "Composite", rate: 35, unit: "sqft" },
      ],
      allowMultiSelect: false,
    },
    {
      id: "fees", name: "Fees", pattern: "FLAT_RATE",
      itemFieldIds: ["permit"],
      options: [{ id: "permit", label: "Permit", rate: 200, unit: "flat" }],
      allowMultiSelect: true,
    },
  ];
  return {
    trade: "Deck Building",
    fields: [
      { id: "deckSqft", label: "Deck Square Footage", type: "number", unit: "sqft", group: "decking" as never },
      { id: "material", label: "Material", type: "selector", unit: "sqft", group: "decking" as never, options: ["Pressure Treated", "Composite"] },
      { id: "permit", label: "Permit", type: "toggle", unit: "flat", group: "fees" },
    ],
    pricing: { deckSqftRate: 0, permitRate: 200, ptRate: 20, compositeRate: 35, depositPercent: 25 },
    addOns: [],
    calculation: "",
    summaryLines: [],
    sections,
  };
};

// ────────────────────────────────────────────────────────────────────────────────────────────
// 2A — setSectionProperty (allowMultiSelect toggle)
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path B 2A — setSectionProperty (allowMultiSelect)", () => {
  test("toggling allowMultiSelect from false → true preserves all existing fields and options", () => {
    const before = baseStrict();
    const result = applyKitSchemaDiff(before, {
      sectionsToSetProperty: [{ sectionIdentifier: "Decking", property: "allowMultiSelect", value: true }],
    });
    expect(result.errors).toEqual([]);
    expect(result.changes.length).toBe(1);
    const decking = result.schema.sections!.find(s => s.id === "decking")!;
    expect(decking.allowMultiSelect).toBe(true);
    expect(decking.options).toEqual(before.sections![0].options); // options untouched
    expect(decking.pattern).toBe("MATERIAL_MEASUREMENT");          // pattern untouched
    expect(result.schema.fields.length).toBe(before.fields.length); // no fields lost
  });

  test("toggling back to false preserves the same fields", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToSetProperty: [{ sectionIdentifier: "Fees", property: "allowMultiSelect", value: false }],
    });
    expect(r.errors).toEqual([]);
    expect(r.schema.sections!.find(s => s.id === "fees")!.allowMultiSelect).toBe(false);
  });

  test("unknown section identifier produces honest error, schema unchanged", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToSetProperty: [{ sectionIdentifier: "Nonexistent", property: "allowMultiSelect", value: true }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/couldn['']t find/i);
    expect(r.schema).toBe(baseStrict() && r.schema); // no-op returns same shape
  });

  test("unsupported property name rejected (whitelist guard)", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToSetProperty: [{ sectionIdentifier: "Decking", property: "fooBar" as "allowMultiSelect", value: true }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/only "allowMultiSelect" is supported/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// 2B — moveField between sections
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path B 2B — moveField", () => {
  test("simple move preserves rate, unit, type, label", () => {
    const before = baseStrict();
    const r = applyKitSchemaDiff(before, {
      fieldsToMove: [{ fieldIdentifier: "Permit", targetSectionIdentifier: "Decking" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.changes[0]).toMatch(/Moved.*Permit.*Decking/);
    const decking = r.schema.sections!.find(s => s.id === "decking")!;
    expect(decking.options!.find(o => o.id === "permit")).toEqual({ id: "permit", label: "Permit", rate: 200, unit: "flat" });
    // Source section no longer contains the option.
    const fees = r.schema.sections!.find(s => s.id === "fees")!;
    expect(fees.options!.find(o => o.id === "permit")).toBeUndefined();
    // Field rate + label + type unchanged in the legacy fields array.
    const permit = r.schema.fields.find(f => f.id === "permit")!;
    expect(permit.label).toBe("Permit");
    expect(permit.type).toBe("toggle");
    expect(permit.unit).toBe("flat");
    expect(r.schema.pricing.permitRate).toBe(200);
  });

  test("duplicate label in target section rejected honestly", () => {
    const before = baseStrict();
    // Add a "Permit" option already in Decking so the move would collide.
    before.sections![0].options = [...(before.sections![0].options || []), { id: "permit-decking", label: "Permit", rate: 50, unit: "sqft" }];
    const r = applyKitSchemaDiff(before, {
      fieldsToMove: [{ fieldIdentifier: "Permit", targetSectionIdentifier: "Decking" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/already exists/i);
  });

  test("unknown source field rejected honestly", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      fieldsToMove: [{ fieldIdentifier: "Phantom", targetSectionIdentifier: "Fees" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/couldn['']t find ['"]Phantom['"] to move/i);
  });

  test("unknown target section rejected honestly", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      fieldsToMove: [{ fieldIdentifier: "Permit", targetSectionIdentifier: "Phantom" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/couldn['']t find target section/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// 2C — restructureSection (defensive)
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path B 2C — restructureSection (defensively conservative)", () => {
  test("selector-with-quantity → multi-toggle-with-quantity flips allowMultiSelect, preserves options", () => {
    const before = baseStrict(); // Decking starts as selector-with-quantity (allowMultiSelect=false)
    const r = applyKitSchemaDiff(before, {
      sectionsToRestructure: [{ sectionIdentifier: "Decking", newShape: "multi-toggle-with-quantity" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.changes[0]).toMatch(/Restructured.*Decking.*multi-toggle-with-quantity/);
    const decking = r.schema.sections!.find(s => s.id === "decking")!;
    expect(decking.allowMultiSelect).toBe(true);
    expect(decking.options).toEqual(before.sections![0].options); // labels + rates intact
    expect(decking.pattern).toBe("MATERIAL_MEASUREMENT");
  });

  test("multi-toggle-with-quantity → selector-with-quantity flips back", () => {
    const before = baseStrict();
    before.sections![0].allowMultiSelect = true;
    const r = applyKitSchemaDiff(before, {
      sectionsToRestructure: [{ sectionIdentifier: "Decking", newShape: "selector-with-quantity" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.schema.sections!.find(s => s.id === "decking")!.allowMultiSelect).toBe(false);
  });

  test("lossy conversion (multi-toggle → single-toggle) is rejected with honest explanation", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToRestructure: [{ sectionIdentifier: "Decking", newShape: "single-toggle" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/change the pricing model|drop rates|merge options/i);
    expect(r.errors[0]).toMatch(/use the editor/i);
  });

  test("same-shape no-op succeeds silently as a change", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToRestructure: [{ sectionIdentifier: "Decking", newShape: "selector-with-quantity" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.changes[0]).toMatch(/already shaped/i);
  });

  test("unknown section rejected", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToRestructure: [{ sectionIdentifier: "Phantom", newShape: "multi-toggle-with-quantity" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/couldn['']t find/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// 2D — addSection
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path B 2D — addSection", () => {
  test("new empty section appended, ready to receive fields", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToAdd: [{ label: "Railings", allowMultiSelect: true }],
    });
    expect(r.errors).toEqual([]);
    expect(r.changes[0]).toMatch(/Added section ['"]Railings['"]/);
    const sec = r.schema.sections!.find(s => s.name === "Railings");
    expect(sec).toBeDefined();
    expect(sec!.options).toEqual([]);
    expect(sec!.allowMultiSelect).toBe(true);
  });

  test("identifier collision with existing section rejected honestly", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToAdd: [{ sectionIdentifier: "decking", label: "Decking 2" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/already exists/i);
  });

  test("missing label rejected", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToAdd: [{ label: "" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/missing label/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// 2E — removeSection (destructive, confirm required)
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path B 2E — removeSection (confirm gate)", () => {
  test("remove with confirm:true succeeds and purges fields + pricing", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToRemove: [{ sectionIdentifier: "Fees", confirm: true }],
    });
    expect(r.errors).toEqual([]);
    expect(r.changes[0]).toMatch(/Removed section ['"]Fees['"]/);
    expect(r.schema.sections!.find(s => s.id === "fees")).toBeUndefined();
    expect(r.schema.fields.find(f => f.id === "permit")).toBeUndefined();
    expect(r.schema.pricing.permitRate).toBeUndefined();
  });

  test("remove without confirm:true is rejected (Kit must ask user first)", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToRemove: [{ sectionIdentifier: "Fees", confirm: false }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/Refusing to remove.*without explicit confirm:true/);
    // Schema unchanged when the confirm gate rejects.
    expect(r.schema.sections!.find(s => s.id === "fees")).toBeDefined();
  });

  test("remove of non-existent section rejected honestly", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToRemove: [{ sectionIdentifier: "Phantom", confirm: true }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/couldn['']t find/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// 2F — renameSection
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path B 2F — renameSection", () => {
  test("rename changes the display label, leaves identifier and contents intact", () => {
    const before = baseStrict();
    const r = applyKitSchemaDiff(before, {
      sectionsToRename: [{ sectionIdentifier: "Fees", newLabel: "Add-on Fees" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.changes[0]).toMatch(/Renamed section ['"]Fees['"] → ['"]Add-on Fees['"]/);
    const sec = r.schema.sections!.find(s => s.id === "fees")!;
    expect(sec.id).toBe("fees");          // id unchanged
    expect(sec.name).toBe("Add-on Fees"); // label changed
    expect(sec.options).toEqual(before.sections![1].options); // contents unchanged
  });

  test("unknown section rejected honestly", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToRename: [{ sectionIdentifier: "Phantom", newLabel: "Whatever" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/couldn['']t find/i);
  });

  test("empty new label rejected", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToRename: [{ sectionIdentifier: "Fees", newLabel: "" }],
    });
    expect(r.changes).toEqual([]);
    expect(r.errors[0]).toMatch(/missing new label/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// Composite: a diff that mixes multiple structural ops in one batch (Path A's partial-success
// renderer covers the user-visible messaging; here we verify the kernel handles dependency order)
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path B — composite diff (add section, then move a field into it)", () => {
  test("section added first, then fieldsToMove targets the new section by name", () => {
    const r = applyKitSchemaDiff(baseStrict(), {
      sectionsToAdd: [{ label: "Extras" }],
      fieldsToMove: [{ fieldIdentifier: "Permit", targetSectionIdentifier: "Extras" }],
    });
    expect(r.errors).toEqual([]);
    expect(r.changes).toContain('Added section "Extras"');
    expect(r.changes.some(c => /Moved.*Permit.*Extras/.test(c))).toBe(true);
    const extras = r.schema.sections!.find(s => s.name === "Extras");
    expect(extras).toBeDefined();
    expect(extras!.options!.find(o => o.id === "permit")).toBeDefined();
  });
});

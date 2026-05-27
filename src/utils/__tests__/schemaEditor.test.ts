import { QuoteSchema, SavedQuote } from "../../types";
import { addCalculatedField, addMeasurementField, addToggleField, defaultActiveSections, pushSchemaVersion, reorderFields, setSectionDefault } from "../schemaEditorOps";
import { addTemplate, templateToInitialValues } from "../quoteTemplates";
import { duplicateQuote } from "../duplicateQuote";
import { deriveSections } from "../buildSchemaFromVerified";

const base = (): QuoteSchema => ({
  trade: "Decking",
  fields: [
    { id: "deckSqft", label: "Deck Square Footage", type: "number", unit: "sqft", group: "dimensions" },
    { id: "railing", label: "Railing", type: "number", unit: "lf", group: "railings" },
    { id: "permit", label: "Permit", type: "toggle", unit: "flat", group: "fees" },
  ],
  pricing: { deckSqftRate: 12, railingRate: 25, permitRate: 150, depositPercent: 50 },
  addOns: [],
  calculation: "",
  summaryLines: [],
});

describe("schema editor ops", () => {
  test("schema editor — add measurement field", () => {
    const s = addMeasurementField(base(), "Stairs (linear feet)", 40, "lf");
    const f = (s.fields || []).find(x => x.label === "Stairs (linear feet)");
    expect(f).toBeTruthy();
    expect(f!.type).toBe("number");
    expect(f!.unit).toBe("lf");
    expect(s.pricing![`${f!.id}Rate`]).toBe(40);
  });

  test("schema editor — add yes/no toggle field", () => {
    const s = addToggleField(base(), "Delivery", 75);
    const f = (s.fields || []).find(x => x.label === "Delivery");
    expect(f).toBeTruthy();
    expect(f!.type).toBe("toggle");
    expect(f!.unit).toBe("flat");
    expect(s.pricing![`${f!.id}Rate`]).toBe(75);
  });

  test("schema editor — add calculated (linked) field", () => {
    const s = addCalculatedField(base(), "Frame Protection", "Deck Square Footage", 0.5);
    const f = (s.fields || []).find(x => x.label === "Frame Protection");
    expect(f).toBeTruthy();
    expect(f!.linkedTo).toBe("Deck Square Footage");
    expect(f!.multiplier).toBe(0.5);
  });

  test("schema editor — reorder sections", () => {
    const before = deriveSections(base().fields!, base().pricing!).map(s => s.name);
    // Move the 2nd field (Railing) to the front; derived section order should reflect it.
    const s = reorderFields(base(), 1, 0);
    expect((s.fields || [])[0].id).toBe("railing");
    const after = deriveSections(s.fields!, s.pricing!).map(x => x.name);
    expect(after).not.toEqual(before);
    expect(after[0]).toBe("Railing");
    // Original schema untouched (pure).
    expect(base().fields![0].id).toBe("deckSqft");
  });

  test("schema editor — version history saves correctly", () => {
    let history = pushSchemaVersion(undefined, base(), "Manual edit", 1);
    history = pushSchemaVersion(history, base(), "Kit", 2);
    history = pushSchemaVersion(history, base(), "Import", 3);
    expect(history).toHaveLength(3);
    expect(history[0].source).toBe("Import"); // newest first
    expect(history[2].source).toBe("Manual edit");
    // Keeps only the last 5.
    for (let i = 4; i <= 8; i++) history = pushSchemaVersion(history, base(), "Kit", i);
    expect(history).toHaveLength(5);
    expect(history[0].timestamp).toBe(8);
  });

  test("default sections — pre-selected on new quote", () => {
    const withDefault = setSectionDefault(
      { ...base(), sections: [{ id: "decking", name: "Decking", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: false }, { id: "railing", name: "Railing", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: false }] },
      "decking", true,
    );
    expect(withDefault.sections!.find(s => s.id === "decking")!.defaultOn).toBe(true);
    const active = defaultActiveSections(withDefault.sections);
    expect(active).toEqual({ decking: true });
  });
});

describe("quote templates + duplicate", () => {
  const tplSource = { name: "Standard Deck", fieldValues: { deckSqft: 300, material: "Composite" }, activeSections: { decking: true }, selectedAddOns: ["permit"] };

  test("quote template — saves and loads correctly", () => {
    const list = addTemplate(undefined, tplSource);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Standard Deck");
    expect(list[0].id).toBeTruthy();
    const init = templateToInitialValues(list[0]);
    expect(init.fieldValues).toEqual({ deckSqft: 300, material: "Composite" });
    expect(init.activeSections).toEqual({ decking: true });
    expect(init.selectedAddOns).toEqual(["permit"]);
    // Same-name save replaces, not duplicates.
    const list2 = addTemplate(list, { ...tplSource, fieldValues: { deckSqft: 500 } });
    expect(list2).toHaveLength(1);
    expect(list2[0].fieldValues.deckSqft).toBe(500);
  });

  test("duplicate quote — produces new quote with same values", () => {
    const original: SavedQuote = {
      id: "orig123", timestamp: 1000, customerName: "Jane Doe", trade: "Decking", total: 9124, deposit: 4562,
      fieldValues: { deckSqft: 320, material: "TimberTech Reserve", railing: 48 },
      userId: "u1", repName: "Rep", status: "won", notes: "south side gate", signedAt: 2000,
    };
    const dup = duplicateQuote(original);
    expect(dup.id).not.toBe(original.id);
    expect(dup.fieldValues).toEqual(original.fieldValues);
    expect(dup.fieldValues).not.toBe(original.fieldValues); // cloned, not shared
    expect(dup.customerName).toBe("");
    expect(dup.notes).toBeUndefined();
    expect(dup.signedAt).toBeUndefined();
    expect(dup.status).toBe("open");
    expect(dup.total).toBe(9124);
  });
});

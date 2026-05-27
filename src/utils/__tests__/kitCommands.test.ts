import { QuoteSchema } from "../../types";
import { executeKitCommand } from "../executeKitCommand";

const sectionsSchema = (): QuoteSchema => ({
  trade: "Decking",
  fields: [],
  pricing: { depositPercent: 50 },
  addOns: [],
  calculation: "0",
  summaryLines: [],
  sections: [
    { id: "decking", name: "Decking", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: false, unit: "sqft", options: [
      { id: "cedar", label: "Cedar", rate: 10, unit: "sqft" },
      { id: "composite", label: "Composite", rate: 18, unit: "sqft" },
    ] },
  ],
});

const legacySchema = (): QuoteSchema => ({
  trade: "Decking",
  fields: [{ id: "railing", label: "Railing", type: "number", unit: "lf", group: "railings" }],
  pricing: { railingRate: 25, depositPercent: 40 },
  addOns: [{ id: "permit", label: "Permit", price: 150 }],
  calculation: "(railing||0)*railingRate",
  summaryLines: [],
});

describe("executeKitCommand", () => {
  test("UPDATE_RATE sections schema updates the option rate", () => {
    const { schema, result } = executeKitCommand(sectionsSchema(), { type: "UPDATE_RATE", fieldIdentifier: "Cedar", newRate: 14 });
    expect(result.success).toBe(true);
    expect(schema.sections!.find(s => s.id === "decking")!.options!.find(o => o.id === "cedar")!.rate).toBe(14);
    expect(schema.pricing!.cedarRate).toBe(14);
  });

  test("UPDATE_RATE legacy schema updates the pricing key", () => {
    const { schema, result } = executeKitCommand(legacySchema(), { type: "UPDATE_RATE", fieldIdentifier: "Railing", newRate: 30 });
    expect(result.success).toBe(true);
    expect(schema.pricing!.railingRate).toBe(30);
  });

  test("UPDATE_RATE field not found returns an error", () => {
    const before = sectionsSchema();
    const { schema, result } = executeKitCommand(before, { type: "UPDATE_RATE", fieldIdentifier: "Nonexistent", newRate: 99 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(schema).toBe(before); // unchanged reference on failure
  });

  test("ADD_FIELD to an existing section appends the option", () => {
    const { schema, result } = executeKitCommand(sectionsSchema(), { type: "ADD_FIELD", sectionIdentifier: "Decking", label: "Tigerwood", rate: 30, unit: "sqft", fieldType: "select" });
    expect(result.success).toBe(true);
    const sec = schema.sections!.find(s => s.name === "Decking")!;
    expect(sec.options!.some(o => o.label === "Tigerwood")).toBe(true);
    expect(schema.fields!.some(f => f.label === "Tigerwood")).toBe(true);
    expect(schema.pricing!.tigerwoodRate).toBe(30);
  });

  test("ADD_FIELD creates a new section when the section is not found", () => {
    const { schema, result } = executeKitCommand(sectionsSchema(), { type: "ADD_FIELD", sectionIdentifier: "Lighting", label: "Post Cap Light", rate: 45, unit: "each", fieldType: "number" });
    expect(result.success).toBe(true);
    expect(schema.sections!.some(s => s.name === "Lighting")).toBe(true);
    expect(schema.sections!.find(s => s.name === "Lighting")!.options!.some(o => o.label === "Post Cap Light")).toBe(true);
  });

  test("REMOVE_FIELD cleans up an empty section", () => {
    let schema = sectionsSchema();
    schema = executeKitCommand(schema, { type: "REMOVE_FIELD", fieldIdentifier: "Cedar" }).schema;
    expect(schema.sections!.find(s => s.id === "decking")!.options!.some(o => o.id === "cedar")).toBe(false);
    schema = executeKitCommand(schema, { type: "REMOVE_FIELD", fieldIdentifier: "Composite" }).schema;
    // both options gone → section removed
    expect(schema.sections!.some(s => s.id === "decking")).toBe(false);
  });

  test("UPDATE_DEPOSIT sets both locations", () => {
    const { schema } = executeKitCommand(legacySchema(), { type: "UPDATE_DEPOSIT", percent: 25 });
    expect(schema.pricing!.depositPercent).toBe(25);
    expect((schema as any).depositPercent).toBe(25);
  });

  test("ADD_ADDON appends an add-on", () => {
    const { schema, result } = executeKitCommand(legacySchema(), { type: "ADD_ADDON", label: "Demolition", price: 500 });
    expect(result.success).toBe(true);
    expect(schema.addOns!.some(a => a.label === "Demolition" && a.price === 500)).toBe(true);
  });

  test("fuzzy lookup: 'Frame Protection' resolves a parenthetical/camelCase field", () => {
    const schema: QuoteSchema = {
      trade: "Decking", pricing: { frameProtectionRate: 0.5, depositPercent: 50 }, addOns: [], calculation: "0", summaryLines: [],
      fields: [{ id: "frameProtection", label: "Frame Protection ($0.50/sqft)", type: "number", unit: "sqft", group: "materials" }],
      sections: [{ id: "components", name: "Deck Components & Trim", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: true, options: [
        { id: "frameProtection", label: "Frame Protection ($0.50/sqft)", rate: 0.5, unit: "sqft" },
      ] }],
    };
    const { schema: out, result } = executeKitCommand(schema, { type: "UPDATE_RATE", fieldIdentifier: "Frame Protection", newRate: 0.75 });
    expect(result.success).toBe(true);
    expect(out.pricing!.frameProtectionRate).toBe(0.75);
  });

  test("exact match wins over partial (no wrong-field match)", () => {
    const schema: QuoteSchema = {
      trade: "Decking", pricing: { depositPercent: 50 }, addOns: [], calculation: "0", summaryLines: [],
      fields: [],
      sections: [{ id: "s", name: "S", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: true, options: [
        { id: "railing", label: "Railing", rate: 10, unit: "lf" },
        { id: "railingPost", label: "Railing Post Upgrade", rate: 25, unit: "each" },
      ] }],
    };
    const { schema: out, result } = executeKitCommand(schema, { type: "UPDATE_RATE", fieldIdentifier: "Railing", newRate: 12 });
    expect(result.success).toBe(true);
    // exact label "Railing" must update the railing option, NOT the partial "Railing Post Upgrade"
    expect(out.sections![0].options!.find(o => o.id === "railing")!.rate).toBe(12);
    expect(out.sections![0].options!.find(o => o.id === "railingPost")!.rate).toBe(25);
  });

  test("not-found error lists available fields", () => {
    const { result } = executeKitCommand(legacySchema(), { type: "UPDATE_RATE", fieldIdentifier: "Nonexistent Thing", newRate: 9 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Available fields:");
    expect(result.error).toContain("Railing");
  });

  test("NO_CHANGE returns the schema unchanged", () => {
    const before = legacySchema();
    const { schema, result } = executeKitCommand(before, { type: "NO_CHANGE" });
    expect(result.success).toBe(true);
    expect(schema).toBe(before);
  });
});

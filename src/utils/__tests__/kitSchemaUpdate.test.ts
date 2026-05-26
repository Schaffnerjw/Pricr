import { QuoteSchema } from "../../types";
import { applyKitSchemaUpdate } from "../kitSchemaUpdate";

const base = (): QuoteSchema => ({
  trade: "Decking",
  fields: [
    { id: "railing", label: "Railing", type: "number", unit: "lf", group: "railings" },
    { id: "permit", label: "Permit", type: "toggle", unit: "flat", group: "fees" },
  ],
  pricing: { railingRate: 25, permitRate: 150, depositPercent: 50 },
  addOns: [],
  calculation: "(railing || 0) * railingRate + (permit ? permitRate : 0)",
  summaryLines: [],
});

describe("applyKitSchemaUpdate", () => {
  test("update_rate by field name updates the matching pricing key", () => {
    const r = applyKitSchemaUpdate(base(), { action: "update_rate", fieldName: "Railing", changes: { rate: 30 } });
    expect(r.changed).toBe(true);
    expect(r.schema.pricing!.railingRate).toBe(30);
  });

  test("update_rate on an unknown field is a no-op (no silent wrong change)", () => {
    const r = applyKitSchemaUpdate(base(), { action: "update_rate", fieldName: "Nonexistent", changes: { rate: 99 } });
    expect(r.changed).toBe(false);
    expect(r.schema.pricing!.railingRate).toBe(25);
  });

  test("change_type number → toggle sets unit to flat", () => {
    const r = applyKitSchemaUpdate(base(), { action: "change_type", fieldId: "railing", changes: { type: "toggle" } });
    const f = r.schema.fields!.find(x => x.id === "railing")!;
    expect(r.changed).toBe(true);
    expect(f.type).toBe("toggle");
    expect(f.unit).toBe("flat");
  });

  test("add_field appends a field and its pricing rate", () => {
    const r = applyKitSchemaUpdate(base(), { action: "add_field", fieldName: "Stairs", changes: { type: "number", unit: "each", rate: 75 } });
    const f = r.schema.fields!.find(x => x.label === "Stairs")!;
    expect(r.changed).toBe(true);
    expect(f.type).toBe("number");
    expect(f.unit).toBe("each");
    expect(r.schema.pricing![`${f.id}Rate`]).toBe(75);
  });

  test("remove_field drops the field and its rate", () => {
    const r = applyKitSchemaUpdate(base(), { action: "remove_field", fieldName: "Permit" });
    expect(r.changed).toBe(true);
    expect(r.schema.fields!.some(x => x.id === "permit")).toBe(false);
    expect(r.schema.pricing!.permitRate).toBeUndefined();
  });

  test("change_type relabels + converts to toggle (Frame Protection screenshot case)", () => {
    const schema: QuoteSchema = {
      trade: "Decking",
      fields: [{ id: "frameProtection", label: "Frame Protection", type: "number", unit: "sqft", group: "materials" }],
      pricing: { frameProtectionRate: 2, depositPercent: 50 },
      addOns: [], calculation: "", summaryLines: [],
    };
    const r = applyKitSchemaUpdate(schema, {
      action: "change_type", fieldId: "frameProtection", fieldName: "Frame Protection",
      changes: { type: "toggle", unit: "flat", label: "Include Frame Protection" },
    });
    const f = r.schema.fields!.find(x => x.id === "frameProtection")!;
    expect(r.changed).toBe(true);
    expect(f.type).toBe("toggle");
    expect(f.unit).toBe("flat");
    expect(f.label).toBe("Include Frame Protection");
  });

  test("update_field changes label + unit", () => {
    const r = applyKitSchemaUpdate(base(), { action: "update_field", fieldId: "railing", changes: { label: "Cable Railing", unit: "lf" } });
    const f = r.schema.fields!.find(x => x.id === "railing")!;
    expect(f.label).toBe("Cable Railing");
    expect(f.unit).toBe("lf");
  });
});

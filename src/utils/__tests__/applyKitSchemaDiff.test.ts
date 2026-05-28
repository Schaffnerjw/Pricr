// Direct kernel-operation tests for applyKitSchemaDiff. Covers every legacy SCHEMA_UPDATE
// action expressed as a SCHEMA_DIFF: update_rate, update_field/rename, change_unit,
// change_type→toggle, add_field (number AND toggle), remove_field, unknown-field no-op.
// Unit/type normalization for the legacy SCHEMA_UPDATE format lives in legacyKitUpdateToDiff —
// applyKitSchemaDiff itself receives already-canonical values.
import { QuoteSchema } from "../../types";
import { applyKitSchemaDiff } from "../applyKitSchemaDiff";

const base = (): QuoteSchema => ({
  trade: "Decking",
  fields: [
    { id: "railing", label: "Railing", type: "number", unit: "lf", group: "railings" },
    { id: "permit", label: "Permit", type: "toggle", unit: "flat", group: "fees" },
    { id: "frameProtection", label: "Frame Protection", type: "number", unit: "sqft", group: "materials" },
  ],
  pricing: { railingRate: 25, permitRate: 150, frameProtectionRate: 2, depositPercent: 50 },
  addOns: [],
  calculation: "(railing || 0) * railingRate + (permit ? permitRate : 0)",
  summaryLines: [],
});

describe("applyKitSchemaDiff — kernel operations", () => {
  test("update_rate by field id", () => {
    const r = applyKitSchemaDiff(base(), { fieldsToUpdate: [{ identifier: "railing", changes: { rate: 30 } }] });
    expect(r.changes.length).toBeGreaterThan(0);
    expect(r.schema.pricing.railingRate).toBe(30);
  });

  test("update_rate on unknown field is a no-op (errors but no schema change)", () => {
    const before = base();
    const r = applyKitSchemaDiff(before, { fieldsToUpdate: [{ identifier: "Nonexistent", changes: { rate: 99 } }] });
    expect(r.changes.length).toBe(0);
    expect(r.errors.length).toBe(1);
    expect(r.schema).toBe(before);
  });

  test("update_field rename", () => {
    const r = applyKitSchemaDiff(base(), { fieldsToUpdate: [{ identifier: "railing", changes: { label: "Cable Railing" } }] });
    const f = r.schema.fields.find(x => x.id === "railing")!;
    expect(f.label).toBe("Cable Railing");
  });

  test("change_unit on a number field", () => {
    const r = applyKitSchemaDiff(base(), { fieldsToUpdate: [{ identifier: "railing", changes: { unit: "sqft" } }] });
    const f = r.schema.fields.find(x => x.id === "railing")!;
    expect(f.unit).toBe("sqft");
  });

  test("change_type number → toggle forces unit=flat", () => {
    const r = applyKitSchemaDiff(base(), { fieldsToUpdate: [{ identifier: "railing", changes: { type: "toggle" } }] });
    const f = r.schema.fields.find(x => x.id === "railing")!;
    expect(f.type).toBe("toggle");
    expect(f.unit).toBe("flat");
  });

  test("change_type with relabel (Frame Protection case)", () => {
    const r = applyKitSchemaDiff(base(), {
      fieldsToUpdate: [{
        identifier: "frameProtection",
        changes: { type: "toggle", label: "Include Frame Protection" },
      }],
    });
    const f = r.schema.fields.find(x => x.id === "frameProtection")!;
    expect(f.type).toBe("toggle");
    expect(f.unit).toBe("flat");
    expect(f.label).toBe("Include Frame Protection");
  });

  test("add_field number with rate + unit", () => {
    const r = applyKitSchemaDiff(base(), { fieldsToAdd: [{ label: "Stairs", rate: 75, unit: "each", type: "number" }] });
    const f = r.schema.fields.find(x => x.label === "Stairs")!;
    expect(f.type).toBe("number");
    expect(f.unit).toBe("each");
    expect(f.group).toBe("dimensions");
    expect(r.schema.pricing[`${f.id}Rate`]).toBe(75);
  });

  test("add_field toggle defaults to fees group + flat unit", () => {
    const r = applyKitSchemaDiff(base(), { fieldsToAdd: [{ label: "Inspection", rate: 200, unit: "flat", type: "toggle" }] });
    const f = r.schema.fields.find(x => x.label === "Inspection")!;
    expect(f.type).toBe("toggle");
    expect(f.unit).toBe("flat");
    expect(f.group).toBe("fees");
    expect(r.schema.pricing[`${f.id}Rate`]).toBe(200);
  });

  test("remove_field drops field + pricing rate", () => {
    const r = applyKitSchemaDiff(base(), { fieldsToRemove: ["Permit"] });
    expect(r.schema.fields.some(x => x.id === "permit")).toBe(false);
    expect(r.schema.pricing.permitRate).toBeUndefined();
  });

  test("remove_field on unknown identifier is a no-op", () => {
    const before = base();
    const r = applyKitSchemaDiff(before, { fieldsToRemove: ["Nonexistent"] });
    expect(r.changes.length).toBe(0);
    expect(r.errors.length).toBe(1);
    expect(r.schema).toBe(before);
  });

  test("empty diff is a no-op (returns same schema reference)", () => {
    const before = base();
    const r = applyKitSchemaDiff(before, {});
    expect(r.changes.length).toBe(0);
    expect(r.schema).toBe(before);
  });
});

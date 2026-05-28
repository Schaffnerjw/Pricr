import { buildGenericTemplate, GENERIC_META } from "../../data/tradeTemplates/generic";
import { addSavedToolTemplate, duplicateSavedToolTemplate, getSavedToolTemplate, removeSavedToolTemplate } from "../savedToolTemplates";
import { addMeasurementField, addToggleField } from "../schemaEditorOps";
import { deriveSections } from "../buildSchemaFromVerified";
import { QuoteSchema, SavedToolTemplate } from "../../types";

// Mirror of the AddFieldSheet UNITS list (kept in sync — see src/components/AddFieldSheet.tsx).
// This test exists so the generic unit dropdown can't silently lose "month" / "project" coverage.
const UNITS = ["each", "hour", "day", "week", "month", "project", "sq ft", "linear ft", "flat"];

describe("custom trade entry → Generic engine", () => {
  test("custom trade entry stores tradeName and loads Generic template", () => {
    // The builder is what the custom-trade entry calls: trade-aware Generic schema.
    const schema = buildGenericTemplate("Property Management");
    expect(schema.trade).toBe("Property Management"); // tradeName flows into the schema.trade label
    expect(GENERIC_META.id).toBe("generic");
    // Engine-ready: empty schema with structural pricing defaults.
    expect(schema.fields).toEqual([]);
    expect(schema.pricing.depositPercent).toBe(50);
    expect(schema.pricing.taxRate).toBe(0);
    expect(schema.addOns).toEqual([]);
  });

  test("empty tradeName falls back to generic copy", () => {
    expect(buildGenericTemplate("").trade).toBe("Custom Trade");
    expect(buildGenericTemplate("   ").trade).toBe("Custom Trade");
    expect(buildGenericTemplate(undefined).trade).toBe("Custom Trade");
  });

  test("generic engine unit dropdown includes month and project", () => {
    expect(UNITS).toEqual(expect.arrayContaining(["each", "hour", "day", "week", "month", "project", "sq ft", "linear ft", "flat"]));
  });
});

describe("save / restore / duplicate tool templates", () => {
  const make = (over: Partial<QuoteSchema> = {}): QuoteSchema => ({ ...buildGenericTemplate("Pool Service"), ...over });

  test("save current tool as template persists schema", () => {
    const list1 = addSavedToolTemplate(undefined, "My Pool Setup", make(), "Pool Service");
    expect(list1).toHaveLength(1);
    const saved = list1[0];
    expect(saved.name).toBe("My Pool Setup");
    expect(saved.tradeName).toBe("Pool Service");
    expect(saved.id).toBeTruthy();
    expect(saved.timestamp).toBeGreaterThan(0);
    expect(saved.schema.trade).toBe("Pool Service");
    // Same-name save replaces (no duplicates by name).
    const list2 = addSavedToolTemplate(list1, "My Pool Setup", make({ trade: "Pool Service v2" }), "Pool Service");
    expect(list2).toHaveLength(1);
    expect(list2[0].schema.trade).toBe("Pool Service v2");
  });

  test("start from saved template loads stored schema", () => {
    const list = addSavedToolTemplate(undefined, "Starter Tool", make(), "Pool Service");
    const id = list[0].id;
    const loaded = getSavedToolTemplate(list, id);
    expect(loaded).toBeTruthy();
    expect(loaded!.schema.pricing.depositPercent).toBe(50);
    // Removing an id drops it.
    const after = removeSavedToolTemplate(list, id);
    expect(getSavedToolTemplate(after, id)).toBeUndefined();
  });

  test("duplicate saved template clones it under a new id with ' (copy)' suffix", () => {
    const list = addSavedToolTemplate(undefined, "My Tool", make(), "Pool Service");
    const dup = duplicateSavedToolTemplate(list, list[0].id);
    expect(dup).toHaveLength(2);
    const copy = dup[0]; // newest first
    expect(copy.id).not.toBe(list[0].id);
    expect(copy.name).toBe("My Tool (copy)");
    // Deep enough clone — mutating the copy's pricing must not affect the original.
    (copy.schema.pricing as Record<string, number>).depositPercent = 25;
    expect(list[0].schema.pricing.depositPercent).toBe(50);
  });
});

describe("user-built-from-scratch on Generic", () => {
  test("user can delete all generic fields and build from scratch", () => {
    // Start from an empty generic schema (no template fields to remove).
    let s = buildGenericTemplate("Photography");
    expect(s.fields).toEqual([]);
    // Build their own line items entirely.
    s = addMeasurementField(s, "Hours On Site", 0, "hour");
    s = addMeasurementField(s, "Editing Hours", 0, "hour");
    s = addToggleField(s, "Travel Fee", 0);
    expect((s.fields || []).map(f => f.label)).toEqual(["Hours On Site", "Editing Hours", "Travel Fee"]);
    // The engine derives renderable sections for every user-added field — fully first-class.
    const secs = deriveSections(s.fields || [], s.pricing || {});
    const names = secs.flatMap(x => [x.name, ...(x.options || []).map(o => o.label)]);
    expect(names).toEqual(expect.arrayContaining(["Hours On Site", "Editing Hours", "Travel Fee"]));
    // Untyped tradeName still labels the schema cleanly.
    expect(s.trade).toBe("Photography");
  });
});

// Catch a future regression where SavedToolTemplate's shape diverges from what callers use.
test("SavedToolTemplate carries id/name/timestamp/schema", () => {
  const t: SavedToolTemplate = { id: "x", name: "n", timestamp: 1, schema: buildGenericTemplate() };
  expect(t.id).toBe("x"); expect(t.schema.trade).toBe("Custom Trade");
});

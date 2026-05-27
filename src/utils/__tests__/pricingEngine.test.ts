import { SchemaSection } from "../../types/schema";
import { AddOnSelection, QuoteSelections } from "../../types/lineItems";
import { buildLineItems, computeQuoteTotal, validateQuoteTotal, sumLineItems } from "../pricingEngine";

// ── Shared fixtures ──
const hemmaSections: SchemaSection[] = [
  {
    id: "decking", name: "Decking", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: false,
    quantityUnit: "sq ft", quantityFieldId: "decking_qty",
    options: [
      { id: "timbertech_reserve_0", label: "TimberTech Reserve", rate: 22, unit: "sq ft" },
      { id: "pressure_treated_1", label: "Pressure Treated", rate: 12, unit: "sq ft" },
    ],
  },
  {
    id: "railing", name: "Railing", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: false,
    quantityUnit: "lf", quantityFieldId: "railing_qty",
    options: [
      { id: "cable_rail_0", label: "Cable Rail", rate: 39, unit: "lf" },
      { id: "wood_rail_1", label: "Wood Rail", rate: 25, unit: "lf" },
    ],
  },
];
const hemmaSelections: QuoteSelections = {
  decking: { optionIds: ["timbertech_reserve_0"], quantities: { timbertech_reserve_0: 320 } },
  railing: { optionIds: ["cable_rail_0"], quantities: { cable_rail_0: 48 } },
};
const permitAddOn: AddOnSelection[] = [{ id: "permit", label: "Permit", price: 20 }];

describe("pricingEngine — golden scenarios", () => {
  test("Hemma Decks — TimberTech Reserve 320 sqft + Cable Rail 48lf + Permit", () => {
    // 320×$22 = 7040, 48×$39 = 1872, Permit $20 → 8932; deposit 50% → 4466
    const q = buildLineItems(hemmaSections, hemmaSelections, permitAddOn, null, { depositPercent: 50 });
    expect(q.subtotal).toBe(8932);
    expect(q.discount).toBe(0);
    expect(q.total).toBe(8932);
    expect(q.depositAmount).toBe(4466);
    expect(q.hasErrors).toBe(false);
    expect(validateQuoteTotal(q).ok).toBe(true);
  });

  test("linked calculation — Frame Protection × Frame Materials", () => {
    // Frame Materials: 300 sq ft at $3.50 = $1,050.
    // Frame Protection: linked to Frame Materials, $0.50/sq ft → 300 × $0.50 = $150.
    const sections: SchemaSection[] = [
      {
        id: "frame_materials", name: "Frame Materials", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: false,
        quantityUnit: "sq ft", options: [{ id: "frame_materials", label: "Frame Materials", rate: 3.5, unit: "sq ft" }],
      },
      {
        id: "_flat_fees", name: "Fees & Options", pattern: "FLAT_RATE", allowMultiSelect: true,
        options: [{ id: "frame_protection", label: "Frame Protection", rate: 0, unit: "sq ft", linkedTo: "Frame Materials", multiplier: 0.5 }],
      },
    ];
    const selections: QuoteSelections = {
      frame_materials: { optionIds: ["frame_materials"], quantities: { frame_materials: 300 } },
      _flat_fees: { optionIds: ["frame_protection"], quantities: {} },
    };
    const q = buildLineItems(sections, selections, [], null);
    const frame = q.lineItems.find(li => li.optionId === "frame_materials")!;
    const prot = q.lineItems.find(li => li.optionId === "frame_protection")!;
    expect(frame.total).toBe(1050);
    expect(prot.quantity).toBe(300);
    expect(prot.rate).toBe(0.5);
    expect(prot.total).toBe(150);
    expect(prot.label).toContain("300");
    expect(q.subtotal).toBe(1200);
    expect(q.hasErrors).toBe(false);
    expect(validateQuoteTotal(q).ok).toBe(true);
  });

  test("Lawn care — Mowing $50 + Fertilizing $65 + Aeration $85", () => {
    const sections: SchemaSection[] = [{
      id: "services", name: "Services", pattern: "FLAT_RATE", allowMultiSelect: true, options: [
        { id: "mowing_0", label: "Mowing", rate: 50, unit: "flat" },
        { id: "fertilizing_1", label: "Fertilizing", rate: 65, unit: "flat" },
        { id: "aeration_2", label: "Aeration", rate: 85, unit: "flat" },
      ],
    }];
    const selections: QuoteSelections = { services: { optionIds: ["mowing_0", "fertilizing_1", "aeration_2"], quantities: {} } };
    const q = buildLineItems(sections, selections, [], null);
    expect(q.subtotal).toBe(200);
    expect(q.total).toBe(200);
    expect(validateQuoteTotal(q).ok).toBe(true);
  });

  test("Moving — 4 hours at $150/hr + 2 movers at $75/hr", () => {
    const sections: SchemaSection[] = [{
      id: "labor", name: "Labor", pattern: "LABOR", allowMultiSelect: true, quantityUnit: "hour", options: [
        { id: "crew_hours_0", label: "Crew Hours", rate: 150, unit: "hour" },
        { id: "extra_mover_1", label: "Extra Mover", rate: 75, unit: "hour" },
      ],
    }];
    const selections: QuoteSelections = {
      labor: { optionIds: ["crew_hours_0", "extra_mover_1"], quantities: { crew_hours_0: 4, extra_mover_1: 2 } },
    };
    const q = buildLineItems(sections, selections, [], null);
    expect(q.subtotal).toBe(750);
    expect(q.total).toBe(750);
    expect(validateQuoteTotal(q).ok).toBe(true);
  });

  test("Discount — $8,932 with 10% discount", () => {
    const q = buildLineItems(hemmaSections, hemmaSelections, permitAddOn, { mode: "percent", value: 10 });
    expect(q.subtotal).toBe(8932);
    expect(q.discount).toBe(893.2);
    expect(q.total).toBe(8038.8);
    expect(validateQuoteTotal(q).ok).toBe(true);
  });

  test("Empty quote — no selections", () => {
    const q = buildLineItems(hemmaSections, {}, [], null);
    expect(q.subtotal).toBe(0);
    expect(q.total).toBe(0);
    expect(q.hasErrors).toBe(false);
    expect(q.lineItems.length).toBe(0);
  });

  test("Invalid option ID — option not found in schema is surfaced, not silent", () => {
    const selections: QuoteSelections = { decking: { optionIds: ["does_not_exist"], quantities: { does_not_exist: 100 } } };
    const q = buildLineItems(hemmaSections, selections, [], null);
    const line = q.lineItems.find(li => li.optionId === "does_not_exist");
    expect(line).toBeDefined();
    expect(line!.total).toBe(0);
    expect(line!.error).toBe("Rate not found");
    expect(q.hasErrors).toBe(true);
  });

  test("validateQuoteTotal — asserts the math is internally consistent", () => {
    const q = buildLineItems(hemmaSections, hemmaSelections, permitAddOn, { mode: "amount", value: 500 }, { taxRate: 7, depositPercent: 50 });
    // subtotal 8932, -500 discount = 8432, +7% tax = 590.24 → total 9022.24
    expect(q.subtotal).toBe(8932);
    expect(q.discount).toBe(500);
    expect(q.tax).toBe(590.24);
    expect(q.total).toBe(9022.24);
    expect(validateQuoteTotal(q).ok).toBe(true);
  });

  test("computeQuoteTotal + sumLineItems reduce correctly", () => {
    const q = buildLineItems(hemmaSections, hemmaSelections, permitAddOn, null);
    const recomputed = computeQuoteTotal(q.lineItems);
    expect(recomputed.subtotal).toBe(8932);
    expect(sumLineItems(q.lineItems.filter(li => li.type !== "discount"))).toBe(8932);
  });

  test("Legacy fallback — an option id mismatch resolves by label, no error", () => {
    const sections: SchemaSection[] = [{
      id: "deck", name: "Decking", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: false, quantityUnit: "sq ft",
      options: [{ id: "new_cedar_0", label: "Cedar", rate: 10, unit: "sq ft" }],
    }];
    // The saved selection references an OLD id but carries the label/rate for fallback matching.
    const selections: QuoteSelections = { deck: { optionIds: ["old_cedar"], quantities: { old_cedar: 5 }, labels: { old_cedar: "cedar" }, rates: { old_cedar: 10 } } };
    const q = buildLineItems(sections, selections, [], null);
    expect(q.hasErrors).toBe(false);
    expect(q.subtotal).toBe(50);
  });

  test("Multi-select — one line item per selected option (Deck Lighting)", () => {
    const sections: SchemaSection[] = [{
      id: "lighting", name: "Deck Lighting", pattern: "MATERIAL_MEASUREMENT", allowMultiSelect: true, quantityUnit: "each",
      options: [
        { id: "accent_0", label: "Accent Lights", rate: 75, unit: "each" },
        { id: "strip_1", label: "Strip Lights", rate: 130, unit: "each" },
        { id: "riser_2", label: "Riser Lights", rate: 125, unit: "each" },
      ],
    }];
    const selections: QuoteSelections = { lighting: { optionIds: ["accent_0", "strip_1"], quantities: { accent_0: 6, strip_1: 3 } } };
    const q = buildLineItems(sections, selections, [], null);
    expect(q.lineItems.filter(li => li.type !== "discount").length).toBe(2);
    expect(q.subtotal).toBe(840); // 6×$75 + 3×$130
    expect(validateQuoteTotal(q).ok).toBe(true);
  });
});

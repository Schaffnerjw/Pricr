// Fix 4 — Kit SCHEMA_DIFF parser permissiveness. The previous behavior rejected the entire diff
// (or silently dropped entries) when one field was missing an optional value like "unit". The
// kernel already defaults missing optional fields (mapType → "number", unitFor → "each"), but
// the silent-skip for missing label / identifier hid partial failures from the contractor — they
// saw "✓ Added 2 things" when 3 were intended. The Batch A honest-failure path stays intact for
// genuinely unparseable input.
import { applyKitSchemaDiff } from "../applyKitSchemaDiff";
import { decideKitDiffResponse } from "../kitResponseRenderer";
import { QuoteSchema } from "../../types";

const blank = (): QuoteSchema => ({
  trade: "Decking", fields: [], pricing: { depositPercent: 25 }, addOns: [], calculation: "", summaryLines: [],
});

describe("Fix 4 — SCHEMA_DIFF permissive defaults + partial-success", () => {
  test("SCHEMA_DIFF applies field with default unit when unit is missing", () => {
    // Sentry case: LLM omitted "unit" on a fieldsToAdd entry. The kernel must default to "each"
    // (or "flat" for toggle) and apply the entry, not reject the whole diff.
    const r = applyKitSchemaDiff(blank(), {
      fieldsToAdd: [{ label: "Mileage", rate: 1.5, unit: undefined as unknown as string, type: "number" }],
    });
    expect(r.changes.length).toBe(1);
    expect(r.errors.length).toBe(0);
    const added = r.schema.fields.find(f => f.label === "Mileage");
    expect(added).toBeDefined();
    expect(added!.unit).toBe("each"); // default unit for non-toggle when LLM omits it
  });

  test("SCHEMA_DIFF applies field with default type when type is missing", () => {
    const r = applyKitSchemaDiff(blank(), {
      fieldsToAdd: [{ label: "Extras", rate: 50, unit: "each", type: undefined as unknown as "toggle" | "number" | "select" }],
    });
    expect(r.changes.length).toBe(1);
    expect(r.errors.length).toBe(0);
    const added = r.schema.fields.find(f => f.label === "Extras");
    expect(added!.type).toBe("number"); // mapType's documented default when the LLM omits type
  });

  test("SCHEMA_DIFF applies field with default rate when rate is missing", () => {
    // Missing rate → priced at $0, contractor fills it in. Critical: do NOT reject the entry
    // just because the LLM didn't pick a number.
    const r = applyKitSchemaDiff(blank(), {
      fieldsToAdd: [{ label: "Travel", unit: "flat", type: "toggle", rate: undefined as unknown as number }],
    });
    expect(r.changes.length).toBe(1);
    expect(r.errors.length).toBe(0);
    expect(r.schema.pricing.travelRate).toBe(0);
  });

  test("SCHEMA_DIFF rejects field missing label but applies other valid fields in same diff", () => {
    // The whole point of the fix: one bad entry should NOT take down the rest of the batch. The
    // valid Stairs entry applies; the unlabeled one is reported as an error so the user knows.
    const r = applyKitSchemaDiff(blank(), {
      fieldsToAdd: [
        { label: "Stairs", rate: 800, unit: "flat", type: "toggle" },
        { rate: 100, unit: "each", type: "number" } as unknown as { label: string; rate: number; unit: string; type: "number" },
      ],
    });
    expect(r.changes.length).toBe(1); // Stairs applied
    expect(r.errors.length).toBe(1);  // unlabeled entry surfaced
    expect(r.errors[0]).toMatch(/missing label/i);
    expect(r.schema.fields.find(f => f.label === "Stairs")).toBeDefined();
  });

  test("SCHEMA_DIFF rejects add-on missing label but applies other add-ons in same diff", () => {
    // Same partial-success contract for addOnsToAdd.
    const r = applyKitSchemaDiff(blank(), {
      addOnsToAdd: [
        { label: "Permit", price: 150 },
        { price: 50 } as unknown as { label: string; price: number },
      ],
    });
    expect(r.changes.length).toBe(1);
    expect(r.errors.length).toBe(1);
    expect(r.errors[0]).toMatch(/missing label/i);
    expect(r.schema.addOns.find(a => a.label === "Permit")).toBeDefined();
  });

  test("SCHEMA_DIFF honest-failure path still fires for completely unparseable input", () => {
    // The Batch A honest-failure path must stay intact. When the parser returns null (no diff
    // could be extracted at all), the renderer must still emit the "couldn't read it" message —
    // we did NOT loosen the gate to silently accept gibberish.
    const decision = decideKitDiffResponse({
      diffParsed: false,
      changes: [],
      errors: [],
      displayMessage: "I'll try…",
    });
    expect(decision.kind).toBe("unparseable");
    expect(decision.text).toMatch(/couldn['']t read/i);
  });

  test("partial-success message tells user how many applied vs skipped and why", () => {
    // The chat copy when a partial succeeds: "Applied 2 of 3 — skipped 1: <reason>". Pinning the
    // shape so future copy tweaks can't accidentally drop the count or the reason.
    const decision = decideKitDiffResponse({
      diffParsed: true,
      changes: ["Added Stairs at $800 flat", "Added Lighting at $450 flat"],
      errors: ["Skipped a new field — missing label"],
      displayMessage: "Got it.",
    });
    expect(decision.kind).toBe("applied");
    expect(decision.text).toMatch(/Applied 2 of 3/);
    expect(decision.text).toMatch(/skipped 1/);
    expect(decision.text).toMatch(/missing label/);
  });

  test("empty errors don't show a 'skipped 0' footer when everything applied cleanly", () => {
    // Guardrail: when errors.length === 0 the footer is suppressed entirely — no "Applied 2 of
    // 2 — skipped 0" noise on the happy path.
    const decision = decideKitDiffResponse({
      diffParsed: true,
      changes: ["Added Stairs at $800 flat"],
      errors: [],
      displayMessage: "",
    });
    expect(decision.kind).toBe("applied");
    expect(decision.text).not.toMatch(/Applied/);
    expect(decision.text).not.toMatch(/skipped/);
  });
});

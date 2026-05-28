import { computeBusinessAnalytics } from "../../hooks/useBusinessAnalytics";
import { commonFieldsForTrade, tradeIdFromName } from "../../data/commonFields";
import { addMeasurementField } from "../schemaEditorOps";
import { deriveSections } from "../buildSchemaFromVerified";
import { QuoteSchema, SavedQuote } from "../../types";

// Unicode emoji ranges: Misc Symbols & Pictographs, Emoticons, Transport, Misc Technical, etc.
// Plus common single-codepoint emoji we ship with (✓ is allowed in text; we're checking PICTORIAL emoji).
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("no emoji in StatsScreen badge chrome", () => {
  test("brag-card badges use Feather icon names, not emoji", () => {
    // Build a synthetic history that triggers every milestone badge condition.
    const day = 86400000;
    const now = Date.now();
    const repName = "Rep";
    const mk = (over: Partial<SavedQuote>): SavedQuote => ({
      id: String(Math.random()), timestamp: now - day, customerName: "C", trade: "T",
      total: 12000, deposit: 0, fieldValues: {}, userId: "u", repName, status: "won",
      signedAt: now - day + 60_000, // 60s to sign → fastestCloseMin ~1
      ...over,
    });
    const quotes: SavedQuote[] = [
      mk({}), mk({ timestamp: now }), // 2 day streak
    ];
    const a = computeBusinessAnalytics(quotes);
    expect(a.badges.length).toBeGreaterThan(0);
    for (const b of a.badges) {
      // Every badge icon is now a Feather name (kebab-case ASCII), never an emoji.
      expect(EMOJI_RE.test(b.icon)).toBe(false);
      expect(/^[a-z][a-z-]*[a-z]$/.test(b.icon)).toBe(true);
    }
  });
});

describe("common fields per trade in AddFieldSheet", () => {
  test("trade-id resolves common trade names", () => {
    expect(tradeIdFromName("Roadside Mechanic")).toBe("roadside");
    expect(tradeIdFromName("Deck Building")).toBe("decks");
    expect(tradeIdFromName("Construction")).toBe("construction");
    expect(tradeIdFromName("Handyman")).toBe("handyman");
    expect(tradeIdFromName("Cleaning")).toBe("generic");
    expect(tradeIdFromName(undefined)).toBe("generic");
  });

  test("each trade's common fields contain the spec-required entries", () => {
    const rs = commonFieldsForTrade("Roadside Mechanic").map(c => c.label);
    expect(rs).toEqual(expect.arrayContaining(["Tow distance", "Vehicle weight class", "Emergency surcharge"]));

    const hm = commonFieldsForTrade("Handyman").map(c => c.label);
    expect(hm).toEqual(expect.arrayContaining(["Travel beyond city limits", "Disposal fee", "Permit assistance fee"]));

    const dk = commonFieldsForTrade("Decking").map(c => c.label);
    expect(dk).toEqual(expect.arrayContaining(["Lighting package", "Privacy wall", "Built-in planter"]));

    const ct = commonFieldsForTrade("Construction").map(c => c.label);
    expect(ct).toEqual(expect.arrayContaining(["Architect fee passthrough", "Engineering fee", "Demolition disposal"]));

    expect(commonFieldsForTrade("Other")).toEqual([]); // Generic gets only the basic chip types
  });

  test("common field drops in with blank price and placeholder", () => {
    for (const trade of ["Roadside", "Handyman", "Decks", "Construction"]) {
      for (const c of commonFieldsForTrade(trade)) {
        expect(c.rate).toBe(0);              // blank — contractor sets their own
        expect(c.placeholder.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("user-added field parity", () => {
  test("user-added field is included in calculations and snapshot (same as template fields)", () => {
    const empty: QuoteSchema = { trade: "Generic", fields: [], pricing: {}, addOns: [], calculation: "", summaryLines: [] };
    // Add a custom field via the same op a Common-Field pill uses.
    const next = addMeasurementField(empty, "Yard Cleanup", 0, "hr");
    // Schema carries the new field + a (blank, contractor-set) rate key — first-class with template fields.
    const added = (next.fields || []).find(f => f.label === "Yard Cleanup");
    expect(added).toBeTruthy();
    expect(next.pricing[`${added!.id}Rate`]).toBe(0);
    // Renderable section appears (same path the engine uses to compute line items + snapshot).
    const secs = deriveSections(next.fields || [], next.pricing || {});
    expect(secs.some(s => s.name === "Yard Cleanup")).toBe(true);
  });
});

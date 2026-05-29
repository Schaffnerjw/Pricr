// Path A — the honesty gate Kit's user-visible language MUST flow through. Three concerns:
//   (a) The gate's outputs are correct (parse-fail / zero-changes / partial / success).
//   (b) The COMMAND, SCHEMA_UPDATE, and CONFIG_UPDATED response paths in QuoteScreen.tsx all
//       route through decideKitDiffResponse (verified by source-code assertion — the same
//       "grep-assert" pattern the existing kitBuilderGate test uses).
//   (c) Path B operations + Path A gate together: an op that fails inside the kernel produces
//       an honest "couldn't apply" message, never a "✓ Updated" lie.
import { readFileSync } from "fs";
import { join } from "path";
import { decideKitDiffResponse } from "../kitResponseRenderer";
import { applyKitSchemaDiff } from "../applyKitSchemaDiff";
import { QuoteSchema } from "../../types";

const QUOTE_SCREEN = readFileSync(join(__dirname, "..", "..", "screens", "QuoteScreen.tsx"), "utf8");

// ────────────────────────────────────────────────────────────────────────────────────────────
// (a) Gate outputs — pinning the contracts Path A depends on
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path A — honesty gate outputs", () => {
  const SUCCESS_LANGUAGE = /✓|✅|Updated|Added|Removed|Renamed|Moved|Restructured/i;

  test("Kit cannot emit success language when parse failed", () => {
    const d = decideKitDiffResponse({ diffParsed: false, changes: [], errors: [], displayMessage: "✓ Updated railing rate." });
    expect(d.kind).toBe("unparseable");
    // The renderer drops Kit's prose entirely on parse-fail — no success language reaches the user.
    expect(d.text).not.toMatch(SUCCESS_LANGUAGE);
    expect(d.text).toMatch(/couldn['']t read/i);
  });

  test("Kit cannot emit success language when SCHEMA_DIFF applied zero changes", () => {
    const d = decideKitDiffResponse({ diffParsed: true, changes: [], errors: [], displayMessage: "I've added the Tenant Placement Fee.\n\n✓ Added Tenant Placement Fee at $450 flat" });
    expect(d.kind).toBe("no-op");
    expect(d.text).not.toMatch(SUCCESS_LANGUAGE);
    expect(d.text).toMatch(/couldn['']t apply/i);
  });

  test("partial-success renders 'Applied N of M — skipped M:' with the reasons", () => {
    const d = decideKitDiffResponse({
      diffParsed: true,
      changes: ["Added Stairs at $800 flat", "Added Lighting at $450 flat"],
      errors: ["Skipped a new field — missing label"],
      displayMessage: "Got it.",
    });
    expect(d.kind).toBe("applied");
    expect(d.text).toMatch(/Applied 2 of 3/);
    expect(d.text).toMatch(/skipped 1/);
    expect(d.text).toMatch(/missing label/);
  });

  test("full-success shows success language ONLY when there are real changes", () => {
    const d = decideKitDiffResponse({ diffParsed: true, changes: ["Added Stairs at $800 flat"], errors: [], displayMessage: "" });
    expect(d.kind).toBe("applied");
    expect(d.text).toMatch(/✓ Added Stairs/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// (b) Source-code audit — every Kit response path flows through decideKitDiffResponse
// ────────────────────────────────────────────────────────────────────────────────────────────

describe("Path A — every Kit mutation path routes through the gate", () => {
  test("SCHEMA_DIFF path routes through decideKitDiffResponse", () => {
    // The original gated path — pinning the call site so a future refactor can't drop the gate.
    expect(QUOTE_SCREEN).toMatch(/SCHEMA_DIFF_START[\s\S]{1,1200}decideKitDiffResponse\(/);
  });

  test("COMMAND path routes through decideKitDiffResponse (Path A gate-closure)", () => {
    // Before this batch, the COMMAND path emitted `finish(displayMessage || \`✓ ${result.description}.\`)`
    // — a direct echo of Kit's prose. The fix synthesizes changes/errors from the kernel's
    // KitCommandResult and runs them through the gate. Pin the call site:
    expect(QUOTE_SCREEN).toMatch(/COMMAND_START[\s\S]{1,1500}decideKitDiffResponse\(/);
  });

  test("SCHEMA_UPDATE legacy path routes through decideKitDiffResponse (Path A gate-closure)", () => {
    expect(QUOTE_SCREEN).toMatch(/SCHEMA_UPDATE_START[\s\S]{1,1500}decideKitDiffResponse\(/);
  });

  test("CONFIG_UPDATED full-rewrite path routes through decideKitDiffResponse (Path A gate-closure)", () => {
    expect(QUOTE_SCREEN).toMatch(/CONFIG_UPDATED[\s\S]{1,1500}decideKitDiffResponse\(/);
  });

  test("displayMessage is never finish()'d directly on a mutation-attempt failure", () => {
    // Guardrail: the COMMAND / SCHEMA_UPDATE / CONFIG_UPDATED blocks must NOT end with
    // `finish(displayMessage)` directly after a mutation-attempt failure — that's the exact
    // bypass shape Path A was built to prevent. The single legitimate `finish(displayMessage ||
    // reply)` is the informational fallback at the very end of the agent handler (no mutation
    // markers in the reply at all), which is correct behavior.
    const informationalFallback = (QUOTE_SCREEN.match(/finish\(displayMessage \|\| reply\)/g) || []).length;
    expect(informationalFallback).toBe(1);
    // The kept NO_CHANGE path inside the COMMAND block is the only other legitimate use of a
    // raw `finish(displayMessage || "Done.")` — Kit explicitly told us "no change", not a failure.
    const noChangePath = (QUOTE_SCREEN.match(/NO_CHANGE[\s\S]{1,200}finish\(displayMessage \|\| "Done\.\"\)/g) || []).length;
    expect(noChangePath).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────
// (c) Path A + Path B together — failing structural ops produce honest messages
// ────────────────────────────────────────────────────────────────────────────────────────────

const tinySchema = (): QuoteSchema => ({
  trade: "x", fields: [{ id: "permit", label: "Permit", type: "toggle", unit: "flat", group: "fees" }],
  pricing: { permitRate: 200 }, addOns: [], calculation: "", summaryLines: [],
  sections: [{ id: "fees", name: "Fees", pattern: "FLAT_RATE", options: [{ id: "permit", label: "Permit", rate: 200, unit: "flat" }], allowMultiSelect: true }],
});

describe("Path A + Path B — structural-op failures stay honest", () => {
  test("setSectionProperty on missing section → kernel errors → renderer says couldn't apply", () => {
    const k = applyKitSchemaDiff(tinySchema(), {
      sectionsToSetProperty: [{ sectionIdentifier: "Nope", property: "allowMultiSelect", value: true }],
    });
    const d = decideKitDiffResponse({ diffParsed: true, changes: k.changes, errors: k.errors, displayMessage: "✓ Multi-select on." });
    expect(d.kind).toBe("errors-only");
    expect(d.text).toMatch(/Couldn['']t apply/);
    expect(d.text).not.toMatch(/Multi-select on/); // Kit's prose dropped
  });

  test("moveField targeting unknown section → honest error, no '✓ Moved' lie", () => {
    const k = applyKitSchemaDiff(tinySchema(), {
      fieldsToMove: [{ fieldIdentifier: "Permit", targetSectionIdentifier: "Phantom" }],
    });
    const d = decideKitDiffResponse({ diffParsed: true, changes: k.changes, errors: k.errors, displayMessage: "✓ Moved Permit to Phantom" });
    expect(d.kind).toBe("errors-only");
    expect(d.text).toMatch(/couldn['']t find target section/i);
    expect(d.text).not.toMatch(/✓ Moved/);
  });

  test("removeSection without confirm → honest reject, schema unchanged", () => {
    const before = tinySchema();
    const k = applyKitSchemaDiff(before, {
      sectionsToRemove: [{ sectionIdentifier: "Fees", confirm: false }],
    });
    expect(k.changes).toEqual([]);
    expect(k.errors[0]).toMatch(/without explicit confirm/);
    const d = decideKitDiffResponse({ diffParsed: true, changes: k.changes, errors: k.errors, displayMessage: "✓ Removed Fees section." });
    expect(d.kind).toBe("errors-only");
    expect(d.text).not.toMatch(/✓ Removed/);
  });

  test("restructureSection lossy conversion → honest reject, no '✓ Restructured' lie", () => {
    const k = applyKitSchemaDiff(tinySchema(), {
      sectionsToRestructure: [{ sectionIdentifier: "Fees", newShape: "selector-with-quantity" }],
    });
    const d = decideKitDiffResponse({ diffParsed: true, changes: k.changes, errors: k.errors, displayMessage: "✓ Restructured Fees." });
    // Fees is FLAT_RATE → shapeOf returns "single-toggle"; conversion to selector-with-quantity
    // is rejected as lossy.
    expect(d.kind).toBe("errors-only");
    expect(d.text).not.toMatch(/✓ Restructured/);
    expect(d.text).toMatch(/use the editor/i);
  });
});

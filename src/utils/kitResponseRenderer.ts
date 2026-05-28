// Pure renderer for Kit's SCHEMA_DIFF responses. The LLM's text reply often contains success-
// language prose ("✓ Added Tenant Placement Fee at $450 flat") regardless of whether the
// accompanying SCHEMA_DIFF block actually mutated the schema. If the diff parsed but applied
// zero changes — e.g. fieldsToAdd entries missing a label, addOnsToAdd missing required fields,
// or every fieldsToUpdate identifier failing to resolve — applyKitSchemaDiff silently returns
// changes=[] errors=[]. Echoing Kit's prose in that case lies to the contractor (the chat says
// the item was added; the schema says nothing happened; the Save button stays greyed). This
// helper makes the response decision a pure function so it's testable and the chat handler
// can't drift back to echoing prose on failure.

export type KitDiffDecision =
  | { kind: "applied"; text: string }       // ≥1 change applied — show change lines + any partial errors
  | { kind: "errors-only"; text: string }   // no changes, identifiers/etc. failed — show errors
  | { kind: "no-op"; text: string }         // diff parsed but did nothing AND no errors — failure (do NOT echo Kit's prose)
  | { kind: "unparseable"; text: string };  // diff block present but JSON couldn't be parsed

const NO_OP_FAILURE_MESSAGE = "I tried to make that change but couldn't apply it — try describing it differently or add it manually.";
const UNPARSEABLE_MESSAGE = "I tried to make that change but couldn't read it — tell me again and I'll retry.";

export function decideKitDiffResponse(opts: {
  diffParsed: boolean;
  changes: string[];
  errors: string[];
  displayMessage: string;
}): KitDiffDecision {
  const { diffParsed, changes, errors, displayMessage } = opts;
  if (!diffParsed) return { kind: "unparseable", text: UNPARSEABLE_MESSAGE };
  if (changes.length > 0) {
    const changeLines = changes.map(c => `✓ ${c}`).join("\n");
    const errLine = errors.length ? `\n⚠️ Couldn't apply: ${errors.join(", ")}` : "";
    return { kind: "applied", text: `${displayMessage ? displayMessage + "\n\n" : ""}${changeLines}${errLine}` };
  }
  if (errors.length > 0) {
    return { kind: "errors-only", text: `${displayMessage ? displayMessage + "\n\n" : ""}⚠️ Couldn't apply: ${errors.join(", ")}` };
  }
  // Critical case: diff present + parsed + zero changes + zero errors. Drop Kit's prose so we
  // can't lie about a mutation that didn't happen.
  return { kind: "no-op", text: NO_OP_FAILURE_MESSAGE };
}

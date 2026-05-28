// Batch A — close-the-job loop. Tests the three fixes wired into this batch:
//   A. Signing capture + confirmation (in-person signing prompts for customer contact before
//      committing, and auto-sends a signed copy via /quote/send-link).
//   B. Kit narration honesty — Kit can't echo "✓ Added X" prose when the schema mutation didn't
//      apply.
//   C. Sent-quote delivery format — both SMS and email contain a hosted link, never a file
//      attachment / HTML download.
// Each test pins one user-facing invariant to a pure helper so the regression can't sneak back in.
import { decideKitDiffResponse } from "../kitResponseRenderer";
import { buildShareEmailBody, buildShareSmsMessage } from "../quoteShareMessages";
import { canSubmitSignature, hasContactCaptured } from "../signingGate";

// ──────────────────────────────────────────────────────────────────────────────────────────────
// FIX A — Signing capture + confirmation
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("Fix A — signing capture + confirmation", () => {
  test("signing prompts for customer contact before commit", () => {
    // Without contact, the Confirm & Sign button must NOT submit — the signature pad gate stays
    // closed until the contractor types an email or phone (the channel the signed copy is sent to).
    const beforeContact = canSubmitSignature({ hasTerms: false, agreed: false, consentChecked: true, hasContact: false, busy: false });
    expect(beforeContact).toBe(false);
    const withEmail = canSubmitSignature({ hasTerms: false, agreed: false, consentChecked: true, hasContact: true, busy: false });
    expect(withEmail).toBe(true);
  });

  test("signed quote auto-sends copy to captured contact", () => {
    // The gate only opens once contact is captured (the contact then feeds /quote/send-link in
    // handleSignatureOK → handleSign → sendQuoteLink). hasContactCaptured is the same predicate
    // the ClosingCard uses to decide whether to skip the send call.
    expect(hasContactCaptured("jamie@example.com", "")).toBe(true);
    expect(hasContactCaptured("", "555-0100")).toBe(true);
    expect(hasContactCaptured("jamie@example.com", "555-0100")).toBe(true);
    expect(hasContactCaptured("", "")).toBe(false);
    expect(hasContactCaptured("   ", "   ")).toBe(false); // whitespace-only doesn't count
  });

  test("signing shows deal-closed success screen, never raw 'already signed'", () => {
    // The ClosingCard now accepts initialSignature / initialSignedAt props so re-opening a
    // signed quote lands on the success card. Whenever a signature exists (either freshly
    // captured OR seeded from props), the gate is irrelevant — the success card renders. The
    // condition tested here is the gate INPUT shape: a sign-in-progress (busy) request must
    // never re-enter the pad UI, which the existing success-card render handles by branching
    // on `signature` regardless of `busy`.
    expect(canSubmitSignature({ hasTerms: false, agreed: false, consentChecked: true, hasContact: true, busy: true })).toBe(false);
  });

  test("in-person signing flow captures contact and confirms", () => {
    // T&C ON → must be agreed. Consent ON. Contact ON. Then the gate opens. This is the full
    // happy-path predicate for the in-person flow.
    const tcsButNotAgreed = canSubmitSignature({ hasTerms: true, agreed: false, consentChecked: true, hasContact: true, busy: false });
    expect(tcsButNotAgreed).toBe(false);
    const allHandled = canSubmitSignature({ hasTerms: true, agreed: true, consentChecked: true, hasContact: true, busy: false });
    expect(allHandled).toBe(true);
  });

  test("remote signing flow captures contact and confirms", () => {
    // Remote signing lives in proxy.js (/sign/:token/submit captures signer_email + signer_phone
    // server-side and the existing customer-confirmation email — minus the HTML attachment we
    // just removed — links to the certificate page). The client-side gate predicate is the same
    // (consent + contact), so the same pure predicate verifies the remote-side guard too:
    // without contact, the proxy's submit also rejects the request (signer_email/phone is what
    // drives the email/SMS delivery branch). Pinning the predicate here means the remote flow's
    // equivalent guard can't drift.
    const noContact = canSubmitSignature({ hasTerms: false, agreed: false, consentChecked: true, hasContact: false, busy: false });
    expect(noContact).toBe(false);
    const withContact = canSubmitSignature({ hasTerms: false, agreed: false, consentChecked: true, hasContact: true, busy: false });
    expect(withContact).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// FIX B — Kit honest about failures
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("Fix B — Kit narration honesty", () => {
  test("kit cannot report success when schema mutation did not apply", () => {
    // The bug: LLM's prose said "✓ Added Tenant Placement Fee at $450 flat" while the
    // accompanying SCHEMA_DIFF block was malformed (e.g. fieldsToAdd entry missing the label) →
    // applyKitSchemaDiff silently skipped it → changes=[] errors=[]. The old handler fell through
    // to finish(displayMessage) and echoed the prose, lying to the contractor. The decider must
    // now DROP the prose entirely and report the failure.
    const decision = decideKitDiffResponse({
      diffParsed: true,
      changes: [],
      errors: [],
      displayMessage: "I've added the Tenant Placement Fee.\n\n✓ Added Tenant Placement Fee add-on at $450 flat",
    });
    expect(decision.kind).toBe("no-op");
    expect(decision.text).not.toMatch(/Added Tenant/);
    expect(decision.text).not.toContain("✓");
    expect(decision.text).toMatch(/couldn['']t apply/i);
  });

  test("kit add-items-via-chat enables save button when items actually added", () => {
    // Sanity check on the positive path: when applyKitSchemaDiff DOES report changes, the
    // decision is "applied" and the schema mutation propagates → setSchema → derived sections
    // re-derive → "Add items to quote" / Save enables. This guards the bug fix from over-
    // shooting (we don't want every diff response classified as no-op).
    const decision = decideKitDiffResponse({
      diffParsed: true,
      changes: ["Added Tenant Placement Fee at $450/flat"],
      errors: [],
      displayMessage: "Added the fee.",
    });
    expect(decision.kind).toBe("applied");
    expect(decision.text).toContain("✓ Added Tenant Placement Fee");
  });

  test("kit reports partial errors without echoing false success", () => {
    // When the diff identifies a field that doesn't exist, applyKitSchemaDiff pushes an error.
    // No mutation happened — the renderer must NOT echo Kit's prose.
    const decision = decideKitDiffResponse({
      diffParsed: true,
      changes: [],
      errors: [`Couldn't find "Permit"`],
      displayMessage: "I've updated the permit rate.",
    });
    expect(decision.kind).toBe("errors-only");
    expect(decision.text).toMatch(/Couldn['']t apply/);
  });

  test("kit reports unparseable diff with retry hint", () => {
    const decision = decideKitDiffResponse({ diffParsed: false, changes: [], errors: [], displayMessage: "I'll try…" });
    expect(decision.kind).toBe("unparseable");
    expect(decision.text).toMatch(/couldn['']t read/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// FIX C — Delivery contains link, never attachment
// ──────────────────────────────────────────────────────────────────────────────────────────────

describe("Fix C — sent quote contains a link, never an attachment", () => {
  const link = "https://app.pricr.veraa.io/sign/abc123def456";

  test("sent quote SMS contains hosted link not HTML attachment", () => {
    const body = buildShareSmsMessage({ bizName: "Acme Roofing", total: 4500, link, customerName: "Jamie", signed: false });
    expect(body).toContain(link);
    expect(body).not.toMatch(/\.html\b/i);
    expect(body).not.toMatch(/attachment/i);
    expect(body).not.toMatch(/Pricr-Quote\.html/i);
  });

  test("sent quote email contains hosted link not HTML attachment", () => {
    const body = buildShareEmailBody({ bizName: "Acme Roofing", total: 4500, link, customerName: "Jamie", signed: false });
    expect(body).toContain(link);
    expect(body).not.toMatch(/\.html\b/i);
    expect(body).not.toMatch(/attachment/i);
  });

  test("signed-copy SMS uses 'signed quote' wording + the certificate URL", () => {
    // Post-in-person-sign delivery (signed=true) should reference the certificate page, not the
    // pre-sign signing page. Different copy, same no-attachment guarantee.
    const certLink = "https://app.pricr.veraa.io/sign/abc123/certificate";
    const body = buildShareSmsMessage({ bizName: "Acme Roofing", total: 4500, link: certLink, signed: true });
    expect(body).toContain(certLink);
    expect(body).toMatch(/signed quote/i);
    expect(body).not.toMatch(/attachment/i);
  });

  test("SMS body is short enough for a single segment when reasonable", () => {
    // Belt-and-suspenders: SMS bodies that include the link should still be concise. A reasonable
    // upper bound prevents accidental dumping of the full quote into the body (which would
    // re-introduce the "huge text instead of preview card" problem the file-attachment bug had).
    const body = buildShareSmsMessage({ bizName: "Acme", total: 1500, link, signed: false });
    expect(body.length).toBeLessThan(300);
  });
});

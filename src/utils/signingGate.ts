// Pure predicates that drive the in-person signing flow. Extracted from ClosingCard so the
// "contact must be captured before the customer can sign" invariant is testable and can't quietly
// regress: ClosingCard imports these and uses them directly to enable/disable the signature pad.

// Whether the contractor has captured at least one delivery channel for the signed copy. Trimmed
// strings — a single space doesn't count as a real address.
export function hasContactCaptured(email: string, phone: string): boolean {
  return !!(email.trim() || phone.trim());
}

// The full gate that decides whether the "Confirm & Sign" button is active. All five conditions
// must hold: any required T&C accepted, E-SIGN consent ticked, at least one contact entered,
// and no in-flight save. Without this, the customer could sign without us being able to send
// them a copy — exactly the "already signed, no resolution" dead-end the previous flow had.
export function canSubmitSignature(opts: {
  hasTerms: boolean;
  agreed: boolean;
  consentChecked: boolean;
  hasContact: boolean;
  busy: boolean;
}): boolean {
  return (!opts.hasTerms || opts.agreed) && opts.consentChecked && opts.hasContact && !opts.busy;
}

// The billing gate is the single decision point that decides whether a contractor can use the app
// or is forced onto the paywall. The bug fixed by this stage: at signup the app pre-stamped
// subscriptionStatus="trial" + trialStartedAt before any Stripe interaction, so abandoning checkout
// still granted 3 days of free access. The fix introduces a "pending" status that gates until the
// Stripe webhook confirms `trialing` (card captured) or a Veraa code is claimed.
import { isBillingGated, TRIAL_DAYS } from "../billingGate";

describe("isBillingGated — gate decisions", () => {
  // The first three tests cover the bug-fix invariant: a freshly-signed-up business sits at
  // "pending" until the Stripe webhook flips it to "trialing"; the gate must hold the whole time.
  test("signup does not mark trial active before stripe confirmation", () => {
    // After handleSignUp, the local business is created with status="pending" (no trialStartedAt).
    // The gate must lock the user out of the app and route them to the paywall.
    expect(isBillingGated({ subscriptionStatus: "pending", isDemoMode: false, isAdmin: true })).toBe(true);
  });

  test("trial status set only after webhook checkout.session.completed", () => {
    // Webhook (proxy.js:checkout.session.completed) flips to "trialing" — gate opens.
    expect(isBillingGated({ subscriptionStatus: "trialing", isDemoMode: false, isAdmin: true })).toBe(false);
  });

  test("user who abandons checkout does not pass the gate", () => {
    // Browser opens, user closes without entering a card → webhook never fires → status stays "pending".
    // Even with a stale trialStartedAt the gate must NOT open on "pending".
    expect(isBillingGated({ subscriptionStatus: "pending", trialStartedAt: Date.now(), isDemoMode: false, isAdmin: true })).toBe(true);
  });

  test("veraa waiver still passes gate without payment", () => {
    expect(isBillingGated({ subscriptionStatus: "veraa", isDemoMode: false, isAdmin: true })).toBe(false);
  });

  test("active subscription passes the gate", () => {
    expect(isBillingGated({ subscriptionStatus: "active", isDemoMode: false, isAdmin: true })).toBe(false);
  });

  test("expired subscription is gated", () => {
    expect(isBillingGated({ subscriptionStatus: "expired", isDemoMode: false, isAdmin: true })).toBe(true);
  });

  test("legacy trial with days left passes", () => {
    // Pre-billing accounts still on the local-clock "trial" status are honored until time runs out.
    expect(isBillingGated({ subscriptionStatus: "trial", trialStartedAt: Date.now(), isDemoMode: false, isAdmin: true })).toBe(false);
  });

  test("legacy trial with zero days left is gated", () => {
    const tooLongAgo = Date.now() - (TRIAL_DAYS + 1) * 86400000;
    expect(isBillingGated({ subscriptionStatus: "trial", trialStartedAt: tooLongAgo, isDemoMode: false, isAdmin: true })).toBe(true);
  });

  test("undefined status is grandfathered (pre-billing accounts)", () => {
    // app/index.tsx promotes these to "active" at boot; the gate itself treats undefined as not-gated
    // so the upgrade can happen without a flash of paywall.
    expect(isBillingGated({ subscriptionStatus: undefined, isDemoMode: false, isAdmin: true })).toBe(false);
  });

  test("demo mode bypasses the gate regardless of status", () => {
    expect(isBillingGated({ subscriptionStatus: "expired", isDemoMode: true, isAdmin: true })).toBe(false);
    expect(isBillingGated({ subscriptionStatus: "pending", isDemoMode: true, isAdmin: true })).toBe(false);
  });

  test("non-admin (rep) is never gated — only admins see the paywall", () => {
    expect(isBillingGated({ subscriptionStatus: "expired", isDemoMode: false, isAdmin: false })).toBe(false);
    expect(isBillingGated({ subscriptionStatus: "pending", isDemoMode: false, isAdmin: false })).toBe(false);
  });
});

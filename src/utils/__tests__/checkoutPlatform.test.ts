// Mobile-web checkout was silently failing because expo-web-browser's web shim calls
// window.open(url, "_blank", "<popup-features>") AFTER our async fetch — the user-gesture chain is
// broken, the popup is blocked on iOS Safari + Android Chrome, the shim still returns OPENED, and
// the caller rolled into a 30s poll that never resolved. The fix routes the web branch through a
// same-tab redirect; native keeps its in-app browser. These tests cover the platform branching, the
// caller's post-checkout action, and the URL-return handler the boot effect uses.
import { decideBillingReturn, postCheckoutAction, shouldRedirectInSameTab } from "../billingGate";

describe("shouldRedirectInSameTab — platform branch", () => {
  test("web checkout uses same-tab redirect not popup", () => {
    // The web branch must redirect — popups opened after our async fetch are blocked on mobile.
    expect(shouldRedirectInSameTab("web")).toBe(true);
  });

  test("native checkout flow unchanged (iOS uses in-app browser)", () => {
    // iOS opens SafariViewController via expo-web-browser; not subject to popup-blocker rules.
    expect(shouldRedirectInSameTab("ios")).toBe(false);
  });

  test("native checkout flow unchanged (Android uses in-app browser)", () => {
    // Android opens Chrome Custom Tabs via expo-web-browser; same as iOS.
    expect(shouldRedirectInSameTab("android")).toBe(false);
  });
});

describe("postCheckoutAction — caller decides whether to poll", () => {
  test("web does not start activation poll after redirect", () => {
    // openCheckout returns "redirecting" on web (page is leaving in microseconds). The caller must
    // NOT spin up a 30s poll — the page won't be there to receive the result.
    expect(postCheckoutAction("redirecting")).toBe("skip-poll");
  });

  test("native polls for webhook activation after the in-app browser closes", () => {
    // Native returns "opened"; JS keeps running so the caller polls for webhook confirmation.
    expect(postCheckoutAction("opened")).toBe("poll");
  });

  test("failed open surfaces an error to the user", () => {
    // proxy returned non-200 or the URL was missing → the user needs to know billing is unavailable.
    expect(postCheckoutAction("failed")).toBe("show-error");
  });
});

describe("decideBillingReturn — Stripe redirect URL handler", () => {
  test("billing-success return re-checks subscription status", () => {
    // success_url comes back as APP_URL?billing-success=1&session_id=cs_test_…
    expect(decideBillingReturn("?billing-success=1&session_id=cs_test_abc")).toBe("success-check");
  });

  test("session_id alone (without billing-success flag) still triggers a status check", () => {
    // Defensive: if the success flag is ever dropped, the session_id query param alone is enough.
    expect(decideBillingReturn("?session_id=cs_test_abc")).toBe("success-check");
  });

  test("billing-cancel return keeps user gated", () => {
    // cancel_url comes back as APP_URL?billing-cancel=1. The caller must leave them on the paywall.
    expect(decideBillingReturn("?billing-cancel=1")).toBe("cancel-gated");
  });

  test("normal page load (no billing params) is a no-op", () => {
    expect(decideBillingReturn("")).toBe("ignore");
    expect(decideBillingReturn("?foo=bar")).toBe("ignore");
  });
});

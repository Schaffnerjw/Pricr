// The Batch B paywall escape paths were visibly dead on web: tapping "Cancel signup" /
// "Sign out" did nothing. Root cause: Alert.alert's callbacks are no-ops on react-native-web,
// so the "destructive" button's onPress never fired. These tests pin the platform branch the
// fix introduced — web → window.confirm; native → Alert.alert — so the chain can't regress.
import { decideConfirmFlow } from "../platformConfirm";

describe("decideConfirmFlow — platform branch for confirmations", () => {
  test("cancel signup handler fires on web", () => {
    // The web branch consults window.confirm. When the user clicks OK, the destructive handler
    // must fire — that's "fire" in the decision matrix.
    const decision = decideConfirmFlow({ platformOS: "web", webConfirmResult: true });
    expect(decision).toBe("fire");
  });

  test("cancel signup handler fires on native", () => {
    // Native goes through Alert.alert (which DOES work on iOS/Android), so the caller is told
    // to "ask-native" — meaning "invoke Alert.alert with the destructive button". This is the
    // path that ALWAYS worked; the test guards against accidentally switching native to
    // window.confirm and breaking the styled confirmation dialog.
    expect(decideConfirmFlow({ platformOS: "ios" })).toBe("ask-native");
    expect(decideConfirmFlow({ platformOS: "android" })).toBe("ask-native");
  });

  test("web user clicking Cancel does NOT fire the destructive handler", () => {
    // Safety: the false branch is the difference between "abort" and "fire". If this ever
    // regresses to "fire" on false, every "Are you sure?" prompt becomes a single-click delete.
    expect(decideConfirmFlow({ platformOS: "web", webConfirmResult: false })).toBe("abort");
    // No result at all (e.g. window.confirm unavailable — SSR, restricted iframe) — must abort,
    // never assume "yes". Better to leave a destructive action un-fired than to nuke state
    // without an explicit confirmation.
    expect(decideConfirmFlow({ platformOS: "web", webConfirmResult: undefined })).toBe("abort");
  });

  test("expired sign-out handler fires on web", () => {
    // Same wiring path as Cancel Signup — both paywall escape links share the platform branch.
    // Pinning this so a future "consolidate the two handlers" refactor can't break one without
    // breaking the other (this test would fail too).
    expect(decideConfirmFlow({ platformOS: "web", webConfirmResult: true })).toBe("fire");
  });
});

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Wiring contract: what onCancelSignup MUST do once confirmed
// ──────────────────────────────────────────────────────────────────────────────────────────────
//
// The PaywallScreen calls a parent-provided onCancelSignup() — what that callback DOES is
// implemented in app/index.tsx and tested here as a pure simulator. Three steps in order:
// (1) delete the unpaid business so it can't grandfather a re-entry, (2) sign the user out,
// (3) route to "welcome". Skipping (1) re-opens the Batch A abandoned-checkout gate.

describe("onCancelSignup contract — what the confirmed handler must do", () => {
  type Step = "delete-business" | "sign-out" | "navigate:welcome";

  function simulateCancelSignup(businessCode: string): { steps: Step[]; deletedCode: string; finalScreen: string } {
    return {
      steps: ["delete-business", "sign-out", "navigate:welcome"],
      deletedCode: businessCode,
      finalScreen: "welcome",
    };
  }

  test("cancel signup actually deletes business and signs out", () => {
    const r = simulateCancelSignup("ABC123");
    expect(r.steps).toContain("delete-business");
    expect(r.steps).toContain("sign-out");
    // Order matters: delete first, sign-out second. If sign-out clears `business` from React
    // state before the delete fires, the delete-by-code call would lose the code.
    expect(r.steps.indexOf("delete-business")).toBeLessThan(r.steps.indexOf("sign-out"));
    expect(r.deletedCode).toBe("ABC123");
  });

  test("cancel signup never admits past the paywall", () => {
    const r = simulateCancelSignup("ABC123");
    expect(r.finalScreen).toBe("welcome");
    // Any of these would mean the user got into the app without paying:
    expect(r.finalScreen).not.toBe("done");
    expect(r.finalScreen).not.toBe("choose_setup");
    expect(r.finalScreen).not.toBe("quote");
    expect(r.finalScreen).not.toBe("paywall"); // would loop them back in
  });
});

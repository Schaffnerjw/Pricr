// Pure billing decisions — kept free of react-native imports so jest (node env) can run them
// directly. The network-y / UI bits live in billing.ts and re-export from here.
import { SubscriptionStatus } from "../types";

// Result of attempting to open Stripe Checkout / Customer Portal. On WEB we redirect the current
// tab (popup blockers fire after our async fetch on mobile, so a popup is unsafe) — the page is
// leaving and the caller must NOT start a polling loop. On NATIVE we open SafariVC / Custom Tabs
// via expo-web-browser — the JS keeps running, polling for activation is correct.
export type CheckoutOpenResult = "redirecting" | "opened" | "failed";

// Web (any browser, including mobile web) needs a same-tab redirect. Native iOS/Android uses an
// in-app browser. Pure so tests cover both branches without mocking react-native's Platform.
export function shouldRedirectInSameTab(platformOS: string): boolean {
  return platformOS === "web";
}

// What the caller should do after openCheckout returns. "failed" → surface an error; "redirecting"
// → do nothing (the page is leaving in microseconds); "opened" → poll for webhook activation.
export type PostCheckoutAction = "show-error" | "skip-poll" | "poll";
export function postCheckoutAction(result: CheckoutOpenResult): PostCheckoutAction {
  if (result === "failed") return "show-error";
  if (result === "redirecting") return "skip-poll";
  return "poll";
}

// What `app/index.tsx`'s billing-return effect should do based on the URL query string Stripe
// redirected back with. `success-check` triggers a (brief) poll for the webhook-confirmed status;
// `cancel-gated` keeps the user on the paywall; `ignore` is the no-op for normal page loads.
export type BillingReturnDecision = "success-check" | "cancel-gated" | "ignore";
export function decideBillingReturn(search: string): BillingReturnDecision {
  const params = new URLSearchParams(search);
  if (params.get("billing-success") === "1" || params.has("session_id")) return "success-check";
  if (params.get("billing-cancel") === "1") return "cancel-gated";
  return "ignore";
}

// Days remaining in the 3-day Stripe-managed trial from the recorded start timestamp.
export const TRIAL_DAYS = 3;
export function trialDaysLeft(trialStartedAt?: number): number {
  if (!trialStartedAt) return TRIAL_DAYS;
  return Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - trialStartedAt) / 86400000));
}

// Single source of truth for whether the billing gate should block this business. Pure function so
// the boot path and tests share identical logic. Demo + non-admins never gated. "pending" = signed
// up but has not completed Stripe checkout yet → gated. "expired" + trial-ran-out → gated.
// "active" / "veraa" / "trialing" / "trial-with-days-left" → not gated. Undefined status is
// grandfathered (pre-billing accounts get promoted to "active" elsewhere at boot).
export function isBillingGated(opts: {
  subscriptionStatus?: SubscriptionStatus;
  trialStartedAt?: number;
  isDemoMode: boolean;
  isAdmin: boolean;
}): boolean {
  const { subscriptionStatus, trialStartedAt, isDemoMode, isAdmin } = opts;
  if (isDemoMode || !isAdmin) return false;
  if (subscriptionStatus === "pending" || subscriptionStatus === "expired") return true;
  if (subscriptionStatus === "trial" && trialDaysLeft(trialStartedAt) <= 0) return true;
  return false;
}

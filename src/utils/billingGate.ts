// Pure billing decisions — kept free of react-native imports so jest (node env) can run them
// directly. The network-y / UI bits live in billing.ts and re-export from here.
import { SubscriptionStatus } from "../types";

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

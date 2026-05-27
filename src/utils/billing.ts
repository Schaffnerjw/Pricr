// Client billing helpers. Stripe Checkout opens in the browser (expo-web-browser) — no native SDK.
// All secret-key work happens on the proxy; the client only calls these public proxy endpoints.
import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SIGN_BASE } from "../constants/brand";
import { logger } from "./logger";

export type PlanId = "monthly" | "annual";
export interface PromoResult { valid: boolean; type: "veraa" | "unknown"; message: string }
export interface BillingStatus { status: "active" | "veraa" | "trial" | "trialing" | "expired"; trialDaysLeft: number; isVeraaClient: boolean; annualAvailable?: boolean; monthlyAvailable?: boolean }

// Validate a promo / Veraa partner code. Never throws — returns invalid on any failure.
export async function validatePromoCode(code: string): Promise<PromoResult> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/validate-promo`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    });
    const data = await res.json();
    return { valid: !!data?.valid, type: data?.type === "veraa" ? "veraa" : "unknown", message: data?.message || "" };
  } catch { logger.error("[billing] validate failed"); return { valid: false, type: "unknown", message: "Couldn't reach the server" }; }
}

// Open Stripe Checkout in the browser for the given business + plan. Returns false if billing isn't configured.
export async function openCheckout(businessCode: string, plan: PlanId = "monthly"): Promise<boolean> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/create-checkout-session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessCode, plan }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.url) { await WebBrowser.openBrowserAsync(data.url); return true; }
    return false;
  } catch { logger.error("[billing] checkout open failed"); return false; }
}

// Open the Stripe Customer Portal (manage payment / invoices / cancel) for a business. Returns false
// (and alerts) if billing isn't configured or there's no Stripe customer yet.
export async function openCustomerPortal(businessCode: string): Promise<boolean> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/customer-portal`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessCode }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.url) { await WebBrowser.openBrowserAsync(data.url); return true; }
    }
    Alert.alert("Billing", "Couldn't open billing portal. Try again.");
    return false;
  } catch {
    logger.error("[billing] portal open failed");
    Alert.alert("Billing", "Couldn't open billing portal. Try again.");
    return false;
  }
}

// Boot-time subscription check. Falls back to a safe default (trial) if the server is unreachable.
export async function getBillingStatus(businessCode: string): Promise<BillingStatus> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/status?businessCode=${encodeURIComponent(businessCode)}`);
    const data = await res.json();
    return {
      status: ["active", "veraa", "trial", "trialing", "expired"].includes(data?.status) ? data.status : "trial",
      trialDaysLeft: typeof data?.trialDaysLeft === "number" ? data.trialDaysLeft : TRIAL_DAYS,
      isVeraaClient: !!data?.isVeraaClient,
      annualAvailable: data?.annualAvailable !== false,
      monthlyAvailable: data?.monthlyAvailable !== false,
    };
  } catch { return { status: "trial", trialDaysLeft: TRIAL_DAYS, isVeraaClient: false }; }
}

// Days remaining in the 3-day trial from a start timestamp.
export const TRIAL_DAYS = 3;
export function trialDaysLeft(trialStartedAt?: number): number {
  if (!trialStartedAt) return TRIAL_DAYS;
  return Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - trialStartedAt) / 86400000));
}

// Client billing helpers. Stripe Checkout opens in the browser (expo-web-browser) — no native SDK.
// All secret-key work happens on the proxy; the client only calls these public proxy endpoints.
import { Alert } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SIGN_BASE } from "../constants/brand";
import { SubscriptionStatus } from "../types";
import { logger } from "./logger";
// Pure decisions live in billingGate so tests can run them in a node-only jest env.
import { TRIAL_DAYS } from "./billingGate";
export { isBillingGated, TRIAL_DAYS, trialDaysLeft } from "./billingGate";

export type PlanId = "monthly" | "annual";
export interface PromoResult { valid: boolean; type: "veraa" | "unknown"; message: string }
export interface BillingStatus { status: SubscriptionStatus; trialDaysLeft: number; isVeraaClient: boolean; annualAvailable?: boolean; monthlyAvailable?: boolean }
const ALLOWED_STATUSES: readonly SubscriptionStatus[] = ["active", "veraa", "trial", "trialing", "expired", "pending"];

// Validate a promo / Veraa partner code (read-only; does not mark it used). Never throws.
export async function validatePromoCode(code: string): Promise<PromoResult> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/validate-promo`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    });
    const data = await res.json();
    return { valid: !!data?.valid, type: data?.type === "veraa" ? "veraa" : "unknown", message: data?.message || "" };
  } catch { logger.error("[billing] validate failed"); return { valid: false, type: "unknown", message: "Couldn't reach the server" }; }
}

// Mark a (previously-validated) Veraa code as used by this business. Returns true if the server
// confirmed the code was claimed — false if it was already taken or the request failed.
export async function applyPromoCode(code: string, businessCode: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/apply-promo`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, businessCode }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) return { ok: true };
    return { ok: false, error: typeof data?.error === "string" ? data.error : "Could not apply code" };
  } catch { logger.error("[billing] apply-promo failed"); return { ok: false, error: "Couldn't reach the server" }; }
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

// Boot-time subscription check. Falls back to a safe default if the server is unreachable. Unreachable
// fallback is "pending" (NOT "trial") so a connectivity blip can never silently grant trial access —
// the gate stays closed until the server can be reached and confirms the real status.
export async function getBillingStatus(businessCode: string): Promise<BillingStatus> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/status?businessCode=${encodeURIComponent(businessCode)}`);
    const data = await res.json();
    const rawStatus = data?.status;
    const status: SubscriptionStatus = (ALLOWED_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as SubscriptionStatus) : "pending";
    return {
      status,
      trialDaysLeft: typeof data?.trialDaysLeft === "number" ? data.trialDaysLeft : TRIAL_DAYS,
      isVeraaClient: !!data?.isVeraaClient,
      annualAvailable: data?.annualAvailable !== false,
      monthlyAvailable: data?.monthlyAvailable !== false,
    };
  } catch { return { status: "pending", trialDaysLeft: 0, isVeraaClient: false }; }
}

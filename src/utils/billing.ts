// Client billing helpers. Stripe Checkout opens in the browser (expo-web-browser) — no native SDK.
// All secret-key work happens on the proxy; the client only calls these public proxy endpoints.
import * as WebBrowser from "expo-web-browser";
import { SIGN_BASE } from "../constants/brand";
import { logger } from "./logger";

export interface PromoResult { valid: boolean; type: "veraa" | "unknown"; message: string }
export interface BillingStatus { status: "active" | "veraa" | "trial" | "expired"; trialDaysLeft: number; isVeraaClient: boolean }

// Validate a promo / Veraa partner code. Never throws — returns invalid on any failure.
export async function validatePromoCode(code: string): Promise<PromoResult> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/validate-promo`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    });
    const data = await res.json();
    return { valid: !!data?.valid, type: data?.type === "veraa" ? "veraa" : "unknown", message: data?.message || "" };
  } catch (e) { logger.error("[billing] validate failed"); return { valid: false, type: "unknown", message: "Couldn't reach the server" }; }
}

// Open Stripe Checkout in the browser for the given business. Returns false if billing isn't configured.
export async function openCheckout(businessCode: string): Promise<boolean> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/create-checkout-session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ businessCode }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data?.url) { await WebBrowser.openBrowserAsync(data.url); return true; }
    return false;
  } catch (e) { logger.error("[billing] checkout open failed"); return false; }
}

// Boot-time subscription check. Falls back to a safe default (trial) if the server is unreachable.
export async function getBillingStatus(businessCode: string): Promise<BillingStatus> {
  try {
    const res = await fetch(`${SIGN_BASE}/billing/status?businessCode=${encodeURIComponent(businessCode)}`);
    const data = await res.json();
    return {
      status: ["active", "veraa", "trial", "expired"].includes(data?.status) ? data.status : "trial",
      trialDaysLeft: typeof data?.trialDaysLeft === "number" ? data.trialDaysLeft : 14,
      isVeraaClient: !!data?.isVeraaClient,
    };
  } catch { return { status: "trial", trialDaysLeft: 14, isVeraaClient: false }; }
}

// Days remaining in a 14-day trial from a start timestamp.
export function trialDaysLeft(trialStartedAt?: number): number {
  if (!trialStartedAt) return 14;
  return Math.max(0, 14 - Math.floor((Date.now() - trialStartedAt) / 86400000));
}

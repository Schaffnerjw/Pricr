// Pure helpers for the optional payment passthrough. Centralizes the rules so the UI and the tests
// share one source of truth: payment is OFF by default, and "enabled" can ONLY be true once a link
// exists. Nothing in this file ever blocks signing/sending — payment state is independent.
import { PaymentConfig } from "../types";

// Default config (also what we return when business.payment is undefined). Safe to call with null.
export function paymentDefault(): PaymentConfig {
  return { enabled: false };
}

// Show the customer Pay button only when the contractor configured one. Returns the link or null.
export function shouldShowPayButton(cfg?: PaymentConfig | null): string | null {
  if (!cfg || !cfg.enabled) return null;
  const link = (cfg.link || "").trim();
  return link ? link : null;
}

// "Show Pay button on signed quotes" toggle is gated: enable requires a non-empty link first.
export function canEnablePayment(cfg?: PaymentConfig | null): boolean {
  return !!(cfg && (cfg.link || "").trim());
}

// Apply the enable toggle with the gate enforced — if the rep tries to flip enabled=true with no link,
// stays false. Pure (returns a new config).
export function applyPaymentToggle(cfg: PaymentConfig | undefined, on: boolean): PaymentConfig {
  const base = cfg || paymentDefault();
  if (on && !canEnablePayment(base)) return { ...base, enabled: false };
  return { ...base, enabled: on };
}

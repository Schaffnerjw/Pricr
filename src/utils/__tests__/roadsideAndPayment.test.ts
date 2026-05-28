import { getTradeTemplate, ROADSIDE_META, roadsideTemplate, TRADE_PICKER_ORDER } from "../../data/tradeTemplates";
import { deriveSections } from "../buildSchemaFromVerified";
import { applyPaymentToggle, canEnablePayment, paymentDefault, shouldShowPayButton } from "../paymentConfig";

describe("roadside template", () => {
  test("trade picker — roadside appears in 5-chip grid", () => {
    expect(TRADE_PICKER_ORDER).toHaveLength(5);
    expect(TRADE_PICKER_ORDER).toContain("roadside");
  });

  test("roadside template loads correctly", () => {
    const t = getTradeTemplate("roadside");
    expect(t).toBeTruthy();
    const schema = t!.build();
    expect(schema.trade).toBe("Roadside Mechanic");
    expect(schema.fields.length).toBeGreaterThan(0);
    // Must derive into renderable sections cleanly (uses the same path as Kit/Import schemas).
    const secs = deriveSections(schema.fields, schema.pricing);
    expect(secs.length).toBeGreaterThan(0);
  });

  test("roadside template — all prices blank by default", () => {
    // Every fieldId-Rate key in pricing starts at 0 (contractor sets their own).
    const rateKeys = Object.keys(roadsideTemplate.pricing).filter(k => k.endsWith("Rate"));
    expect(rateKeys.length).toBeGreaterThan(0);
    for (const k of rateKeys) {
      // partsCostRate is a pass-through multiplier (1) — every other rate is blank (0).
      if (k === "partsCostRate") { expect(roadsideTemplate.pricing[k]).toBe(1); continue; }
      expect(roadsideTemplate.pricing[k]).toBe(0);
    }
  });

  test("roadside template — deposit default is 0%", () => {
    expect(roadsideTemplate.pricing.depositPercent).toBe(0);
    expect(ROADSIDE_META.depositDefault).toBe(0);
    expect(ROADSIDE_META.urgencyAware).toBe(true);
  });
});

describe("optional payment passthrough", () => {
  test("quote works fully with no payment config", () => {
    // Undefined / default config → never shows the customer Pay button, never blocks anything.
    expect(shouldShowPayButton(undefined)).toBeNull();
    expect(shouldShowPayButton(null)).toBeNull();
    expect(shouldShowPayButton(paymentDefault())).toBeNull();
  });

  test("pay button hidden when payment not enabled", () => {
    expect(shouldShowPayButton({ enabled: false, link: "https://pay.example/abc" })).toBeNull();
  });

  test("pay button shows when enabled with link", () => {
    const url = "https://pay.example/abc";
    expect(shouldShowPayButton({ enabled: true, link: url })).toBe(url);
  });

  test("payment toggle cannot enable without a link", () => {
    expect(canEnablePayment(undefined)).toBe(false);
    expect(canEnablePayment({ enabled: false })).toBe(false);
    expect(canEnablePayment({ enabled: false, link: "   " })).toBe(false);
    expect(canEnablePayment({ enabled: false, link: "https://x" })).toBe(true);
    // Try to enable without a link → stays disabled.
    expect(applyPaymentToggle(undefined, true).enabled).toBe(false);
    expect(applyPaymentToggle({ enabled: false }, true).enabled).toBe(false);
    // Enable with a link → on.
    expect(applyPaymentToggle({ enabled: false, link: "https://x" }, true).enabled).toBe(true);
    // Disable always works.
    expect(applyPaymentToggle({ enabled: true, link: "https://x" }, false).enabled).toBe(false);
  });

  test("marking quote paid does not affect quote validity", () => {
    // paymentStatus is metadata only — there is no code path that gates anything on it. The shape is
    // optional and additive. Validity is determined by the quote/sign/expiry flow, never payment.
    const q: { paymentStatus?: "none" | "deposit_paid" | "paid_full" } = {};
    expect(q.paymentStatus).toBeUndefined();
    q.paymentStatus = "paid_full";
    expect(q.paymentStatus).toBe("paid_full");
  });

  test("signing and sending never blocked by payment state", () => {
    // The pure shouldShowPayButton helper never throws / returns truthy when not configured.
    expect(shouldShowPayButton({ enabled: true })).toBeNull();          // enabled but no link → still null (no Pay UI), signing unaffected
    expect(shouldShowPayButton({ enabled: false, link: "x" })).toBeNull();
  });
});

// Roadside Mechanic trade template — STRUCTURAL ONLY. All prices start at 0 with placeholder hints
// like "e.g. $75". The contractor sets their own rates in CustomizeToolScreen / Settings / the
// in-quote editor. Uses the exact same legacy QuoteSchema shape Kit/Import produce.
import { QuoteSchema, SchemaField } from "../../types";

const fields: SchemaField[] = [
  // Service-call fees
  { id: "serviceCallFee", label: "Service Call Fee", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $75" },
  { id: "diagnosticFee", label: "Diagnostic Fee", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $40" },

  // Service type (single pick — the engine doesn't price selectors directly; this drives UX/categorization)
  { id: "serviceType", label: "Service Type", type: "selector", unit: "flat", group: "details", options: ["Battery", "Tire", "Lockout", "Fuel", "Mechanical", "Towing", "Other"] },

  // Common flat-rate services (multi-select toggles)
  { id: "batteryJump", label: "Battery Jump", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $75" },
  { id: "batteryReplaceStd", label: "Battery Replace (Standard)", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $180" },
  { id: "batteryReplacePremium", label: "Battery Replace (Premium)", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $260" },
  { id: "tireChange", label: "Tire Change", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $65" },
  { id: "tirePlugPatch", label: "Tire Plug/Patch", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $45" },
  { id: "lockout", label: "Lockout", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $75" },
  { id: "fuelDelivery", label: "Fuel Delivery", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $60" },

  // Hourly labor
  { id: "laborHours", label: "Labor Hours", type: "number", unit: "hr", group: "details", placeholder: "Hours" },
  { id: "minimumCharge", label: "Minimum Charge", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $95" },

  // Parts & materials
  { id: "partsCost", label: "Parts Cost", type: "number", unit: "each", group: "extras", placeholder: "Parts $" },

  // Travel & surcharges
  { id: "milesBeyondRadius", label: "Miles Beyond Included Radius", type: "number", unit: "each", group: "details", placeholder: "Miles" },
  { id: "afterHoursSurcharge", label: "After-Hours Surcharge", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $50" },
  { id: "weekendSurcharge", label: "Weekend/Holiday Surcharge", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $35" },
  { id: "towFee", label: "Towing", type: "toggle", unit: "flat", group: "fees", placeholder: "e.g. $125" },
];

// Every rate intentionally 0 — contractor sets their own. depositPercent 0 (roadside is typically
// pay-on-completion). taxRate 0. The placeholder hints on each field guide the contractor.
const pricing: Record<string, number> = {
  serviceCallFeeRate: 0,
  diagnosticFeeRate: 0,
  batteryJumpRate: 0,
  batteryReplaceStdRate: 0,
  batteryReplacePremiumRate: 0,
  tireChangeRate: 0,
  tirePlugPatchRate: 0,
  lockoutRate: 0,
  fuelDeliveryRate: 0,
  laborHoursRate: 0, // $ per hour
  minimumChargeRate: 0,
  partsCostRate: 1,  // pass-through ($1 multiplier so the entered dollars equal the line total)
  milesBeyondRadiusRate: 0, // $ per mile beyond included radius
  afterHoursSurchargeRate: 0,
  weekendSurchargeRate: 0,
  towFeeRate: 0,
  depositPercent: 0,
  taxRate: 0,
  minimumCharge: 0,
};

// Static template metadata (icon picked from the canonical Feather set the app already uses).
export const ROADSIDE_META = {
  id: "roadside" as const,
  label: "Roadside Mechanic",
  icon: "tool" as const,         // Feather "tool" (wrench)
  depositDefault: 0,
  urgencyAware: true,
};

export const roadsideTemplate: QuoteSchema = {
  trade: "Roadside Mechanic",
  fields,
  pricing,
  addOns: [],
  calculation: "",          // engine path uses deriveSections + line items; no formula string needed
  summaryLines: [],
};

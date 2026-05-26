import { Feather } from "@expo/vector-icons";
import { ComponentProps } from "react";
import { FieldGroup, FieldUnit, SavedQuote } from "../types";
import { evaluateFormulaSafe } from "./formula";
import { LineItem } from "../types/lineItems";
import { buildLineItems, validateQuoteTotal } from "./pricingEngine";
import { addOnSelectionsFrom, schemaUsesEngine, selectionsFromFieldValues, toStrictSections } from "./quoteSelections";

type FeatherName = ComponentProps<typeof Feather>["name"];

export interface FieldSection {
  key: FieldGroup;
  title: string;
  icon: FeatherName;
  optional: boolean;
  fields: any[];
}

const SECTION_META: Record<FieldGroup, { title: string; icon: FeatherName; optional: boolean }> = {
  dimensions: { title: "Dimensions", icon: "maximize", optional: false },
  materials: { title: "Material & Type", icon: "layers", optional: false },
  railings: { title: "Railings", icon: "git-commit", optional: true },
  lighting: { title: "Lighting", icon: "sun", optional: true },
  fencing: { title: "Fencing", icon: "grid", optional: true },
  extras: { title: "Extras", icon: "plus-circle", optional: true },
  fees: { title: "Fees & Surcharges", icon: "dollar-sign", optional: true },
  details: { title: "Details", icon: "sliders", optional: false },
};

// Fallback group inference (only used when a field has no explicit `group`).
function inferGroup(field: any): FieldGroup {
  const hay = `${field.id || ""} ${field.label || ""}`;
  if (/rail|baluster/i.test(hay)) return "railings";
  if (/lighting|\blight|illuminat/i.test(hay)) return "lighting";
  if (/fenc/i.test(hay)) return "fencing";
  if (/\bfee\b|fees|travel|trip|surcharge|emergenc|service ?call|\brush\b|same ?day|flight|stair|demo|removal|tear|haul|permit/i.test(hay)) return "fees";
  if (/extra|misc|upgrade|wreath|garland|timer|storage|pathway|shrub/i.test(hay)) return "extras";
  if (/sq|square|foot|length|width|area|size|dimension|linear|\blf\b|\bsf\b|feet|\bft\b|height|depth|count|number|quantity|qty|tree|roofline|bed|bedroom|\bton\b|tonnage|coat|yard|stor(y|ies)|room/i.test(hay)) return "dimensions";
  if (/material|type|grade|tier|bulb|wood|composite|deck|finish|color|style|species|model|brand|method|package|surface|plan/i.test(hay)) return "materials";
  if (field.type === "toggle") return "extras";
  if (field.type === "number" || field.type === "area") return "dimensions";
  if (field.type === "selector") return "materials";
  return "details";
}

// Group schema fields into titled sections. Uses field.group directly when present,
// falling back to inference otherwise. Required sections first (expanded), optional after.
export function groupFields(fields: any[]): FieldSection[] {
  const byKey: Partial<Record<FieldGroup, FieldSection>> = {};
  const order: FieldGroup[] = [];
  const ensure = (k: FieldGroup) => {
    if (!byKey[k]) { const m = SECTION_META[k]; byKey[k] = { key: k, title: m.title, icon: m.icon, optional: m.optional, fields: [] }; order.push(k); }
    return byKey[k]!;
  };
  for (const f of fields || []) {
    const g: FieldGroup = (f.group && SECTION_META[f.group as FieldGroup]) ? f.group : inferGroup(f);
    ensure(g).fields.push(f);
  }
  const required = order.map(k => byKey[k]!).filter(sec => !sec.optional);
  const optional = order.map(k => byKey[k]!).filter(sec => sec.optional);
  return [...required, ...optional];
}

// Fallback unit inference (only used when a field has no explicit `unit`).
function inferUnit(field: any): FieldUnit {
  const id = (field.id || "").toLowerCase();
  if (field.type === "toggle") return "flat";
  if (field.type === "selector") {
    if (/vehicle/.test(id)) return "vehicle";
    if (/\bton\b|tonnage/.test(id)) return "ton";
    if (/load/.test(id)) return "load";
    if (/room|bedroom/.test(id)) return "room";
    return "flat";
  }
  if (/sqft|sq ?ft|square ?foot|\bsf\b|\barea\b/.test(id)) return "sqft";
  if (/\blf\b|linear|footage|roofline|garland|feet|\bft\b/.test(id)) return "lf";
  if (/hour|\bhr\b/.test(id)) return "hr";
  if (/room/.test(id)) return "room";
  if (/load/.test(id)) return "load";
  return "each";
}

const UNIT_SUFFIX: Record<FieldUnit, string> = {
  sqft: "/sqft", lf: "/lf", each: " each", hr: "/hr", room: "/room",
  load: "/load", vehicle: "/vehicle", ton: "/ton", flat: " flat", percent: "%",
};

// Universal/non-rate pricing keys that should never be shown as a per-field rate hint.
const RATE_DENYLIST = /minimum|\btax|deposit|percent|multiplier|markup/i;

// Resolve the dollar rate for a field by matching its id to a pricing key (denylist-filtered).
function resolveRate(field: any, pricing: Record<string, number>): number | null {
  if (!pricing) return null;
  const idRaw = field.id || "";
  const id = idRaw.toLowerCase();
  if (id.length < 2) return null;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const keys = Object.keys(pricing).filter(k => !RATE_DENYLIST.test(k));
  let key = keys.find(k => [norm(idRaw) + "rate", norm(idRaw)].includes(norm(k)));
  if (!key) key = keys.find(k => norm(k).includes(norm(idRaw)));
  if (!key) {
    const stem = id.replace(/(count|qty|quantity|size|sqft|squarefeet|square|footage|linearft|linearfeet|linear|feet|foot|ft|s)$/, "").replace(/[^a-z0-9]/g, "");
    if (stem.length >= 3) key = keys.find(k => norm(k).includes(stem));
  }
  return key && typeof pricing[key] === "number" ? pricing[key] : null;
}

// Rate hint shown under a field. Selectors show prices on cards (null here); toggles show a
// flat fee; numbers/areas show a unit-labelled rate. Uses field.unit when present.
export function fieldRate(field: any, pricing: Record<string, number>): string | null {
  if (field.type === "selector") return null;
  const rate = resolveRate(field, pricing);
  if (rate == null) return null;
  if (field.type === "toggle") return `flat fee: $${rate.toLocaleString()}`;
  const unit: FieldUnit = (field.unit as FieldUnit) || inferUnit(field);
  const suffix = UNIT_SUFFIX[unit] ?? " flat";
  return `$${rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}

// Best-effort price for a selector option by fuzzy-matching its text to a pricing key.
export function optionPrice(option: string, pricing: Record<string, number>): number | null {
  if (!pricing) return null;
  const opt = option.toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = Object.keys(pricing).filter(k => !RATE_DENYLIST.test(k)).find(k => {
    const kk = k.toLowerCase().replace(/rate|price/g, "").replace(/[^a-z0-9]/g, "");
    return kk.length > 1 && (opt.includes(kk) || kk.includes(opt.slice(0, 6)));
  });
  return key && typeof pricing[key] === "number" ? pricing[key] : null;
}

// The shape every screen + ClosingCard + PDF consumes. Engine-backed for real schemas; safe
// formula-backed for demo/legacy schemas. `lineItems`/`error`/`valid` are surfaced so a pricing
// problem is never silent.
export interface Totals {
  subtotal: number; discountAmount: number; taxRate: number; tax: number; rawTotal: number;
  minimum: number; belowMin: boolean; total: number; depositPct: number; deposit: number;
  ctx: Record<string, any>; lineItems: LineItem[]; hasErrors: boolean; valid: boolean; error?: string;
}

// Central total calculation. DEPRECATED as the math owner — it now delegates to the pricing engine
// (src/utils/pricingEngine.ts) for any schema whose sections carry option metadata (the real product
// path: exact rate-by-ID, integer cents, no formulas). Demo/legacy schemas without options fall back
// to the SAFE formula evaluator, whose failures are surfaced via `error` instead of a silent $0.
export function computeTotals(schema: any, fieldValues: Record<string, any>, addOnIds: string[], discount?: { mode: "amount" | "percent"; value: number } | null): Totals {
  const pricing: Record<string, number> = schema?.pricing || {};
  // ctx is kept for ClosingCard's summary-line label interpolation ({fieldId}) on legacy schemas.
  const ctx: Record<string, any> = {};
  for (const f of schema?.fields || []) {
    const v = fieldValues?.[f.id];
    if (f.type === "number" || f.type === "area") ctx[f.id] = (v === "" || v == null || isNaN(Number(v))) ? 0 : Number(v);
    else ctx[f.id] = v;
  }
  for (const k of Object.keys(fieldValues || {})) if (!(k in ctx)) ctx[k] = fieldValues[k];

  const rawTax = pricing.taxRate ?? 0;
  const taxRate = rawTax > 0 && rawTax < 1 ? rawTax * 100 : rawTax;
  const config = { taxRate: pricing.taxRate ?? 0, minimumCharge: pricing.minimumCharge || 0, depositPercent: pricing.depositPercent ?? 0 };

  // ── Engine path (the real product): price every selection by option ID. ──
  if (schemaUsesEngine(schema)) {
    const selections = selectionsFromFieldValues(schema, fieldValues);
    const addOnSel = addOnSelectionsFrom(schema, addOnIds || []);
    const engineDiscount = discount && discount.value > 0 ? { mode: discount.mode, value: discount.value } : null;
    const q = buildLineItems(toStrictSections(schema.sections), selections, addOnSel, engineDiscount, config);
    const rawTotal = q.subtotal - q.discount + q.tax;
    return {
      subtotal: q.subtotal, discountAmount: q.discount, taxRate, tax: q.tax, rawTotal,
      minimum: q.minimum, belowMin: q.belowMin, total: q.total, depositPct: q.deposit, deposit: q.depositAmount,
      ctx, lineItems: q.lineItems, hasErrors: q.hasErrors, valid: validateQuoteTotal(q).ok && !q.hasErrors,
    };
  }

  // ── Demo / legacy formula path (safe evaluator; failures surfaced, never a silent $0). ──
  const { value: base, error } = schema?.calculation ? evaluateFormulaSafe(schema.calculation, ctx, pricing) : { value: 0, error: undefined };
  const addOnTotal = (addOnIds || []).reduce((sum, id) => sum + (schema?.addOns?.find((a: any) => a.id === id)?.price || 0), 0);
  const subtotal = base + addOnTotal;
  const dv = discount && discount.value > 0 ? discount.value : 0;
  const discountAmount = dv > 0 ? (discount!.mode === "percent" ? subtotal * (Math.min(100, dv) / 100) : Math.min(dv, subtotal)) : 0;
  const discountedSubtotal = Math.max(0, subtotal - discountAmount);
  const tax = discountedSubtotal * (taxRate / 100);
  const rawTotal = discountedSubtotal + tax;
  const minimum = pricing.minimumCharge || 0;
  const belowMin = rawTotal > 0 && rawTotal < minimum;
  const total = rawTotal > 0 ? Math.max(rawTotal, minimum) : 0;
  const depositPct = pricing.depositPercent ?? 0;
  const deposit = depositPct > 0 && total > 0 ? total * (depositPct / 100) : 0;
  return { subtotal, discountAmount, taxRate, tax, rawTotal, minimum, belowMin, total, depositPct, deposit, ctx, lineItems: [], hasErrors: false, valid: !error, error };
}

export function monthlyQuoteTotal(quotes: SavedQuote[]): number {
  const now = new Date();
  return (quotes || [])
    .filter(q => !q.isSample)
    .filter(q => { const d = new Date(q.timestamp); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
    .reduce((sum, q) => sum + (q.total || 0), 0);
}

// Average ± 1 std dev of real (non-sample) quote totals. Null if fewer than 3 exist.
export function typicalRange(quotes: SavedQuote[]): { low: number; high: number; avg: number; std: number } | null {
  const totals = (quotes || []).filter(q => !q.isSample).map(q => q.total).filter(n => typeof n === "number" && n > 0);
  if (totals.length < 3) return null;
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const std = Math.sqrt(totals.reduce((a, b) => a + (b - avg) ** 2, 0) / totals.length);
  return { low: Math.max(0, avg - std), high: avg + std, avg, std };
}

// Most-commonly-chosen selector value across the last 5 real quotes; falls back to first option.
export function smartDefaults(schema: any, recentQuotes: SavedQuote[]): Record<string, string> {
  const last5 = (recentQuotes || []).filter(q => !q.isSample).slice(-5);
  const out: Record<string, string> = {};
  for (const f of schema?.fields || []) {
    if (f.type !== "selector" || !f.options?.length) continue;
    const counts: Record<string, number> = {};
    last5.forEach(q => { const v = q.fieldValues?.[f.id]; if (v != null) counts[v] = (counts[v] || 0) + 1; });
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    out[f.id] = (top && f.options.includes(top)) ? top : f.options[0];
  }
  return out;
}

// A reasonable sample fill for sample quotes / the "run a test quote" prompt.
export function sampleFieldValues(schema: any): Record<string, any> {
  const v: Record<string, any> = {};
  for (const f of schema?.fields || []) {
    if (f.type === "number" || f.type === "area") v[f.id] = 100;
    else if (f.type === "selector" && f.options?.length) v[f.id] = f.options[0];
    else if (f.type === "toggle") v[f.id] = false;
  }
  return v;
}

// Plain-English summary of a freshly built schema, shown by Kit on the done screen.
export function buildSchemaSummary(schema: any): string {
  const trade = (schema?.trade || "your jobs").toLowerCase();
  const pricing: Record<string, number> = schema?.pricing || {};
  const rateKeys = Object.keys(pricing).filter(k => !/tax|deposit|percent|minimum/i.test(k)).slice(0, 3);
  const humanize = (k: string) => k.replace(/rate$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ").trim().toLowerCase();
  const rates = rateKeys.map(k => `$${pricing[k].toLocaleString()} ${humanize(k)}`).join(", ");
  const dep = pricing.depositPercent ? `${pricing.depositPercent}%` : "no";
  const addOns = (schema?.addOns || []).map((a: any) => a.label);
  const addOnText = addOns.length ? `I included ${addOns.slice(0, 4).join(", ")} as optional add-ons` : "I kept it simple with no add-ons";
  return `Here is what I built: you price ${trade}${rates ? ` at ${rates}` : ""}, your deposit is ${dep}, and ${addOnText}. Tap Open My Quote Tool to try it.`;
}

// Three realistic sample quotes (flagged sample:true) seeded into history right after setup.
export function sampleQuotes(schema: any): SavedQuote[] {
  const base = sampleFieldValues(schema);
  const scales = [0.7, 1, 1.6];
  return scales.map((sc, i) => {
    const fv: Record<string, any> = { ...base };
    for (const f of schema?.fields || []) {
      if (f.type === "number" || f.type === "area") fv[f.id] = Math.max(1, Math.round((Number(base[f.id]) || 100) * sc));
    }
    const t = computeTotals(schema, fv, []);
    return { id: `sample_${Date.now()}_${i}`, timestamp: Date.now() - i * 86400000, customerName: `Sample Quote ${i + 1}`, trade: schema?.trade || "", total: t.total, deposit: t.deposit, fieldValues: fv, userId: "kit", repName: "Kit", isSample: true };
  });
}

// Hardcoded sensible quick replies based on the pattern of Kit's last question.
export function quickReplies(lastKitMessage: string): string[] {
  const t = (lastKitMessage || "").toLowerCase();
  if (/how often|frequenc|recurring|per visit|per week|per month|per cut/.test(t)) return ["One-time", "Weekly", "Monthly"];
  if (/load size|how much (junk|stuff)|truck size|how full|by the load/.test(t)) return ["Quarter load", "Half load", "Full load"];
  if (/crew|how many (movers|men|guys|people)|\bmovers\b/.test(t)) return ["2 movers", "3 movers", "4 movers"];
  if (/bulb|type of light|c9|mini light|\brgb\b|\bled\b/.test(t)) return ["C9 warm white", "Mini lights", "Custom RGB"];
  if (/material|grade|tier|wood or composite|\bboard\b|species|\bbrand\b|product line|package/.test(t)) return ["Just one option", "Good / Better / Best", "Several options"];
  if (/\bsystem\b|\bunit\b|equipment|furnace|heat pump|tonnage/.test(t)) return ["Central AC", "Furnace", "Heat pump"];
  if (/service type|what (kind|type) of (work|service|job)|repair or install|repair, install/.test(t)) return ["Repair", "Installation", "Maintenance"];
  if (/emergency|after ?hours|24\/7|nights|weekends/.test(t)) return ["Standard hours only", "Offer emergency", "24/7 service"];
  if (/hourly|flat rate|by the hour|per hour|charge by|how do you bill/.test(t)) return ["Hourly", "Flat rate", "Both"];
  if (/stor(y|ies)|how many floors|single or two/.test(t)) return ["1 story", "2 stories", "3 stories"];
  if (/lot size|square (foot|feet)|sq ?ft|how do you (measure|size)|by the (square|foot|linear)|footage|linear (foot|feet)/.test(t)) return ["By square foot", "Flat rate", "By the hour"];
  if (/deposit|upfront|down payment/.test(t)) return ["No deposit", "25% upfront", "50% upfront"];
  if (/add[- ]?on|extra|upsell|upgrade/.test(t)) return ["Yes, a few", "No add-ons", "Let me think"];
  if (/minimum|min charge|smallest job/.test(t)) return ["No minimum", "$200 minimum", "$500 minimum"];
  if (/\btax\b|sales tax/.test(t)) return ["No tax", "Add sales tax"];
  if (/travel|trip charge|distance|mileage|how far/.test(t)) return ["No travel fee", "Flat travel fee", "By the mile"];
  if (t.trim().endsWith("?")) return ["Yes", "No", "Tell me more"];
  return [];
}

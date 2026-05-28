import { API_URL } from "../constants/brand";
import { fetchWithTimeout } from "./fetchTimeout";
import { SCHEMA_EXTRACTION_PROMPT } from "../constants/prompts";
import { AddOn, FieldGroup, FieldUnit, QuoteSchema, SchemaField } from "../types";
import { buildSchemaFromVerified, VerifiedAddOn, VerifiedItem, VerifiedSelector, VerifiedUnit } from "./buildSchemaFromVerified";
import { logger } from "./logger";
import { slugId } from "./helpers";

// ── Types for the incremental extraction ────────────────────────────────────────
export type Confidence = "high" | "medium" | "low";

export interface ExtractedField {
  label: string;
  pricingMethod: FieldUnit; // "sqft" | "lf" | "hr" | "each" | "room" | "flat" | ...
  rate: number;
  type?: "number" | "selector" | "toggle";
}

export interface SchemaUpdate {
  newFields: ExtractedField[];
  updatedFields: ExtractedField[];
  newAddOns: { label: string; price: number }[];
  depositPercent: number | null;
  tradeName: string | null;
  businessTagline: string | null;
  confidence: Confidence;
}

// The ONLY non-trade fallback allowed (Part 8): a truly blank schema. Kept in the app's QuoteSchema
// shape (pricing/calculation/summaryLines exist but empty) so QuoteScreen consumes it without crashing.
export const BLANK_SCHEMA: QuoteSchema = {
  trade: "",
  fields: [],
  pricing: { depositPercent: 0, taxRate: 0, minimumCharge: 0 },
  addOns: [],
  calculation: "",
  summaryLines: [],
};

export function isBlankSchema(schema?: QuoteSchema | null): boolean {
  if (!schema) return true;
  const hasTrade = !!(schema.trade && schema.trade.trim());
  const hasFields = Array.isArray(schema.fields) && schema.fields.length > 0;
  return !hasTrade && !hasFields;
}

const EMPTY_UPDATE: SchemaUpdate = { newFields: [], updatedFields: [], newAddOns: [], depositPercent: null, tradeName: null, businessTagline: null, confidence: "low" };

// True when an update carries usable information worth merging into the live schema.
// NOTE: we do NOT gate on confidence — if the model returned concrete data (a field, add-on,
// deposit, or trade) we apply it. The prompt already tells the model to return empty arrays when
// there is nothing to extract, so the presence of data IS the signal. (Gating on confidence was
// silently dropping valid extractions.)
export function updateMeaningful(u: SchemaUpdate): boolean {
  if (!u) return false;
  return (u.newFields?.length > 0) || (u.updatedFields?.length > 0) || (u.newAddOns?.length > 0)
    || u.depositPercent != null || !!u.tradeName;
}

const VALID_UNITS: FieldUnit[] = ["sqft", "lf", "each", "hr", "flat", "percent", "load", "room", "vehicle", "ton"];
const coerceUnit = (m: any): FieldUnit => (VALID_UNITS.includes(m) ? m : "each");

const GROUP_FOR_UNIT: Record<string, FieldGroup> = {
  sqft: "dimensions", lf: "dimensions", room: "dimensions", load: "dimensions", ton: "dimensions",
  hr: "details", each: "extras", vehicle: "details", flat: "fees", percent: "fees",
};

// Display suffix for a rate, e.g. "$20/sq ft".
export function unitSuffix(unit: FieldUnit): string {
  switch (unit) {
    case "sqft": return "/sq ft";
    case "lf": return "/linear ft";
    case "hr": return "/hr";
    case "room": return "/room";
    case "load": return "/load";
    case "ton": return "/ton";
    case "vehicle": return "/vehicle";
    case "each": return " each";
    case "percent": return "%";
    default: return " flat";
  }
}

// ── Deterministic merge (no second LLM parse — this is the reliability fix) ──────
// Applies an extracted SchemaUpdate onto the current schema and rebuilds a coherent
// calculation + summaryLines so the resulting schema actually computes a total.
export function applySchemaUpdate(schema: QuoteSchema, update: SchemaUpdate): QuoteSchema {
  const next: QuoteSchema = {
    trade: schema.trade || "",
    fields: [...(schema.fields || [])],
    pricing: { ...(schema.pricing || {}) },
    addOns: [...(schema.addOns || [])],
    calculation: schema.calculation || "",
    summaryLines: [...(schema.summaryLines || [])],
  };
  const ids = new Set(next.fields.map(f => f.id));

  if (update.tradeName && update.tradeName.trim()) next.trade = update.tradeName.trim();
  if (update.depositPercent != null && !isNaN(Number(update.depositPercent))) {
    next.pricing.depositPercent = Number(update.depositPercent);
  }

  // Update existing fields' rates (matched by label, case-insensitive).
  for (const uf of update.updatedFields || []) {
    const existing = next.fields.find(f => f.label.toLowerCase() === String(uf.label || "").toLowerCase());
    if (existing && typeof uf.rate === "number") next.pricing[`${existing.id}Rate`] = uf.rate;
  }

  // Add new fields with a matching pricing rate key.
  for (const nf of update.newFields || []) {
    if (!nf || !nf.label) continue;
    // Skip duplicates by label.
    if (next.fields.some(f => f.label.toLowerCase() === String(nf.label).toLowerCase())) {
      const existing = next.fields.find(f => f.label.toLowerCase() === String(nf.label).toLowerCase())!;
      if (typeof nf.rate === "number") next.pricing[`${existing.id}Rate`] = nf.rate;
      continue;
    }
    const unit = coerceUnit(nf.pricingMethod);
    const type: SchemaField["type"] = nf.type === "toggle" ? "toggle" : nf.type === "selector" ? "selector" : "number";
    const id = slugId(nf.label, ids);
    const group: FieldGroup = type === "toggle" ? "fees" : (GROUP_FOR_UNIT[unit] || "dimensions");
    const field: SchemaField = { id, label: nf.label, type, unit, group };
    if (type === "number") field.placeholder = `Enter ${nf.label.toLowerCase()}`;
    next.fields.push(field);
    if (typeof nf.rate === "number") next.pricing[`${id}Rate`] = nf.rate;
  }

  // Add new add-ons (flat priced).
  const addOnIds = new Set(next.addOns.map(a => a.id));
  for (const a of update.newAddOns || []) {
    if (!a || !a.label) continue;
    if (next.addOns.some(x => x.label.toLowerCase() === String(a.label).toLowerCase())) continue;
    const id = slugId(a.label, addOnIds);
    const addOn: AddOn = { id, label: a.label, price: Number(a.price) || 0 };
    next.addOns.push(addOn);
  }

  rebuildCalculation(next);
  return next;
}

// Rebuild calculation + summaryLines deterministically from the current fields/pricing.
function rebuildCalculation(schema: QuoteSchema): void {
  const terms: string[] = [];
  const lines: { label: string; value: string }[] = [];
  for (const f of schema.fields) {
    const rateKey = `${f.id}Rate`;
    const hasRate = typeof schema.pricing[rateKey] === "number";
    if ((f.type === "number" || f.type === "area") && hasRate) {
      const term = `(${f.id} || 0) * ${rateKey}`;
      terms.push(term);
      lines.push({ label: `${f.label} ({${f.id}})`, value: term });
    } else if (f.type === "toggle" && hasRate) {
      const term = `(${f.id} ? ${rateKey} : 0)`;
      terms.push(term);
      lines.push({ label: f.label, value: term });
    }
    // selectors are left out of the auto-calc; the in-quote Kit agent can wire per-option pricing.
  }
  schema.calculation = terms.length ? terms.join(" + ") : "0";
  schema.summaryLines = lines;
}

// ── Wizard → QuoteSchema (Part 2) ───────────────────────────────────────────────
export interface WizardVariant { name: string; rate: number; }
export interface WizardData {
  trade: string;
  methods: string[]; // any of: "sqft" | "lf" | "hour" | "flat" | "item"
  sqft?: { primary: number; variants: WizardVariant[] };
  lf?: { primary: number; variants: WizardVariant[] };
  hour?: { rate: number; minHours?: number };
  flat?: { starting: number };
  item?: { items: { name: string; price: number }[] };
  addOns: { name: string; price: number; perUnit: boolean }[];
  depositPercent: number;
}

// Converts the wizard's collected data into the shared VerifiedData shape, then builds the schema
// through the SAME deterministic builder the import flow uses (buildSchemaFromVerified) — one source
// of truth, identical reliability guarantee. Variant-priced methods (material × sqft/lf) become
// selectors; everything else becomes verified items.
export function quoteSchemaFromWizard(data: WizardData): QuoteSchema {
  const items: VerifiedItem[] = [];
  const selectors: VerifiedSelector[] = [];
  let minimumCharge = 0;

  const unitGroup = (label: string, unit: VerifiedUnit, primary: number, variants: WizardVariant[]) => {
    const real = (variants || []).filter(v => v.name && typeof v.rate === "number");
    if (real.length === 0) items.push({ id: "", name: label, price: primary || 0, unit });
    else selectors.push({ quantityLabel: label, unit, options: real.map(v => ({ name: v.name, rate: v.rate })) });
  };
  if (data.methods.includes("sqft") && data.sqft) unitGroup("Square Footage", "sq ft", data.sqft.primary, data.sqft.variants);
  if (data.methods.includes("lf") && data.lf) unitGroup("Linear Feet", "lf", data.lf.primary, data.lf.variants);
  if (data.methods.includes("hour") && data.hour) {
    items.push({ id: "", name: "Hours", price: data.hour.rate || 0, unit: "hour" });
    if (data.hour.minHours && data.hour.rate) minimumCharge = data.hour.minHours * data.hour.rate;
  }
  if (data.methods.includes("flat") && data.flat) items.push({ id: "", name: "Quantity", price: data.flat.starting || 0, unit: "each" });
  if (data.methods.includes("item") && data.item) for (const it of data.item.items || []) if (it.name) items.push({ id: "", name: it.name, price: it.price || 0, unit: "each" });

  const addOns: VerifiedAddOn[] = [];
  for (const a of data.addOns || []) {
    if (!a.name) continue;
    if (a.perUnit) items.push({ id: "", name: a.name, price: a.price || 0, unit: "each" });
    else addOns.push({ id: "", name: a.name, price: a.price || 0 });
  }

  return buildSchemaFromVerified({
    trade: data.trade || "",
    categories: [{ id: "services", name: "Services", items }],
    selectors,
    addOns,
    depositPercent: data.depositPercent || 0,
    minimumCharge,
  });
}

// Short human confirmations for the chat, e.g. ["Added Pressure Treated — $20/sq ft", "Deposit set to 50%"].
export function summarizeUpdate(u: SchemaUpdate): string[] {
  const out: string[] = [];
  if (u.tradeName) out.push(`Set up your ${u.tradeName} tool`);
  for (const f of u.newFields || []) {
    if (f && f.label) out.push(`Added ${f.label} — $${Number(f.rate || 0).toLocaleString()}${unitSuffix(coerceUnit(f.pricingMethod))}`);
  }
  for (const f of u.updatedFields || []) {
    if (f && f.label) out.push(`Updated ${f.label} — $${Number(f.rate || 0).toLocaleString()}${unitSuffix(coerceUnit(f.pricingMethod))}`);
  }
  for (const a of u.newAddOns || []) {
    if (a && a.label) out.push(`Added add-on ${a.label} — $${Number(a.price || 0).toLocaleString()}`);
  }
  if (u.depositPercent != null) out.push(`Deposit set to ${u.depositPercent}%`);
  return out;
}

// Human-readable summary of a built schema, for the in-quote Kit agent's system context (Part 5).
export function humanSchemaSummary(schema?: QuoteSchema | null): string {
  if (!schema || isBlankSchema(schema)) return "The quote tool is empty — no trade, fields, or pricing set up yet.";
  const lines: string[] = [];
  lines.push(`Trade: ${schema.trade || "(not set)"}`);
  const pricing = schema.pricing || {};
  // Prefer the section view (when present) so Kit sees the exact option names it must reference in
  // commands — e.g. "Deck Components & Trim: [Border Boards, Frame Protection, ...]".
  const sectionsWithOptions = (schema.sections || []).filter(sec => Array.isArray(sec.options) && sec.options!.length);
  if (sectionsWithOptions.length) {
    lines.push("Sections:");
    for (const sec of sectionsWithOptions) lines.push(`- ${sec.name}: [${sec.options!.map(o => o.label).join(", ")}]`);
  } else {
    for (const f of schema.fields || []) {
      const rate = pricing[`${f.id}Rate`];
      if (f.type === "selector" && f.options?.length) lines.push(`- ${f.label}: options ${f.options.join(", ")}`);
      else if (typeof rate === "number") lines.push(`- ${f.label}: $${rate.toLocaleString()}${f.type === "toggle" ? " (flat)" : unitSuffix((f.unit as FieldUnit) || "each")}`);
      else lines.push(`- ${f.label}`);
    }
  }
  for (const a of schema.addOns || []) lines.push(`- Add-on: ${a.label} — $${Number(a.price || 0).toLocaleString()} (flat)`);
  lines.push(`Deposit: ${pricing.depositPercent || 0}%`);
  if (pricing.minimumCharge) lines.push(`Minimum charge: $${Number(pricing.minimumCharge).toLocaleString()}`);
  if (pricing.taxRate) lines.push(`Tax: ${pricing.taxRate}%`);
  return lines.join("\n");
}

// ── The extraction API call (fire-and-forget friendly; never throws) ─────────────
function normalizeUpdate(raw: any): SchemaUpdate {
  if (!raw || typeof raw !== "object") return { ...EMPTY_UPDATE };
  const arr = (x: any) => (Array.isArray(x) ? x : []);
  const num = (x: any) => (x == null || isNaN(Number(x)) ? null : Number(x));
  return {
    newFields: arr(raw.newFields).filter((f: any) => f && f.label),
    updatedFields: arr(raw.updatedFields).filter((f: any) => f && f.label),
    newAddOns: arr(raw.newAddOns).filter((a: any) => a && a.label),
    depositPercent: num(raw.depositPercent),
    tradeName: raw.tradeName ? String(raw.tradeName) : null,
    businessTagline: raw.businessTagline ? String(raw.businessTagline) : null,
    confidence: (["high", "medium", "low"].includes(raw.confidence) ? raw.confidence : "low") as Confidence,
  };
}

// Robustly extract a JSON object from a model response: strip markdown code fences and any
// surrounding prose, then parse the first {...} block. Logs the failure with the raw text.
function parseExtractionJson(raw: string): any | null {
  try {
    let c = String(raw || "").trim()
      .replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const f = c.indexOf("{");
    const l = c.lastIndexOf("}");
    if (f !== -1 && l !== -1 && l > f) c = c.substring(f, l + 1);
    return JSON.parse(c);
  } catch (e) {
    logger.error("[SchemaExtractor] JSON parse failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// Sends a single message to Claude for structured extraction. Returns an empty update on ANY error
// so a failed extraction never blocks the conversation.
export async function extractFromMessage(userMessage: string, currentSchema: QuoteSchema, context: string): Promise<SchemaUpdate> {
  try {
    if (!userMessage || !userMessage.trim()) return { ...EMPTY_UPDATE };
    logger.debug("[SchemaExtractor] extracting...");
    const slim = { trade: currentSchema.trade, fields: (currentSchema.fields || []).map(f => ({ label: f.label, unit: f.unit })), addOns: (currentSchema.addOns || []).map(a => a.label), depositPercent: currentSchema.pricing?.depositPercent ?? 0 };
    const user = `${context ? "Context: " + context + "\n\n" : ""}The user is setting up a quote tool for their contracting business. They just said: "${userMessage}"\n\nCurrent schema state: ${JSON.stringify(slim)}\n\nExtract any NEW pricing or service information from this message and return ONLY the JSON SchemaUpdate object — no markdown, no backticks, no explanation.`;
    const response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", max_tokens: 700, system: SCHEMA_EXTRACTION_PROMPT, messages: [{ role: "user", content: user }] }),
    });
    const data = await response.json();
    const text = data?.content?.[0]?.text;
    if (typeof text !== "string") return { ...EMPTY_UPDATE };
    const parsed = parseExtractionJson(text);
    if (!parsed) return { ...EMPTY_UPDATE };
    const update = normalizeUpdate(parsed);
    logger.debug("[SchemaExtractor] extraction complete");
    return update;
  } catch (error) {
    logger.error("[SchemaExtractor] error:", error instanceof Error ? error.message : String(error));
    return { ...EMPTY_UPDATE };
  }
}

// Dev/console test harness (Step 7). Runs an extraction against a sample message and logs the result.
// In the browser console run: __pricrTestExtraction()
export async function testExtraction(message = "I charge $20 per sq ft for pressure treated and $28 for composite"): Promise<SchemaUpdate> {
  const result = await extractFromMessage(message, BLANK_SCHEMA, "Test run");
  logger.debug("[SchemaExtractor][test] complete");
  applySchemaUpdate(BLANK_SCHEMA, result);
  return result;
}
if (typeof globalThis !== "undefined") { (globalThis as any).__pricrTestExtraction = testExtraction; }

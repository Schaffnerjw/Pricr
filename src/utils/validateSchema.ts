import { QuoteSchema } from "../types";

export interface ValidationResult {
  ok: boolean;
  // True for the specific "$100 / Job Size" failed-parse placeholder — drives the urgent banner.
  isPlaceholder: boolean;
  reason?: string;
}

// Pricing keys that are not per-field service rates (excluded from the "has a real rate" check).
const NON_RATE = /tax|deposit|percent|minimum|multiplier|markup/i;

// Validates a built schema so a broken/placeholder one is never silently treated as real.
export function validateSchema(schema?: QuoteSchema | null): ValidationResult {
  if (!schema) return { ok: false, isPlaceholder: false, reason: "No quote tool has been built yet." };
  const fields = schema.fields || [];
  const pricing = schema.pricing || {};
  const trade = (schema.trade || "").trim();

  // The dead giveaway of a failed parse: a single generic "Job Size" field priced at exactly $100.
  const jobSizePlaceholder = fields.some(f => /\bjob size\b/i.test(f.label || ""))
    && Object.values(pricing).some(v => v === 100);
  if (jobSizePlaceholder) {
    return { ok: false, isPlaceholder: true, reason: "Your quote tool is using a placeholder ($100 / Job Size) instead of your real pricing." };
  }

  if (fields.length === 0) return { ok: false, isPlaceholder: false, reason: "Your quote tool has no fields yet." };
  if (!trade || /^general$/i.test(trade)) return { ok: false, isPlaceholder: false, reason: "Your quote tool has no trade name." };

  const rates = Object.entries(pricing).filter(([k]) => !NON_RATE.test(k)).map(([, v]) => v);
  const hasRealRate = rates.some(r => typeof r === "number" && r > 0 && r !== 100);
  if (!hasRealRate) return { ok: false, isPlaceholder: false, reason: "Your quote tool has no real pricing yet." };

  return { ok: true, isPlaceholder: false };
}

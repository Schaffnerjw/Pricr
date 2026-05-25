import { DocPrefs, PaymentMethods } from "../types";

export function generateCode(): string { return Math.random().toString(36).substring(2,8).toUpperCase(); }

// The built-in payment methods an admin can accept (the "Other" option is free text).
export const PAYMENT_OPTIONS = ["Credit/Debit Card", "Cash", "Check", "Venmo", "Zelle", "PayPal"] as const;

// Resolve a business's accepted payment methods into a flat list of labels (built-ins + "Other" text).
export function resolvePaymentMethods(p?: PaymentMethods | null): string[] {
  if (!p) return [];
  const list = (p.methods || []).filter(m => m && m !== "Other");
  if ((p.methods || []).includes("Other") && p.other?.trim()) list.push(p.other.trim());
  return list;
}

// Extracts Kit's contextual reply pills from a message: strips the `SUGGESTED_REPLIES: [...]` line
// and returns the cleaned conversational text plus the parsed options (empty when none).
export function parseSuggestedReplies(text: string): { content: string; replies: string[] } {
  const m = (text || "").match(/SUGGESTED_REPLIES:\s*(\[[\s\S]*?\])/);
  if (!m) return { content: text || "", replies: [] };
  let replies: string[] = [];
  try { const arr = JSON.parse(m[1]); if (Array.isArray(arr)) replies = arr.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 4); } catch { /* ignore */ }
  return { content: (text.replace(m[0], "").trim()) || text.trim(), replies };
}

// Resolve a business's customer-document preferences, defaulting to "detailed" (show everything)
// when unset. "summary" hides line items/pricing/breakdown; "custom" honors the individual toggles.
export function resolveDocPrefs(p?: Partial<DocPrefs> | null): DocPrefs {
  const style = p?.style ?? "detailed";
  if (style === "summary") return { style, showLineItems: false, showPricing: false, showSubtotal: false, showContact: p?.showContact ?? true };
  if (style === "custom") return {
    style,
    showLineItems: p?.showLineItems ?? true,
    showPricing: p?.showPricing ?? true,
    showSubtotal: p?.showSubtotal ?? true,
    showContact: p?.showContact ?? true,
  };
  return { style: "detailed", showLineItems: true, showPricing: true, showSubtotal: true, showContact: true };
}
export function formatDate(ts: number): string { return new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
export function formatLongDate(ts: number): string { return new Date(ts).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}); }
export function formatMoney(n: number): string { const a = Math.round(Math.abs(n)).toLocaleString(); return n < 0 ? `-$${a}` : `$${a}`; }
export function parseSchemaFromResponse(raw: string): any|null {
  try {
    let c = raw.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const f = c.indexOf("{"), l = c.lastIndexOf("}");
    if (f !== -1 && l !== -1) c = c.substring(f, l + 1);
    return JSON.parse(c);
  } catch {
    // Returns null on unparseable/truncated JSON; the caller decides how to handle it.
    return null;
  }
}

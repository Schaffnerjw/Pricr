import { DocPrefs } from "../types";

export function generateCode(): string { return Math.random().toString(36).substring(2,8).toUpperCase(); }

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
export function formatMoney(n: number): string { return `$${Math.round(n).toLocaleString()}`; }
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

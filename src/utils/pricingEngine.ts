// ── The pricing engine: the single source of truth for all quote math ──
// Rules (see the engineering audit):
//   • Rate lookup is ALWAYS by option ID — never by name matching.
//   • A missing rate produces a visible error on the line item, never a silent $0.
//   • All arithmetic is done in integer cents, then surfaced as dollars.
//   • No new Function(), no eval(), no dynamic code execution — ever.
//   • Pure: the same inputs always produce the same outputs.

import { SchemaSection, SectionPattern } from "../types/schema";
import {
  AddOnSelection, DiscountInput, LineItem, LineItemType, PricingConfig, QuoteSelections, QuoteTotal,
} from "../types/lineItems";

const toCents = (dollars: number): number => Math.round((Number(dollars) || 0) * 100);
const toDollars = (cents: number): number => Math.round(cents) / 100;

const TYPE_FOR_PATTERN: Record<SectionPattern, LineItemType> = {
  MATERIAL_MEASUREMENT: "material",
  SYSTEM_CONFIG_QUANTITY: "material",
  LABOR: "labor",
  FLAT_RATE: "flat",
  ADDON: "addon",
};

// Normalize a tax value: a value < 1 (e.g. 0.07) is a fraction → 7%; a value >= 1 is already a percent.
const normalizeTaxPercent = (raw: number): number => (raw > 0 && raw < 1 ? raw * 100 : raw);

// Build the line items for one quote, then total them. Rates come from `section.options` by ID.
export function buildLineItems(
  sections: SchemaSection[],
  selections: QuoteSelections,
  addOns: AddOnSelection[],
  discount: DiscountInput,
  config: PricingConfig = {},
): QuoteTotal {
  const items: LineItem[] = [];

  for (const section of sections || []) {
    const sel = selections?.[section.id];
    if (!sel || !sel.optionIds || sel.optionIds.length === 0) continue;
    const lineType = TYPE_FOR_PATTERN[section.pattern] ?? "material";
    const measured = section.pattern === "MATERIAL_MEASUREMENT" || section.pattern === "LABOR" || section.pattern === "SYSTEM_CONFIG_QUANTITY";

    for (const optionId of sel.optionIds) {
      const option = (section.options || []).find(o => o.id === optionId);
      // Rate lookup by ID. Not found → surfaced error, total 0, never silent.
      if (!option) {
        items.push({
          id: `${section.id}:${optionId}`, sectionId: section.id, sectionName: section.name,
          label: optionId, quantity: 0, unit: section.quantityUnit || "", rate: 0, total: 0,
          type: lineType, optionId, rateSource: "", error: "Rate not found",
        });
        continue;
      }
      const quantity = measured ? (Number(sel.quantities?.[optionId]) || 0) : 1;
      const unit = section.quantityUnit || option.unit || (measured ? "" : "flat");
      const totalCents = Math.round(quantity * toCents(option.rate));
      const label = measured ? `${option.label} — ${quantity.toLocaleString()} ${unit}`.trim() : option.label;
      items.push({
        id: `${section.id}:${option.id}`, sectionId: section.id, sectionName: section.name,
        label, quantity, unit, rate: option.rate, total: toDollars(totalCents),
        type: lineType, optionId: option.id, rateSource: option.id,
      });
    }
  }

  for (const ao of addOns || []) {
    items.push({
      id: `addon:${ao.id}`, sectionId: "_addons", sectionName: "Add-ons",
      label: ao.label, quantity: 1, unit: "flat", rate: ao.price, total: toDollars(toCents(ao.price)),
      type: "addon", optionId: ao.id, rateSource: ao.id,
    });
  }

  // Discount as its own (negative) line item so it flows everywhere consistently.
  const subtotalCents = items.reduce((c, li) => c + toCents(li.total), 0);
  if (discount && discount.value > 0) {
    const discCents = discount.mode === "percent"
      ? Math.round(subtotalCents * (Math.min(100, discount.value) / 100))
      : Math.min(toCents(discount.value), subtotalCents);
    if (discCents > 0) {
      items.push({
        id: "discount", sectionId: "_discount", sectionName: "Discount",
        label: discount.reason ? `Discount (${discount.reason})` : "Discount",
        quantity: 1, unit: "flat", rate: -toDollars(discCents), total: -toDollars(discCents),
        type: "discount", optionId: "discount", rateSource: "discount",
      });
    }
  }

  return computeQuoteTotal(items, config);
}

// Total a list of line items. Simple, deterministic reduction — always correct.
export function computeQuoteTotal(lineItems: LineItem[], config: PricingConfig = {}): QuoteTotal {
  const items = lineItems || [];
  const subtotalCents = items.filter(li => li.type !== "discount").reduce((c, li) => c + toCents(li.total), 0);
  const discountCents = items.filter(li => li.type === "discount").reduce((c, li) => c + Math.abs(toCents(li.total)), 0);
  const taxableCents = Math.max(0, subtotalCents - discountCents);

  const taxPercent = normalizeTaxPercent(Number(config.taxRate) || 0);
  const taxCents = Math.round(taxableCents * (taxPercent / 100));
  let totalCents = taxableCents + taxCents;

  const minimumCents = toCents(config.minimumCharge || 0);
  const belowMin = totalCents > 0 && totalCents < minimumCents;
  if (belowMin) totalCents = minimumCents;

  const depositPercent = Number(config.depositPercent) || 0;
  const depositCents = depositPercent > 0 && totalCents > 0 ? Math.round(totalCents * (depositPercent / 100)) : 0;

  return {
    lineItems: items,
    subtotal: toDollars(subtotalCents),
    discount: toDollars(discountCents),
    tax: toDollars(taxCents),
    total: toDollars(totalCents),
    deposit: depositPercent,
    depositAmount: toDollars(depositCents),
    minimum: toDollars(minimumCents),
    belowMin,
    hasErrors: items.some(li => !!li.error),
  };
}

// Belt-and-suspenders math check (compared in integer cents to avoid float drift). Used in dev + tests.
export function validateQuoteTotal(q: QuoteTotal): { ok: boolean; reason?: string } {
  const sumNonDiscount = q.lineItems.filter(li => li.type !== "discount").reduce((c, li) => c + toCents(li.total), 0);
  if (toCents(q.subtotal) !== sumNonDiscount) {
    return { ok: false, reason: `subtotal ${q.subtotal} != sum of line items ${toDollars(sumNonDiscount)}` };
  }
  // total === subtotal - discount + tax, unless raised to the minimum charge.
  const expectedTotal = toCents(q.subtotal) - toCents(q.discount) + toCents(q.tax);
  if (!q.belowMin && toCents(q.total) !== Math.max(0, expectedTotal)) {
    return { ok: false, reason: `total ${q.total} != subtotal - discount + tax (${toDollars(Math.max(0, expectedTotal))})` };
  }
  return { ok: true };
}

// Shared total-summing reducer (was copy-pasted across analytics). Sums any items with a numeric total.
export function sumLineItems<T extends { total?: number | null }>(items: T[]): number {
  return (items || []).reduce((sum, it) => sum + (Number(it?.total) || 0), 0);
}

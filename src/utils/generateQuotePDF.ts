import { formatLongDate, formatMoney } from "./helpers";

export interface QuotePDFLine { label: string; amount: number; }

export interface QuotePDFData {
  businessName: string;
  brandColor: string;
  logoUri?: string | null;
  phone?: string;
  email?: string;
  address?: string;
  customerName: string;
  trade?: string;
  date: number;          // quote date (timestamp)
  validThrough: number;  // expiry date (timestamp)
  lineItems: QuotePDFLine[];
  taxRate: number;       // whole-number percent (e.g. 7)
  tax: number;
  total: number;
  depositPct: number;
  deposit: number;
  balanceDue: number;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Builds a self-contained, print-ready HTML string styled as a premium quote/proposal document.
export function generateQuotePDF(d: QuotePDFData): string {
  const accent = d.brandColor || "#2979FF";
  const lineRows = d.lineItems
    .map(li => `<tr><td class="li">${esc(li.label)}</td><td class="amt">${formatMoney(li.amount)}</td></tr>`)
    .join("");
  const taxRow = d.taxRate > 0
    ? `<tr><td class="li muted">Tax (${d.taxRate}%)</td><td class="amt muted">${formatMoney(d.tax)}</td></tr>`
    : "";
  const depositBlock = d.depositPct > 0 && d.total > 0
    ? `<div class="deposit">
         <div>
           <div class="dep-label">${d.depositPct}% Deposit Due Today</div>
           <div class="dep-sub">Balance of ${formatMoney(d.balanceDue)} due upon completion</div>
         </div>
         <div class="dep-amt">${formatMoney(d.deposit)}</div>
       </div>`
    : "";
  const contactBits = [d.phone, d.email, d.address].filter(Boolean).map(esc).join("&nbsp;&nbsp;·&nbsp;&nbsp;");
  const mark = d.logoUri
    ? `<img class="logo" src="${esc(d.logoUri)}" /><div class="biz">${esc(d.businessName)}</div>`
    : `<div class="biz">${esc(d.businessName)}</div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #0A0E1A; font-size: 14px; line-height: 1.5; }
  .page { padding: 0 40px 40px; }
  .header { background: #0A0E1A; color: #fff; padding: 36px 40px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid ${accent}; }
  .logo { max-height: 44px; max-width: 220px; display: block; margin-bottom: 8px; }
  .biz { font-size: 24px; font-weight: 800; letter-spacing: -0.4px; }
  .doc-meta { text-align: right; }
  .doc-type { font-size: 12px; letter-spacing: 2px; color: ${accent}; font-weight: 700; }
  .doc-date { font-size: 13px; color: #94A3B8; margin-top: 4px; }
  .fixed { color: ${accent}; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; margin-top: 28px; }
  .customer { font-size: 22px; font-weight: 800; margin-top: 6px; }
  .trade { color: #475569; font-size: 13px; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 28px; }
  td { padding: 12px 0; border-bottom: 1px solid #E2E8F0; }
  .li { color: #1E2640; }
  .amt { text-align: right; font-weight: 600; white-space: nowrap; }
  .muted { color: #64748B; font-weight: 500; }
  .total-row td { border-bottom: none; padding-top: 18px; }
  .total-row .li { font-size: 18px; font-weight: 800; }
  .total-row .amt { font-size: 28px; font-weight: 800; color: ${accent}; }
  .deposit { display: flex; justify-content: space-between; align-items: center; background: #F8FAFC; border: 1px solid ${accent}40; border-radius: 12px; padding: 16px 18px; margin-top: 24px; }
  .dep-label { font-weight: 700; font-size: 14px; }
  .dep-sub { color: #475569; font-size: 12px; margin-top: 2px; }
  .dep-amt { font-size: 22px; font-weight: 800; color: ${accent}; }
  .valid { color: #64748B; font-size: 12px; margin-top: 18px; }
  .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #E2E8F0; color: #475569; font-size: 12px; }
</style></head>
<body>
  <div class="header">
    <div>${mark}</div>
    <div class="doc-meta">
      <div class="doc-type">ESTIMATE</div>
      <div class="doc-date">${esc(formatLongDate(d.date))}</div>
    </div>
  </div>
  <div class="page">
    <div class="fixed">Fixed price estimate</div>
    <div class="customer">${esc(d.customerName || "Customer")}</div>
    ${d.trade ? `<div class="trade">${esc(d.trade)}</div>` : ""}
    <table>
      ${lineRows}
      ${taxRow}
      <tr class="total-row"><td class="li">Total</td><td class="amt">${formatMoney(d.total)}</td></tr>
    </table>
    ${depositBlock}
    <div class="valid">This estimate is valid for 30 days · through ${esc(formatLongDate(d.validThrough))}</div>
    ${contactBits ? `<div class="footer">${contactBits}</div>` : ""}
  </div>
</body></html>`;
}

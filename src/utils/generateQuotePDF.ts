import { QuotePresentation } from "../types";
import { formatLongDate, formatMoney, resolveDocPrefs } from "./helpers";

// The renderable quote snapshot, plus optional signature / signing link / terms.
export interface QuotePDFData extends QuotePresentation {
  signatureData?: string;       // base64 PNG of the customer signature, if signed
  signedAt?: number;            // timestamp the signature was captured
  signingLink?: string;         // remote signing URL, shown as a clickable link on page 1
  termsAndConditions?: string;  // business T&C — rendered as a full page 2 if present
  // Electronic signature record (audit) — rendered only when signatureData exists.
  signingToken?: string;        // document ID
  signerIp?: string;            // IP the signature came from
  documentHash?: string;        // SHA-256 tamper-evidence hash
  phoneVerified?: boolean;      // true when identity was SMS-verified
  certificateUrl?: string;      // public certificate-of-completion URL
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Builds a self-contained, print-ready HTML string styled as a premium quote/proposal document.
export function generateQuotePDF(d: QuotePDFData): string {
  const accent = d.brandColor || "#2979FF";
  // Customer-document preferences (default: detailed/show-all). Summary hides items + breakdown.
  const prefs = resolveDocPrefs(d.docPrefs);
  const lineRows = prefs.showLineItems
    ? d.lineItems
        .map(li => `<tr><td class="li">${esc(li.label)}</td><td class="amt">${prefs.showPricing ? formatMoney(li.amount) : ""}</td></tr>`)
        .join("")
    : "";
  const taxRow = prefs.showLineItems && prefs.showSubtotal && prefs.showPricing && d.taxRate > 0
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
  // Signature block — only when the quote has been signed.
  const signatureBlock = d.signatureData
    ? `<div class="sig-wrap">
         <img class="sig-img" src="${esc(d.signatureData)}" />
         <div class="sig-line"></div>
         <div class="sig-meta"><span>${esc(d.customerName || "Customer")}</span><span>${esc(formatLongDate(d.signedAt ?? d.date))}</span></div>
         <div class="sig-cap">Accepted &amp; signed</div>
       </div>`
    : "";
  // Project notes — free-text job details, shown before the signature block. Only when present.
  const notesBlock = d.notes && d.notes.trim()
    ? `<div class="notes"><div class="notes-title">Project Notes</div><div class="notes-body">${esc(d.notes.trim()).replace(/\n/g, "<br/>")}</div></div>`
    : "";
  // Clickable remote-signing link at the bottom of page 1.
  const signLinkBlock = d.signingLink
    ? `<div class="sign-link">Review &amp; sign online: <a href="${esc(d.signingLink)}">${esc(d.signingLink)}</a></div>`
    : "";
  // Terms &amp; conditions as a full page 2.
  const termsPage = d.termsAndConditions && d.termsAndConditions.trim()
    ? `<div class="terms-page">
         <div class="terms-title">Terms &amp; Conditions</div>
         <div class="terms-body">${esc(d.termsAndConditions).replace(/\n/g, "<br/>")}</div>
       </div>`
    : "";
  // Accepted payment methods (admin sets once in Settings; shown on every quote — FIX 11).
  const paymentBlock = d.paymentMethods && d.paymentMethods.length
    ? `<div class="pay"><span class="pay-label">We Accept:</span> ${esc(d.paymentMethods.join(", "))}</div>`
    : "";
  // Electronic signature record (legal audit block) — only on a signed PDF.
  const esignRow = (label: string, value: string) =>
    `<div class="es-row"><span class="es-k">${esc(label)}</span><span class="es-v">${esc(value)}</span></div>`;
  const esignBlock = d.signatureData
    ? `<div class="esign">
         <div class="es-title">Electronic Signature Record</div>
         ${esignRow("Signed by", d.customerName || "Customer")}
         ${esignRow("Date", formatLongDate(d.signedAt ?? d.date))}
         ${d.signingToken ? esignRow("Document ID", d.signingToken) : ""}
         ${d.signerIp ? esignRow("IP Address", d.signerIp) : ""}
         ${d.phoneVerified ? esignRow("Identity Verified", "SMS verified ✓") : ""}
         ${d.documentHash ? `<div class="es-row"><span class="es-k">Document Hash</span><span class="es-v es-hash">${esc(d.documentHash)}</span></div>` : ""}
         ${d.certificateUrl ? `<div class="es-row"><span class="es-k">Certificate</span><a class="es-v es-link" href="${esc(d.certificateUrl)}">${esc(d.certificateUrl)}</a></div>` : ""}
         <div class="es-legal">This document was electronically signed using Pricr. This signature is legally binding under the E-SIGN Act (15 U.S.C. § 7001) and UETA.</div>
       </div>`
    : "";
  const contactBits = [d.phone, d.email, d.address].filter(Boolean).map(esc).join("&nbsp;&nbsp;·&nbsp;&nbsp;");
  // The business name always renders, so the header is readable even if a remote logo can't load
  // offline; onerror hides a broken logo image cleanly. PDF generates with zero internet.
  const mark = d.logoUri
    ? `<img class="logo" src="${esc(d.logoUri)}" onerror="this.style.display='none'" /><div class="biz">${esc(d.businessName)}</div>`
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
  .notes { margin-top: 24px; padding: 16px 18px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; }
  .notes-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 800; color: ${accent}; margin-bottom: 8px; }
  .notes-body { font-size: 13px; line-height: 1.6; color: #1E2640; }
  .footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #E2E8F0; color: #475569; font-size: 12px; }
  .sig-wrap { margin-top: 32px; padding-top: 8px; max-width: 320px; }
  .sig-img { max-height: 90px; max-width: 300px; display: block; }
  .sig-line { border-bottom: 1.5px solid #0A0E1A; margin-top: 4px; }
  .sig-meta { display: flex; justify-content: space-between; font-size: 12px; color: #475569; margin-top: 6px; }
  .sig-cap { color: ${accent}; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-top: 8px; }
  .sign-link { margin-top: 28px; padding: 12px 14px; background: #F8FAFC; border: 1px solid ${accent}40; border-radius: 10px; font-size: 12px; color: #475569; }
  .sign-link a { color: ${accent}; font-weight: 600; word-break: break-all; }
  .pay { margin-top: 20px; font-size: 13px; color: #1E2640; }
  .pay-label { font-weight: 700; color: #0A0E1A; }
  .esign { margin-top: 28px; padding: 16px 18px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; }
  .es-title { font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 800; color: ${accent}; margin-bottom: 10px; }
  .es-row { display: flex; justify-content: space-between; gap: 16px; padding: 4px 0; font-size: 12px; }
  .es-k { color: #64748B; } .es-v { color: #0A0E1A; font-weight: 600; text-align: right; word-break: break-word; }
  .es-hash { font-family: ui-monospace, Menlo, monospace; font-weight: 400; color: #475569; }
  .es-link { color: ${accent}; }
  .es-legal { margin-top: 10px; font-size: 11px; color: #475569; line-height: 1.6; }
  .terms-page { page-break-before: always; padding: 40px; }
  .terms-title { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; border-bottom: 3px solid ${accent}; padding-bottom: 10px; margin-bottom: 18px; }
  .terms-body { font-size: 12px; line-height: 1.7; color: #1E2640; white-space: normal; }
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
    ${notesBlock}
    ${signatureBlock}
    <div class="valid">${d.validThrough > 0 ? `Quote valid until ${esc(formatLongDate(d.validThrough))}` : "This quote does not expire"}</div>
    ${signLinkBlock}
    ${esignBlock}
    ${paymentBlock}
    ${prefs.showContact && contactBits ? `<div class="footer">${contactBits}</div>` : ""}
  </div>
  ${termsPage}
</body></html>`;
}

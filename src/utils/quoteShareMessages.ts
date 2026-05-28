// Pure message builders for quote delivery. Used by both the client-side share sheet (Share.share /
// navigator.share) AND by tests that assert "the body contains a hosted link, not a file attachment".
// The proxy has its own templates for /quote/send-link (so it doesn't depend on bundling these), but
// the shapes match — both ultimately put `link` in the body and reference no attachment.

import { formatMoney } from "./helpers";

export interface QuoteShareInputs {
  customerName?: string;
  bizName: string;
  total: number;
  link: string;             // hosted signing/quote page on the proxy — taps to open in the customer's browser
  signed?: boolean;         // true → "Your signed quote …"; false → "Review and sign …"
}

// SMS body. Single short paragraph + the link. Carriers and iMessage auto-format URLs into a
// tappable preview card, so the customer never sees a file attachment.
export function buildShareSmsMessage(o: QuoteShareInputs): string {
  const greet = o.customerName?.trim() ? `Hi ${o.customerName.trim()},\n\n` : "";
  if (o.signed) return `${greet}Your signed quote from ${o.bizName}: ${o.link}`;
  return `${greet}Thanks for considering ${o.bizName}. Here's your quote for ${formatMoney(o.total)}.\n\nReview and sign: ${o.link}`;
}

// Plain-text email body intended to also serve as a fallback for the OS share sheet's `message`
// field (covers both Mail and Messages on iOS). The proxy's email path uses a richer HTML template
// — this is the no-attachment safety net the client uses when sharing via the OS.
export function buildShareEmailBody(o: QuoteShareInputs): string {
  return buildShareSmsMessage(o);
}

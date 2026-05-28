// Pure helpers for snippets of the signing page that the proxy renders. Kept here so the rules are
// unit-testable; proxy.js mirrors the same logic inline (it can't directly import TS — the dup is
// 5 lines and trivially provable from these tests).

// HTML-attribute escaper (proxy has its own esc(); this mirrors enough for hrefs).
function escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The 5-star "Trusted contractor" row. When a Google-review URL is set, the row is wrapped in an
// <a> so it's tappable; when it's empty, the row renders exactly as before (NOT tappable, no extra
// markup, no rating numbers — additive only).
export function buildRatingHTML(reviewUrl?: string | null): string {
  const stars = "&#9733;&#9733;&#9733;&#9733;&#9733; <span>Trusted contractor</span>";
  const row = `<div class="rating">${stars}</div>`;
  const url = (reviewUrl || "").trim();
  if (!url) return row;
  return `<a class="rating-link" href="${escAttr(url)}" target="_blank" rel="noopener noreferrer">${row}</a>`;
}

// Signpost asserted by tests so a future edit can't quietly reintroduce a personal intro on the
// signing page. The contractor's intro now travels in the SMS/email delivery body instead.
export const SIGNING_PAGE_INCLUDES_INTRO = false;

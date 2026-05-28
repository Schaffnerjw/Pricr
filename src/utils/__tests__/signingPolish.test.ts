import * as fs from "fs";
import * as path from "path";
import { buildRatingHTML, SIGNING_PAGE_INCLUDES_INTRO } from "../signingRenderHelpers";

// Proxy source lives at the repo root. Read once and reuse across the regression checks below.
const PROXY_SRC = fs.readFileSync(path.join(__dirname, "..", "..", "..", "proxy.js"), "utf8");

describe("google review stars", () => {
  test("google review stars link when url set, not tappable when empty", () => {
    // Empty / missing URL → plain stars row, NO <a> wrapper, identical to the original.
    const noUrl = buildRatingHTML();
    const blank = buildRatingHTML("");
    const spaces = buildRatingHTML("   ");
    for (const out of [noUrl, blank, spaces]) {
      expect(out).toContain('class="rating"');
      expect(out).not.toContain("<a ");
    }
    // URL set → row is wrapped in an <a> that opens in a new tab with safe rel attrs.
    const linked = buildRatingHTML("https://g.page/r/abc/review");
    expect(linked.startsWith('<a class="rating-link"')).toBe(true);
    expect(linked).toContain('href="https://g.page/r/abc/review"');
    expect(linked).toContain('target="_blank"');
    expect(linked).toContain('rel="noopener noreferrer"');
    expect(linked).toContain('class="rating"');
    // Proxy mirrors this: it produces the linked variant only when googleReviewUrl is set.
    expect(PROXY_SRC).toContain('class="rating-link"');
    expect(PROXY_SRC).toContain("googleReviewUrl");
  });
});

describe("signing page intro moved to delivery body", () => {
  test("intro message not rendered on signing page", () => {
    // The build-time signpost (caught by tests; mirrored by the proxy source below).
    expect(SIGNING_PAGE_INCLUDES_INTRO).toBe(false);
    // Hard guard against re-introducing the intro on the signing page: no personalMsg variable, no
    // pmsg HTML interpolation in the review step, no "Thank you for considering …" greeting.
    expect(PROXY_SRC).not.toMatch(/\$\{personalMsg\}/);
    expect(PROXY_SRC).not.toMatch(/const personalMsg\s*=/);
    expect(PROXY_SRC).not.toMatch(/Thank you for considering\s*\$\{/);
  });

  test("signing page renders quote total and sign without intro block", () => {
    // The review step still renders the quote total + the signature submit button; just no intro.
    // money(total) is the proxy's total renderer; id="submit" is the Sign & Accept button.
    expect(PROXY_SRC).toMatch(/\$\{money\(total\)\}/);
    expect(PROXY_SRC).toMatch(/id="submit"/);
    // Neither the pmsg CSS class nor the personalMsg block is referenced in the review step body.
    const reviewStep = PROXY_SRC.split("// Step 3 — review and sign")[1] || "";
    expect(reviewStep).not.toContain("personalMsg");
    expect(reviewStep).not.toContain("class=\"pmsg\"");
  });
});

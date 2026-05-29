// Fix 5 — signed-quote / email links domain. The production incident was an env-var
// configuration: Railway's SIGN_BASE_URL was set to https://sign.pricr.veraa.io, which has no
// DNS record. Every customer email and SMS shipped a "server can't be found" URL. The code
// default (in proxy.js) is the Railway URL, which actually serves the /sign/:token routes.
// These tests pin: (a) the new dead-host reference does NOT live anywhere in the project's
// source tree, (b) the URL-construction shape produces a single consistent host for both email
// + SMS so they can't drift apart.
import { readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

describe("Fix 5 — signing URLs use a real reachable host", () => {
  test("signed quote URLs use a real reachable host (not sign.pricr.veraa.io)", () => {
    // proxy.js is the source of truth: SIGNING_BASE is the host the email/SMS templates use to
    // build every signing URL. The default MUST be the Railway URL (the host that actually
    // serves /sign/:token), not the dead vanity domain. The dead host can only appear in the
    // explanatory comment (as a cautionary tale).
    const proxy = readFileSync(join(REPO_ROOT, "proxy.js"), "utf8");
    // Default value of SIGNING_BASE
    expect(proxy).toMatch(/const SIGNING_BASE = process\.env\.SIGN_BASE_URL \|\| 'https:\/\/pricr-production\.up\.railway\.app'/);
    // The dead host appears ONLY in the comment that documents the incident — counted to be
    // sure no production code path actually constructs URLs against it.
    const deadHostUsages = proxy.split("\n").filter(line => /sign\.pricr\.veraa\.io/.test(line) && !/^\s*\/\//.test(line));
    expect(deadHostUsages).toEqual([]);
  });

  test("dead host not referenced in client source either", () => {
    // The client builds SIGN_BASE from EXPO_PUBLIC_PROXY_URL at bundle time. Source code should
    // not hardcode the dead host anywhere — config is the only place a deploy can point at it.
    const brand = readFileSync(join(REPO_ROOT, "src", "constants", "brand.ts"), "utf8");
    const config = readFileSync(join(REPO_ROOT, "src", "config.ts"), "utf8");
    expect(brand).not.toMatch(/sign\.pricr\.veraa\.io/);
    expect(config).not.toMatch(/sign\.pricr\.veraa\.io/);
  });

  test("SMS quote-link body uses the same host as email link", () => {
    // proxy.js's quoteLinkSmsBody + quoteLinkEmailHtml + the existing certificate emails build
    // their URL by string-concatenating SIGNING_BASE + '/sign/' + token. The host is the same
    // variable for both, so they CAN'T drift apart — this test pins the shape.
    const proxy = readFileSync(join(REPO_ROOT, "proxy.js"), "utf8");
    // Two URL templates in the send-link handler (signed vs unsigned). Both must derive from
    // SIGNING_BASE.
    expect(proxy).toMatch(/`\$\{SIGNING_BASE\}\/sign\/\$\{encodeURIComponent\(token\)\}\/certificate`/);
    expect(proxy).toMatch(/`\$\{SIGNING_BASE\}\/sign\/\$\{encodeURIComponent\(token\)\}`/);
  });

  test("certificate URL uses the same host as the signing URL", () => {
    // Same SIGNING_BASE feeds both the bare signing URL and the /certificate variant. If a
    // future refactor splits them into two different constants, this test fails first.
    const proxy = readFileSync(join(REPO_ROOT, "proxy.js"), "utf8");
    const certUsages = (proxy.match(/SIGNING_BASE.*\/certificate/g) || []).length;
    const bareSignUsages = (proxy.match(/SIGNING_BASE.*\/sign\/\$\{encodeURIComponent\(token\)\}`/g) || []).length;
    // Both shapes must exist in the file (we deliberately build URLs in two places: the
    // post-sign customer email uses /certificate, the pre-sign /quote/send-link can use
    // either depending on the `signed` flag).
    expect(certUsages).toBeGreaterThan(0);
    expect(bareSignUsages).toBeGreaterThan(0);
  });
});

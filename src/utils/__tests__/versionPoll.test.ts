// The web update pipeline (sw.js updatefound → 'pricr-update-available' → UpdateBanner) only
// fires when /sw.js is byte-different. Because the browser only re-checks /sw.js ~every 24h on
// an open tab, we ALSO poll /version.json every ~5 min and dispatch the same event. These tests
// cover the two pure decisions that drive the poll: parsing the wire payload safely, and
// deciding when the boot-vs-fetched SHA mismatch warrants firing the event.
import { parseVersionResponse, shouldFireUpdate } from "../versionPoll";

describe("versionPoll", () => {
  test("version.json poll fires update event when SHA changes", () => {
    // A new deploy stamped a new SHA into dist/version.json → the active tab should be prompted.
    expect(shouldFireUpdate("abc123def456", "xyz789ghi012")).toBe(true);
  });

  test("version.json poll does not fire when SHA matches", () => {
    // No deploy since boot — the fetched SHA matches what we captured, nothing to do.
    expect(shouldFireUpdate("abc123def456", "abc123def456")).toBe(false);
  });

  test("version poll failure is silent (no crash, no false prompt)", () => {
    // Both null branches model real failure modes: offline (fetch threw → fetchedSha null),
    // garbled CDN response (parse returned null → fetchedSha null), and first run (boot SHA
    // hasn't been captured yet → bootSha null). NONE of these may fire a prompt, because a
    // false-positive "update available" while a contractor is mid-quote would be worse than
    // silently waiting another 5 min.
    expect(shouldFireUpdate(null, "xyz789")).toBe(false);
    expect(shouldFireUpdate("abc123", null)).toBe(false);
    expect(shouldFireUpdate(null, null)).toBe(false);

    // parseVersionResponse must reject anything it can't trust, returning null so the caller
    // treats the tick as a no-op. (HTML 404 pages slipping through, mis-typed JSON, empty body…)
    expect(parseVersionResponse(null)).toBeNull();
    expect(parseVersionResponse(undefined)).toBeNull();
    expect(parseVersionResponse("not an object")).toBeNull();
    expect(parseVersionResponse({})).toBeNull();
    expect(parseVersionResponse({ sha: "" })).toBeNull();
    expect(parseVersionResponse({ sha: 42 })).toBeNull();
    expect(parseVersionResponse({ notSha: "abc" })).toBeNull();

    // Happy path: a well-formed payload (extra fields like `short` / `builtAt` are tolerated).
    expect(parseVersionResponse({ sha: "abc123def456" })).toEqual({ sha: "abc123def456" });
    expect(parseVersionResponse({ sha: "abc123", short: "abc123", builtAt: "2026-05-28T00:00:00Z" })).toEqual({ sha: "abc123" });
  });
});

// The UpdateBanner ships on react-native-web and depends on iOS's CSS env(safe-area-inset-top)
// to clear the notch / status bar / Safari address-bar overlay. Real-device testing showed the
// banner rendered with paddingVertical:12 + top:0 placed the Refresh button UNDER the browser
// chrome, making the whole auto-update system functionally broken. The tests below pin the two
// invariants the fix depends on: (a) the env() expression is actually present in the rendered
// style, and (b) the buttons clear the 44pt iOS HIG minimum tap target. Source-code assertion
// (the same "grep-assert" pattern kitResponseRendererGate.test.ts uses) because jest's node env
// can't mount react-native-web at runtime.
import { readFileSync } from "fs";
import { join } from "path";

const SRC = readFileSync(join(__dirname, "..", "..", "components", "UpdateBanner.tsx"), "utf8");

describe("UpdateBanner mobile-web safe-area handling", () => {
  test("UpdateBanner uses safe-area inset on web", () => {
    // Pin the exact env() expression — `max(env(safe-area-inset-top), 12px)` — so a future
    // refactor can't quietly downgrade it to a fixed paddingTop and re-introduce the bug. The
    // max() floor matters: env() returns 0 on Android Chrome / desktop / non-cover viewports,
    // and without the 12px floor those would render flush to the screen edge.
    expect(SRC).toMatch(/paddingTop:\s*["']max\(env\(safe-area-inset-top\),\s*12px\)["']/);
    // viewport-fit=cover is a hard prerequisite for env() to ever return non-zero on iOS Safari.
    // It's set in app/+html.tsx — pinning that link here too so removing it breaks this test.
    const html = readFileSync(join(__dirname, "..", "..", "..", "app", "+html.tsx"), "utf8");
    expect(html).toMatch(/viewport-fit=cover/);
  });

  test("UpdateBanner Refresh button has minimum 44pt tap target", () => {
    // iOS Human Interface Guidelines: 44×44pt minimum. The Refresh button explicitly declares
    // both axes; the close × declares minHeight + minWidth both at 44. Pin both so a "let me
    // shrink the chrome" refactor can't silently slip below the threshold.
    // Refresh: minHeight 44 + minWidth 88 (88 leaves room for "Refresh →" text without truncation).
    expect(SRC).toMatch(/onPress=\{reload\}[\s\S]{0,400}minHeight:\s*44[\s\S]{0,80}minWidth:\s*88/);
    // Close button: 44 × 44 square.
    expect(SRC).toMatch(/setVisible\(false\)[\s\S]{0,400}minHeight:\s*44[\s\S]{0,80}minWidth:\s*44/);
    // hitSlop expands beyond the 44pt floor for tap forgiveness around the small × glyph.
    expect(SRC).toMatch(/setVisible\(false\)[\s\S]{0,200}hitSlop=\{12\}/);
  });

  test("native is unchanged — banner only renders on web", () => {
    // Native handles status bar via expo-status-bar + SafeAreaView already. The web-only fix
    // must NOT introduce a native render path (would double-pad on iOS native), so the early
    // return on Platform.OS !== "web" must stay intact.
    expect(SRC).toMatch(/Platform\.OS\s*!==\s*["']web["']\s*\|\|\s*!visible\)\s*return\s*null/);
  });
});

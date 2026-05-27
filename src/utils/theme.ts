import { BrandConfig } from "../types";

// ── Single source of truth for app theming ─────────────────────────────────────
// Every helper validates its input and falls back to a safe default, so a malformed
// or empty brand color can NEVER crash the app or produce an invalid CSS/RN color.

const DEFAULT_PRIMARY = "#2979FF";
const DEFAULT_SECONDARY = "#00E5FF";
const DEFAULT_BACKGROUND = "#0A0E1A";

export interface AppTheme {
  primary: string;        // buttons, active states, accents
  primaryLight: string;   // translucent version of primary
  primaryDark: string;    // darker version of primary
  secondary: string;      // secondary text, subtle borders
  background: string;     // page background
  surface: string;        // card/panel background (slightly offset from bg)
  surfaceHigh: string;    // elevated surface (modals, sheets)
  text: string;           // primary text (auto contrast vs background)
  textMuted: string;      // secondary text (55% opacity of text)
  textInverse: string;    // text on primary color backgrounds
  border: string;         // subtle borders
  borderStrong: string;   // prominent borders
  success: string;        // always #22C55E
  warning: string;        // always #F59E0B
  error: string;          // always #EF4444
}

// Normalize any input to a 6-digit "#rrggbb", or return "" when it can't be parsed.
function clampHex(hex: string): string {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // drop any alpha
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : "";
}

function toRgb(hex: string, fallback: string): { r: number; g: number; b: number } {
  const h = clampHex(hex) || clampHex(fallback) || "#000000";
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

const toHex = (r: number, g: number, b: number): string => {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
};

// WCAG relative luminance (0 = black, 1 = white). Safe on any input.
function luminance(hex: string): number {
  const { r, g, b } = toRgb(hex, "#000000");
  const ch = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// True when a background is light enough that dark text reads better than white.
export function isLightColor(hex: string): boolean {
  return luminance(hex) > 0.5;
}

// Darken toward black by `amount` (0–1).
export function darken(hex: string, amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const { r, g, b } = toRgb(hex, DEFAULT_BACKGROUND);
  return toHex(r * (1 - a), g * (1 - a), b * (1 - a));
}

// Lighten toward white by `amount` (0–1).
export function lighten(hex: string, amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const { r, g, b } = toRgb(hex, DEFAULT_BACKGROUND);
  return toHex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a);
}

// rgba() string for the given hex at `opacity` (0–1). RN + web compatible.
export function hexWithOpacity(hex: string, opacity: number): string {
  const o = Math.max(0, Math.min(1, opacity));
  const { r, g, b } = toRgb(hex, "#000000");
  return `rgba(${r}, ${g}, ${b}, ${o})`;
}

// Derive the full app theme from a business's brand. Always returns valid colors.
export function buildTheme(brand: BrandConfig): AppTheme {
  const primary = clampHex(brand?.primaryColor || "") || DEFAULT_PRIMARY;
  const background = clampHex(brand?.backgroundColor || "") || DEFAULT_BACKGROUND;
  const secondary = clampHex(brand?.secondaryColor || "") || DEFAULT_SECONDARY;

  const isLightBg = isLightColor(background);

  return {
    primary,
    primaryLight: hexWithOpacity(primary, 0.15),
    primaryDark: darken(primary, 0.15),
    secondary,
    background,
    surface: isLightBg ? darken(background, 0.04) : lighten(background, 0.06),
    surfaceHigh: isLightBg ? darken(background, 0.08) : lighten(background, 0.12),
    text: isLightBg ? "#0A0E1A" : "#FFFFFF",
    textMuted: isLightBg ? hexWithOpacity("#0A0E1A", 0.55) : hexWithOpacity("#FFFFFF", 0.55),
    textInverse: isLightColor(primary) ? "#0A0E1A" : "#FFFFFF",
    border: isLightBg ? hexWithOpacity("#0A0E1A", 0.12) : hexWithOpacity("#FFFFFF", 0.1),
    borderStrong: isLightBg ? hexWithOpacity("#0A0E1A", 0.25) : hexWithOpacity("#FFFFFF", 0.2),
    success: "#22C55E",
    warning: "#F59E0B",
    error: "#EF4444",
  };
}

// Preset brand palettes offered in Settings. [primary, secondary, background].
export interface ThemePreset { name: string; primary: string; secondary: string; background: string }
export const THEME_PRESETS: ThemePreset[] = [
  { name: "Pricr Dark", primary: "#2979FF", secondary: "#00E5FF", background: "#0A0E1A" },
  { name: "Hemma", primary: "#BC6C25", secondary: "#DDA15E", background: "#FFFADF" },
  { name: "Forest", primary: "#2D6A4F", secondary: "#95D5B2", background: "#081C15" },
  { name: "Slate", primary: "#475569", secondary: "#94A3B8", background: "#F8FAFC" },
  { name: "Midnight", primary: "#7C3AED", secondary: "#A78BFA", background: "#0F0A1E" },
];

import { Business } from "../types";

// Pricr defaults — the only hardcoded colors the palette falls back to.
const DEFAULT_PRIMARY = "#2979FF";
const DEFAULT_SECONDARY = "#00E5FF";
const DEFAULT_BACKGROUND = "#0A0E1A";

function clampHex(hex: string): string {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // drop any alpha
  return /^[0-9a-fA-F]{6}$/.test(h) ? `#${h.toLowerCase()}` : "";
}

function toRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = clampHex(hex);
  if (!h) return null;
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

// WCAG relative luminance.
function luminance(hex: string): number {
  const rgb = toRgb(hex);
  if (!rgb) return 0;
  const ch = [rgb.r, rgb.g, rgb.b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// WCAG contrast ratio between two colors (1–21).
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// Text/icon color for content sitting ON the primary brand color (CTA buttons, selected pills/cards,
// avatars). Product decision: the brand look wins on buttons, so this is ALWAYS white — even when
// WCAG would prefer black on a light primary. Backgrounds still auto-contrast via getContrastColor.
export const ON_PRIMARY = "#FFFFFF";

// Black or white — whichever reads better on the given background.
export function getContrastColor(backgroundColor: string): "#000000" | "#FFFFFF" {
  return contrastRatio("#FFFFFF", backgroundColor) >= contrastRatio("#000000", backgroundColor) ? "#FFFFFF" : "#000000";
}

// True if foreground/background meet WCAG AA (>= 4.5:1).
export function isReadable(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}

// Apply an alpha (0–1) to a hex color → 8-digit hex (RN + web compatible).
function withAlpha(hex: string, alpha: number): string {
  const h = clampHex(hex) || "#000000";
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, "0");
  return `${h}${a}`;
}

export interface BrandPalette {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  textMuted: string;
  border: string;
  surface: string;
  // True when the stored background can't show readable text either way (mid-tone), so we fell
  // back to the Pricr default background for this session — surface a "fix your colors" banner.
  adjusted: boolean;
}

// Derives the full, always-readable palette from a business's two brand colors + background.
// Text is auto-contrasted; surfaces/borders/muted are derived so nothing ever goes invisible.
export function getBrandPalette(business?: Pick<Business, "brand"> | null): BrandPalette {
  const brand = business?.brand;
  const primary = clampHex(brand?.primaryColor || "") || DEFAULT_PRIMARY;
  const secondary = clampHex(brand?.secondaryColor || "") || DEFAULT_SECONDARY;
  const rawBg = clampHex(brand?.backgroundColor || "") || DEFAULT_BACKGROUND;

  const idealText = getContrastColor(rawBg);
  const adjusted = !isReadable(idealText, rawBg); // neither black nor white is readable enough
  const background = adjusted ? DEFAULT_BACKGROUND : rawBg;
  const text = adjusted ? "#FFFFFF" : idealText;

  return {
    primary,
    secondary,
    background,
    text,
    textMuted: withAlpha(text, 0.7),
    border: withAlpha(text, 0.2),
    surface: withAlpha(primary, 0.1),
    adjusted,
  };
}

import { CardTheme } from "../types";
export function getLuminance(hex: string): number {
  const c = hex.replace("#",""); if(c.length!==6) return 0.5;
  const r=parseInt(c.substring(0,2),16), g=parseInt(c.substring(2,4),16), b=parseInt(c.substring(4,6),16);
  const l=(n:number)=>{const s=n/255;return s<=0.03928?s/12.92:Math.pow((s+0.055)/1.055,2.4)};
  return 0.2126*l(r)+0.7152*l(g)+0.0722*l(b);
}
export function getCardTheme(brandColor: string): CardTheme {
  const isLight = getLuminance(brandColor) > 0.35;
  return isLight
    ? { cardBg:"#0A0E1A", cardBorder:"#1E2640", bizColor:brandColor, customerColor:"#FFFFFF", lineColor:"#94A3B8", valueColor:"#E2E8F0", dividerColor:"#1E2640", totalColor:"#FFFFFF", depositBg:"#111827", depositBorder:brandColor+"50", depositLabelColor:"#94A3B8", depositAmountColor:brandColor }
    : { cardBg:"#FFFFFF", cardBorder:"#E2E8F0", bizColor:brandColor, customerColor:"#0A0E1A", lineColor:"#475569", valueColor:"#0A0E1A", dividerColor:"#E2E8F0", totalColor:"#0A0E1A", depositBg:"#F8FAFC", depositBorder:brandColor+"40", depositLabelColor:"#475569", depositAmountColor:brandColor };
}
export function isValidHex(hex: string): boolean { return /^#[0-9A-Fa-f]{6}$/.test(hex); }

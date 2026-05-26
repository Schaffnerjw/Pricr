import { PROXY_URL } from "../config";

// `muted` (#A0A0B0, ~7.4:1 on #0A0E1A) is the readable subtext/hint color — use it for muted
// label text on dark backgrounds. `gray3` (#475569, ~2.5:1) stays for borders/icons/placeholders.
export const B = { midnight:"#0A0E1A", navy:"#0D1225", card:"#111827", border:"#1E2640", blue:"#2979FF", cyan:"#00E5FF", white:"#FFFFFF", gray1:"#E2E8F0", gray2:"#94A3B8", muted:"#A0A0B0", gray3:"#475569", red:"#EF4444", green:"#10B981" } as const;
// NOTE: the master code is NOT stored client-side. Super-admin auth goes through the proxy
// (POST /admin/auth → short-lived Bearer token). See src/utils/masterAuth.ts.
export const DEFAULT_BRAND = { primaryColor:"#2979FF", secondaryColor:"#00E5FF", backgroundColor:"#0A0E1A", logoUri:null, tagline:"", phone:"", email:"", address:"" };
export const API_URL = `${PROXY_URL}/v1/messages`;
// Base for remote signing links (served by proxy.js): `${SIGN_BASE}/sign/<token>`.
export const SIGN_BASE = PROXY_URL;

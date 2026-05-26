// Client-side master (super-admin) auth. The master code is NEVER compared client-side and NEVER
// stored. It is sent once to the proxy's POST /admin/auth, which returns a short-lived Bearer token.
// The token lives in memory only (module scope) — never AsyncStorage — so it dies with the session.
import { SIGN_BASE } from "../constants/brand";
import { logger } from "./logger";

let token: string | null = null;
let expiresAt = 0;

// Valid, non-expired token or null.
export function getMasterToken(): string | null {
  if (!token || Date.now() >= expiresAt) { token = null; expiresAt = 0; return null; }
  return token;
}

export function clearMasterToken(): void { token = null; expiresAt = 0; }

// Exchange the entered code for a session token. Returns true on success. Logs nothing sensitive.
export async function authenticateMaster(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${SIGN_BASE}/admin/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return false; // 401 invalid, 503 not configured
    const data = await res.json();
    if (data && typeof data.token === "string") {
      token = data.token;
      expiresAt = typeof data.expiresAt === "number" ? data.expiresAt : Date.now() + 4 * 60 * 60 * 1000;
      return true;
    }
    return false;
  } catch (e) {
    logger.error("[admin] auth request failed");
    return false;
  }
}

// Authorization header for admin API calls. Empty object when there's no valid token (caller's
// request then 401s and the dashboard treats the session as expired).
export function masterAuthHeaders(): Record<string, string> {
  const t = getMasterToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

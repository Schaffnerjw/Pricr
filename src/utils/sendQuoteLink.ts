// Client wrapper for POST /quote/send-link. The proxy handles Resend (email) + Twilio (SMS),
// auditing, and the actual message templates — this just hands off the contact + signing token
// and returns a strict success/failure flag so the UI can show a clean confirmation.
import { SIGN_BASE } from "../constants/brand";
import { logger } from "./logger";

export interface SendQuoteLinkResult {
  ok: boolean;
  sentEmail: boolean;
  sentSms: boolean;
  error?: string;
}

export async function sendQuoteLink(opts: {
  token: string;
  email?: string;
  phone?: string;
  signed?: boolean;
}): Promise<SendQuoteLinkResult> {
  const { token, email, phone, signed } = opts;
  if (!token || (!email && !phone)) {
    return { ok: false, sentEmail: false, sentSms: false, error: "Email or phone is required." };
  }
  try {
    const res = await fetch(`${SIGN_BASE}/quote/send-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email: email || undefined, phone: phone || undefined, signed: !!signed }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) return { ok: true, sentEmail: !!data.sentEmail, sentSms: !!data.sentSms };
    return { ok: false, sentEmail: false, sentSms: false, error: typeof data?.error === "string" ? data.error : "Couldn't send the quote." };
  } catch (e) {
    logger.error("[sendQuoteLink] failed", e instanceof Error ? e.message : String(e));
    return { ok: false, sentEmail: false, sentSms: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

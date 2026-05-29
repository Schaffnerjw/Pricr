const https = require('https');
const http = require('http');
const crypto = require('crypto');

// Optional server-side error monitoring. Enabled only when SENTRY_DSN is set; the require is guarded
// so the proxy runs fine without the package/env. Never throws into request handling.
let Sentry = null;
try { if (process.env.SENTRY_DSN) { Sentry = require('@sentry/node'); Sentry.init({ dsn: process.env.SENTRY_DSN }); } } catch (_) { Sentry = null; }
const captureProxyError = (e) => { try { if (Sentry) Sentry.captureException(e); } catch (_) { /* monitoring must never break the proxy */ } };

// ── Supabase REST helper (server-side, service role) ──────────────────────────
// The service role key lives ONLY here on the server — it is never sent to the browser.
// RLS does not apply to the service role, so this can read/write any quote by its token.
const SUPABASE_URL = process.env.SUPABASE_URL;                       // e.g. https://xxxx.supabase.co
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function supabaseRequest(method, pathAndQuery, bodyObj) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      reject(new Error('Supabase env not configured on the proxy'));
      return;
    }
    const host = SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/.*/, '');
    const payload = bodyObj ? Buffer.from(JSON.stringify(bodyObj)) : null;
    const req = https.request({
      hostname: host,
      path: pathAndQuery,
      method,
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(payload ? { 'Content-Length': payload.length } : {}),
      },
    }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_) { json = null; }
        resolve({ status: r.statusCode, json, text });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Fetch the quote (and its business) for a signing token. Returns null if genuinely not found.
// Throws on a Supabase auth/permission failure so callers report a server error (not "not found").
async function loadSigningContext(token) {
  const q = await supabaseRequest('GET', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}&select=*&limit=1`);
  if (q.status === 401 || q.status === 403) {
    console.error(`[sign] Supabase read denied (HTTP ${q.status}). The proxy must use the SERVICE ROLE key — check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Response: ${q.text}`);
    throw new Error('supabase-auth-failed');
  }
  const quote = Array.isArray(q.json) && q.json[0] ? q.json[0] : null;
  if (!quote) return null;
  const b = await supabaseRequest('GET', `/rest/v1/businesses?id=eq.${encodeURIComponent(quote.business_id)}&select=name,config,terms_and_conditions&limit=1`);
  const business = Array.isArray(b.json) && b.json[0] ? b.json[0] : null;
  return { quote, business };
}

// ── Signing audit trail helpers ────────────────────────────────────────────────
// Deterministic JSON: object keys sorted recursively so the same logical document always
// produces the same string (and therefore the same hash) regardless of key insertion order.
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
// SHA-256 of the quote_data JSON (sorted keys) — tamper-evidence for the signed document.
function documentHash(quoteData) {
  return crypto.createHash('sha256').update(stableStringify(quoteData == null ? {} : quoteData)).digest('hex');
}
// Best-effort client IP. x-forwarded-for may be a comma-separated list (proxies) — take the first.
function clientIp(req) {
  const xf = req && req.headers && req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req && req.socket && req.socket.remoteAddress) || '';
}
function userAgent(req) { return (req && req.headers && req.headers['user-agent']) || ''; }

// Append an event to a quote's audit_log. Fire-and-forget: never blocks the request, logs on error.
function appendAuditEvent(token, existingLog, event) {
  const log = Array.isArray(existingLog) ? existingLog.slice() : [];
  log.push(event);
  supabaseRequest('PATCH', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}`, { audit_log: log })
    .catch((e) => console.warn('[sign] audit append failed:', e && e.message));
  return log;
}

// ── Resend transactional email (fire-and-forget) ───────────────────────────────
const FROM_EMAIL = process.env.FROM_EMAIL || 'quotes@pricr.veraa.io';
const APP_URL = 'https://app.pricr.veraa.io';
// Public base for the signing page self-references (OG image, certificate links, email links).
// The default is the Railway URL because THAT IS the host that actually serves the /sign/:token
// routes — proxy.js IS the signing-page server. Setting SIGN_BASE_URL to a vanity domain only
// works if that domain has DNS pointing at Railway AND Railway is configured to accept it; if
// neither is true, customer-facing emails ship a dead link and every signing flow breaks.
// (Real-world incident: SIGN_BASE_URL was set to https://sign.pricr.veraa.io — that subdomain
// has no DNS, every signed-quote email link returned "server can't be found.")
const SIGNING_BASE = process.env.SIGN_BASE_URL || 'https://pricr-production.up.railway.app';
// Sends an email via Resend. Never throws into the caller — errors are logged only, so a mail
// failure can never block or fail the signing response. No-ops cleanly if RESEND_API_KEY is unset.
function sendEmail({ to, subject, html, attachments, from }) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key || !to) return;
    let resendClient = null;
    try { const { Resend } = require('resend'); resendClient = new Resend(key); } catch (_) { resendClient = null; }
    const payload = { from: from || FROM_EMAIL, to, subject, html };
    if (attachments && attachments.length) payload.attachments = attachments;
    if (resendClient) {
      resendClient.emails.send(payload).catch((e) => console.warn('[sign] email send failed:', e && e.message));
      return;
    }
    // Fallback: call the Resend REST API directly (keeps the proxy working even without the SDK).
    const body = Buffer.from(JSON.stringify(payload));
    const r = https.request({
      hostname: 'api.resend.com', path: '/emails', method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': body.length },
    }, (resp) => { resp.on('data', () => {}); resp.on('end', () => {}); });
    r.on('error', (e) => console.warn('[sign] email send failed:', e && e.message));
    r.write(body); r.end();
  } catch (e) {
    console.warn('[sign] email send error:', e && e.message);
  }
}

// ── Expo push notifications (fire-and-forget) ───────────────────────────────────
// Sends via the Expo push service. No-ops on a missing/invalid token. Never throws into the caller.
function sendPushNotification(pushToken, title, body) {
  try {
    if (!pushToken || typeof pushToken !== 'string' || !pushToken.startsWith('ExponentPushToken')) return;
    const payload = Buffer.from(JSON.stringify({ to: pushToken, sound: 'default', title, body, data: {} }));
    const r = https.request({
      hostname: 'exp.host', path: '/--/api/v2/push/send', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Content-Length': payload.length },
    }, (resp) => { resp.on('data', () => {}); resp.on('end', () => {}); });
    r.on('error', (e) => console.warn('[push] send failed:', e && e.message));
    r.write(payload); r.end();
  } catch (e) { console.warn('[push] error:', e && e.message); }
}
// Push token for a business (stored in config jsonb).
const businessPushToken = (business) => (business && business.config && business.config.pushToken) || null;

// ── Twilio SMS identity verification (fire-and-forget send) ─────────────────────
const twilioConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
// Whether to enforce SMS verification for this business: the admin toggle (default ON) AND Twilio
// being configured. If Twilio isn't set up we skip verification rather than brick all signing.
function smsRequiredFor(business) {
  const cfg = (business && business.config) || {};
  const wants = cfg.requireSmsVerification !== false; // default ON
  return wants && twilioConfigured();
}
// Sends an SMS via the Twilio REST API. Never throws into the caller; logs on error. No-ops if unset.
function sendSms(to, body) {
  try {
    if (!twilioConfigured() || !to) return;
    const sid = process.env.TWILIO_ACCOUNT_SID, auth = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_PHONE_NUMBER;
    const form = `From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}&Body=${encodeURIComponent(body)}`;
    const payload = Buffer.from(form);
    const r = https.request({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(sid + ':' + auth).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': payload.length,
      },
    }, (resp) => { resp.on('data', () => {}); resp.on('end', () => {}); });
    r.on('error', (e) => console.warn('[sign] sms send failed:', e && e.message));
    r.write(payload); r.end();
  } catch (e) { console.warn('[sign] sms error:', e && e.message); }
}
// A 6-digit numeric verification code (cryptographically random).
const genCode = () => String(crypto.randomInt(100000, 1000000));
// Hash a code/session-token bound to the quote token so it can never be reused on another quote.
const hashSecret = (token, secret) => crypto.createHash('sha256').update(`${token}:${secret}`).digest('hex');
const genSessionToken = () => crypto.randomUUID();
const phoneLast4 = (phone) => (String(phone || '').replace(/\D/g, '').slice(-4) || '????');

// ── HTML for the remote signing page ──────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
// Resolve accepted payment methods: prefer the resolved labels on the quote presentation, else
// derive from the business config ({ methods, other }) — mirrors resolvePaymentMethods in the app.
function resolvePaymentMethods(pres, business) {
  if (Array.isArray(pres.paymentMethods) && pres.paymentMethods.length) return pres.paymentMethods;
  const pm = business && business.config && business.config.paymentMethods;
  if (!pm || !Array.isArray(pm.methods)) return [];
  const list = pm.methods.filter((m) => m && m !== 'Other');
  if (pm.methods.indexOf('Other') !== -1 && pm.other && pm.other.trim()) list.push(pm.other.trim());
  return list;
}
// Safe to embed inside a <script> tag (prevents </script> breakouts).
const jsonForScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

function pageShell(title, bodyHtml, extraHead = '') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<title>${esc(title)}</title>${extraHead}
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#0A0E1A;color:#0A0E1A;line-height:1.5;}
  .wrap{max-width:560px;margin:0 auto;padding:16px;}
  .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35);}
  .hd{background:#0A0E1A;color:#fff;padding:28px 22px;border-bottom:4px solid var(--accent,#2979FF);text-align:center;}
  .hd img{max-height:42px;max-width:200px;display:block;margin-bottom:8px;}
  .hd .biz{font-size:24px;font-weight:800;letter-spacing:-.4px;}
  .business-logo{width:100px;height:100px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff;border:3px solid rgba(0,0,0,0.08);margin:0 auto 16px;}
  .business-logo img{width:100%;height:100%;object-fit:contain;padding:8px;}
  .business-logo-fallback{width:100px;height:100px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:36px;font-weight:800;color:#fff;font-family:sans-serif;}
  .tagline{font-size:13px;color:#94A3B8;margin-top:4px;}
  .rating{font-size:13px;color:#FACC15;margin-top:8px;font-weight:600;}
  .rating span{color:#94A3B8;font-weight:400;}
  .pmsg{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px 18px;margin-top:18px;font-size:14px;color:#1E2640;line-height:1.6;white-space:pre-line;}
  .trustbar{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:18px;padding:14px;background:#F8FAFC;border-radius:12px;}
  .trustbar .ti{font-size:12px;font-weight:600;color:#1E2640;}
  .trustbar .ti b{color:var(--accent,#2979FF);}
  .social{text-align:center;font-size:13px;color:#475569;margin-top:14px;font-weight:600;}
  .notes-sec{margin-top:22px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:14px 16px;}
  .notes-sec .nl{font-size:13px;font-weight:700;color:#92400E;margin-bottom:6px;}
  .notes-sec .nb{font-size:13.5px;color:#1E2640;line-height:1.6;white-space:pre-line;}
  .bd{padding:22px;}
  .ttl{font-size:11px;letter-spacing:1.5px;font-weight:700;color:var(--accent,#2979FF);text-transform:uppercase;}
  .cust{font-size:20px;font-weight:800;margin:4px 0 14px;}
  .row{display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid #E2E8F0;font-size:14px;}
  .row .amt{font-weight:600;white-space:nowrap;}
  .total{display:flex;justify-content:space-between;align-items:center;padding-top:16px;}
  .total .l{font-size:17px;font-weight:800;}
  .total .a{font-size:26px;font-weight:800;color:var(--accent,#2979FF);}
  .dep{display:flex;justify-content:space-between;align-items:center;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-top:16px;}
  .dep .dl{font-weight:700;font-size:14px;} .dep .ds{color:#475569;font-size:12px;} .dep .da{font-size:20px;font-weight:800;color:var(--accent,#2979FF);}
  .sec{margin-top:22px;} .lbl{font-size:13px;font-weight:700;color:#1E2640;margin-bottom:8px;}
  .pay{font-size:14px;color:#1E2640;}
  .terms{max-height:170px;overflow-y:auto;border:1px solid #E2E8F0;border-radius:10px;padding:12px;font-size:12.5px;color:#1E2640;white-space:pre-wrap;}
  .chk{display:flex;align-items:flex-start;gap:10px;margin-top:12px;cursor:pointer;font-size:14px;}
  .chk input{width:22px;height:22px;margin-top:1px;accent-color:var(--accent,#2979FF);}
  .sigbox{border:1px solid #CBD5E1;border-radius:10px;background:#fff;touch-action:none;}
  canvas{width:100%;height:200px;display:block;border-radius:10px;}
  .sigtools{display:flex;justify-content:flex-end;align-items:center;margin-top:8px;}
  .clear{background:none;border:none;color:#475569;font-size:14px;text-decoration:underline;cursor:pointer;}
  input.name{width:100%;padding:13px 14px;border:1px solid #CBD5E1;border-radius:10px;font-size:16px;margin-top:6px;}
  .btn{width:100%;margin-top:18px;padding:16px;border:none;border-radius:12px;background:var(--accent,#2979FF);color:#fff;font-size:16px;font-weight:700;cursor:pointer;}
  .btn:disabled{opacity:.45;cursor:not-allowed;}
  .muted{color:#64748B;font-size:12px;margin-top:12px;text-align:center;}
  .state{padding:48px 28px;text-align:center;}
  .state h1{font-size:22px;margin-bottom:10px;} .state p{color:#475569;margin-bottom:6px;}
  .check{width:64px;height:64px;border-radius:50%;background:var(--accent,#2979FF);color:#fff;font-size:34px;line-height:64px;margin:0 auto 18px;}
  .err{color:#EF4444;font-size:13px;margin-top:10px;text-align:center;min-height:18px;}
  /* enterprise signing flow */
  .step-ind{font-size:11px;letter-spacing:1.2px;font-weight:700;color:var(--accent,#2979FF);text-transform:uppercase;}
  .step-h{font-size:20px;font-weight:800;margin:6px 0 6px;}
  .step-p{font-size:14px;color:#475569;margin-bottom:16px;}
  .field-lbl{font-size:13px;font-weight:700;color:#1E2640;margin-bottom:6px;}
  input.fld{width:100%;padding:14px;border:1px solid #CBD5E1;border-radius:10px;font-size:16px;}
  input.code{letter-spacing:8px;text-align:center;font-size:26px;font-weight:800;}
  .trust-note{font-size:12px;color:#64748B;margin-top:10px;}
  .resend{background:none;border:none;color:var(--accent,#2979FF);font-size:14px;font-weight:600;text-decoration:underline;cursor:pointer;padding:0;margin-top:12px;}
  .resend:disabled{color:#94A3B8;text-decoration:none;cursor:default;}
  .countdown{font-size:12px;color:#64748B;margin-top:8px;}
  .consent{display:flex;align-items:flex-start;gap:10px;margin-top:16px;cursor:pointer;font-size:12.5px;color:#1E2640;line-height:1.5;}
  .consent input{width:22px;height:22px;margin-top:1px;flex:0 0 auto;accent-color:var(--accent,#2979FF);}
  .badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;}
  .badge{font-size:11px;font-weight:600;color:#1E2640;background:#F1F5F9;border:1px solid #E2E8F0;border-radius:20px;padding:6px 11px;}
  .docid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#475569;word-break:break-all;}
  .cert-link{display:inline-block;margin-top:14px;color:var(--accent,#2979FF);font-weight:600;font-size:14px;}
</style></head><body><div class="wrap"><div class="card">${bodyHtml}</div>
<p class="muted">Powered by Pricr</p></div></body></html>`;
}

function stateCard(accent, emoji, title, body) {
  return pageShell(title, `<div class="bd" style="--accent:${esc(accent)}"><div class="state"><div class="check">${emoji}</div><h1>${esc(title)}</h1><p>${esc(body)}</p></div></div>`);
}

// The E-SIGN / UETA consent the signer must affirm before signing (used on the remote page + app).
const CONSENT_TEXT = 'I have read and agree to the terms above. By signing below I consent to use electronic records and signatures for this transaction. I understand this electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act (UETA).';

// Social-preview SVG (1200x630) for signing links. Always returns valid XML — & escaped, missing
// data falls back to generic Pricr branding.
function ogSvg(bizName, total, accent) {
  const xml = (sv) => String(sv == null ? '' : sv).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ac = /^#[0-9a-fA-F]{3,8}$/.test(String(accent || '')) ? accent : '#2979FF';
  const hasBiz = !!(bizName && String(bizName).trim());
  const name = hasBiz ? xml(String(bizName).trim().slice(0, 24)) : 'Your Quote is Ready';
  const totalText = (hasBiz && total != null) ? '$' + (Math.round(Number(total) || 0)).toLocaleString('en-US') : '';
  const sub = hasBiz ? 'Quote Ready to Sign' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0A0E1A"/>
  <rect x="0" y="0" width="8" height="630" fill="${xml(ac)}"/>
  <text x="48" y="72" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="#FFFFFF">Pricr.</text>
  <text x="48" y="200" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="bold" fill="#FFFFFF">${name}</text>
  ${sub ? `<text x="48" y="270" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#8892A4">${xml(sub)}</text>` : ''}
  ${totalText ? `<text x="48" y="420" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="bold" fill="#00E5FF">${xml(totalText)}</text>` : ''}
  <text x="48" y="510" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#8892A4">Tap to review and sign &#8594;</text>
  <text x="1100" y="600" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="rgba(255,255,255,0.2)" text-anchor="end">Pricr</text>
</svg>`;
}

async function handleOgImage(res, token) {
  const headers = { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' };
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) { res.writeHead(200, headers); res.end(ogSvg(null, null, '#2979FF')); return; }
    const pres = (ctx.quote.quote_data && ctx.quote.quote_data.presentation) || {};
    const accent = pres.brandColor || '#2979FF';
    const bizName = pres.businessName || (ctx.business && ctx.business.name) || '';
    const total = pres.total != null ? pres.total : (ctx.quote.total != null ? ctx.quote.total : null);
    res.writeHead(200, headers); res.end(ogSvg(bizName, total, accent));
  } catch (_) {
    res.writeHead(200, headers); res.end(ogSvg(null, null, '#2979FF'));
  }
}

function signingPage(token, quote, business, signedCount = 0) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const accent = pres.brandColor || '#2979FF';
  const bizName = pres.businessName || (business && business.name) || 'Your Contractor';
  const cfg = (business && business.config) || {};
  const brandCfg = cfg.brand || {};
  const logo = pres.logoUri || brandCfg.logoUri || '';
  const tagline = (brandCfg.tagline || '').toString().trim();
  // (Intro is now delivered in the SMS/email body — see ClosingCard.onShare; no longer rendered here.)
  const notes = (pres.notes || '').toString().trim();
  const terms = (business && business.terms_and_conditions) || '';
  const googleReviewUrl = (cfg.googleReviewUrl || '').toString().trim();
  const lineItems = Array.isArray(pres.lineItems) ? pres.lineItems : [];
  const total = pres.total != null ? pres.total : (quote.total || 0);
  const requireSms = smsRequiredFor(business);

  const rows = lineItems.map((li) => `<div class="row"><span>${esc(li.label)}</span><span class="amt">${money(li.amount)}</span></div>`).join('')
    + (pres.taxRate > 0 ? `<div class="row"><span>Tax (${esc(pres.taxRate)}%)</span><span class="amt">${money(pres.tax)}</span></div>` : '');
  const dep = (pres.depositPct > 0 && total > 0)
    ? `<div class="dep"><div><div class="dl">${esc(pres.depositPct)}% Deposit Due Today</div><div class="ds">Balance of ${money(pres.balanceDue)} due upon completion</div></div><div class="da">${money(pres.deposit)}</div></div>`
    : '';
  const payMethods = resolvePaymentMethods(pres, business);
  const paySec = payMethods.length
    ? `<div class="sec"><div class="lbl">Payment Methods Accepted</div><div class="pay">${esc(payMethods.join(', '))}</div></div>`
    : '';
  // Logo: contained inside a circular white frame (never cropped); falls back to the business initial.
  const initial = esc((bizName || '?').trim().charAt(0).toUpperCase() || '?');
  const logoBlock = logo
    ? `<div class="business-logo"><img src="${esc(logo)}" alt="${esc(bizName)}"/></div>`
    : `<div class="business-logo-fallback" style="background:${esc(accent)};">${initial}</div>`;
  // Star row is tappable ONLY when a Google-reviews URL is set; otherwise it renders unchanged.
  // Mirrors src/utils/signingRenderHelpers.ts/buildRatingHTML — the tests there cover both cases.
  const ratingInner = '<div class="rating">&#9733;&#9733;&#9733;&#9733;&#9733; <span>Trusted contractor</span></div>';
  const ratingBlock = googleReviewUrl
    ? `<a class="rating-link" href="${esc(googleReviewUrl)}" target="_blank" rel="noopener noreferrer">${ratingInner}</a>`
    : ratingInner;
  const header = logoBlock
    + `<div class="biz">${esc(bizName)}</div>`
    + (tagline ? `<div class="tagline">${esc(tagline)}</div>` : '')
    + ratingBlock;
  // Note: the contractor's personal intro now travels in the SMS/email DELIVERY body (see
  // ClosingCard.tsx onShare), not on the signing page. The page opens clean at the quote.
  // Notes from the contractor (only if present).
  const notesSec = notes ? `<div class="notes-sec"><div class="nl">Notes from ${esc(bizName)}</div><div class="nb">${esc(notes)}</div></div>` : '';
  // Trust signals bar + optional social proof (>= 5 completed projects).
  const trustBar = `<div class="trustbar"><span class="ti"><b>&#10003;</b> Licensed &amp; Insured</span><span class="ti"><b>&#10003;</b> E-SIGN Compliant</span><span class="ti"><b>&#10003;</b> Secure &amp; Encrypted</span></div>`;
  const socialProof = signedCount >= 5 ? `<div class="social">${esc(bizName)} has completed ${signedCount} projects</div>` : '';
  const termsSec = terms.trim()
    ? `<div class="sec"><div class="lbl">Terms &amp; Conditions</div><div class="terms">${esc(terms)}</div></div>`
    : '';
  const totalSteps = requireSms ? 3 : 1;
  const reviewStepNo = requireSms ? 3 : 1;

  // Step 1 + 2 (identity verification) — only when SMS verification is enforced.
  const verifySteps = requireSms ? `
  <div class="bd" id="step1" style="--accent:${esc(accent)}">
    <div class="step-ind">Step 1 of ${totalSteps} — Verify Your Identity</div>
    <div class="step-h">Verify your identity</div>
    <div class="step-p">We verify your identity to ensure this signature is legally binding.</div>
    <div class="field-lbl">Mobile number</div>
    <input class="fld" id="phone" type="tel" inputmode="tel" placeholder="(555) 123-4567" autocomplete="tel"/>
    <button class="btn" id="sendCode">Send Verification Code</button>
    <div class="trust-note">Your phone number is used for verification only and is never shared.</div>
    <div class="err" id="err1"></div>
  </div>
  <div class="bd" id="step2" style="--accent:${esc(accent)};display:none;">
    <div class="step-ind">Step 2 of ${totalSteps} — Enter Your Code</div>
    <div class="step-h">Enter your code</div>
    <div class="step-p">We sent a 6-digit code to <span id="phoneEcho"></span>. Enter it below.</div>
    <input class="fld code" id="code" type="text" inputmode="numeric" maxlength="6" placeholder="------"/>
    <button class="btn" id="verifyCode">Verify</button>
    <div class="countdown" id="countdown"></div>
    <button class="resend" id="resend" disabled>Resend code</button>
    <div class="err" id="err2"></div>
  </div>` : '';

  // Step 3 — review and sign (always present; shown first when SMS isn't required).
  const reviewStep = `
  <div class="bd" id="step3" style="--accent:${esc(accent)};${requireSms ? 'display:none;' : ''}">
    <div class="step-ind">Step ${reviewStepNo} of ${totalSteps} — Review and Sign</div>
    <div class="ttl" style="margin-top:18px;">Fixed price estimate</div>
    <div class="cust">${esc(pres.customerName || quote.customer_name || 'Your Quote')}</div>
    ${rows}
    <div class="total"><span class="l">Total</span><span class="a">${money(total)}</span></div>
    ${dep}
    ${notesSec}
    ${trustBar}
    ${socialProof}
    ${paySec}
    ${termsSec}
    <div class="sec">
      <div class="lbl">Email address <span style="font-weight:400;color:#64748B;">(to receive your signed copy)</span></div>
      <input class="fld" id="cemail" type="email" placeholder="you@example.com" autocomplete="email"/>
    </div>
    <label class="consent"><input type="checkbox" id="consent"/><span>${esc(CONSENT_TEXT)}</span></label>
    <div class="sec">
      <div class="lbl">Your Signature</div>
      <div class="sigbox"><canvas id="pad"></canvas></div>
      <div class="sigtools"><button type="button" class="clear" id="clear">Clear</button></div>
    </div>
    <div class="sec">
      <div class="lbl">Your Name</div>
      <input class="fld" id="cname" type="text" placeholder="Type your full name" value="${esc(pres.customerName || quote.customer_name || '')}"/>
    </div>
    <button class="btn" id="submit" disabled>Sign &amp; Accept</button>
    <div class="badges">
      <span class="badge">&#128274; 256-bit encrypted</span>
      <span class="badge">&#10003; E-SIGN Act compliant</span>
      <span class="badge">&#128203; Audit logged</span>
      ${requireSms ? '<span class="badge">&#128241; SMS verified</span>' : ''}
    </div>
    <div class="err" id="err"></div>
  </div>`;

  const data = jsonForScript({ token, requireSms, hasTerms: !!terms.trim(), bizName, accent });

  const body = `<div class="hd" style="--accent:${esc(accent)}">${header}</div>
${verifySteps}
${reviewStep}
<script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
<script>
(function(){
  var D = ${data};
  var sessionToken = null;
  var by = function(id){ return document.getElementById(id); };

  // ── Step 3: signature pad + submit ──
  var canvas = by('pad');
  var pad = new SignaturePad(canvas, { penColor:'#0A0E1A', backgroundColor:'#FFFFFF' });
  function resize(){ var r = Math.max(window.devicePixelRatio||1,1); var w=canvas.offsetWidth, h=canvas.offsetHeight; if(!w) return; canvas.width=w*r; canvas.height=h*r; canvas.getContext('2d').scale(r,r); pad.clear(); }
  window.addEventListener('resize', resize);
  var consent = by('consent'), submit = by('submit'), cname = by('cname'), cemail = by('cemail'), err = by('err');
  function refresh(){ submit.disabled = !(consent.checked && !pad.isEmpty() && cname.value.trim().length > 0); }
  pad.addEventListener('endStroke', refresh);
  cname.addEventListener('input', refresh);
  consent.addEventListener('change', refresh);
  by('clear').addEventListener('click', function(){ pad.clear(); refresh(); });

  function showStep(n){
    if (by('step1')) by('step1').style.display = (n===1?'block':'none');
    if (by('step2')) by('step2').style.display = (n===2?'block':'none');
    by('step3').style.display = (n===3?'block':'none');
    if (n===3) setTimeout(resize, 30);
    window.scrollTo(0,0);
  }

  submit.addEventListener('click', function(){
    if (submit.disabled) return;
    submit.disabled = true; submit.textContent = 'Submitting…'; err.textContent='';
    fetch('/sign/' + encodeURIComponent(D.token) + '/submit', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ signature_data: pad.toDataURL('image/png'), customer_name: cname.value.trim(), signer_email: (cemail && cemail.value.trim()) || '', consent: true, sessionToken: sessionToken })
    }).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
      .then(function(res){
        if (res.ok && res.j && res.j.ok) {
          var emailLine = (cemail && cemail.value.trim()) ? (cemail.value.trim()) : '';
          var contact = [emailLine, (res.j.phone_last4 ? ('your phone ending ' + res.j.phone_last4) : '')].filter(Boolean).join(' and ');
          document.querySelector('.card').innerHTML =
            '<div class="bd" style="--accent:${esc(accent)}"><div class="state"><div class="check">&#10003;</div>' +
            '<h1>Quote Accepted and Signed</h1>' +
            '<p>Your signature has been recorded and is legally binding.</p>' +
            (contact ? '<p>A confirmation has been sent to ' + contact + '.</p>' : '') +
            '<p class="docid">Document ID: ' + D.token + '</p>' +
            '<p>Signed: ' + new Date().toLocaleString() + '</p>' +
            '<a class="cert-link" href="/sign/' + encodeURIComponent(D.token) + '/certificate">View your certificate of completion &rarr;</a>' +
            '</div></div>';
        } else {
          err.textContent = (res.j && res.j.error) || 'Something went wrong. Please try again.';
          submit.disabled = false; submit.textContent = 'Sign & Accept';
        }
      }).catch(function(){ err.textContent='Network error. Please try again.'; submit.disabled=false; submit.textContent='Sign & Accept'; });
  });

  // ── Steps 1 & 2: SMS verification (only wired when required) ──
  if (D.requireSms) {
    var phone = by('phone'), sendCode = by('sendCode'), err1 = by('err1');
    var code = by('code'), verifyCode = by('verifyCode'), err2 = by('err2');
    var resend = by('resend'), countdown = by('countdown'), phoneEcho = by('phoneEcho');
    var timer = null;

    function startCountdown(){
      var expiry = Date.now() + 10*60*1000;       // code valid 10 minutes
      var resendAt = Date.now() + 30*1000;          // resend allowed after 30s
      resend.disabled = true;
      if (timer) clearInterval(timer);
      timer = setInterval(function(){
        var leftMs = expiry - Date.now();
        if (leftMs <= 0){ clearInterval(timer); countdown.textContent = 'Code expired. Tap resend for a new one.'; resend.disabled = false; return; }
        var m = Math.floor(leftMs/60000), s = Math.floor((leftMs%60000)/1000);
        countdown.textContent = 'Code expires in ' + m + ':' + (s<10?'0':'') + s;
        if (Date.now() >= resendAt) resend.disabled = false;
      }, 1000);
    }

    function requestCode(){
      var p = (phone.value || '').trim();
      if (p.length < 7){ err1.textContent = 'Enter a valid mobile number.'; return; }
      sendCode.disabled = true; sendCode.textContent = 'Sending…'; err1.textContent='';
      fetch('/sign/' + encodeURIComponent(D.token) + '/request-code', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phone: p })
      }).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
        .then(function(res){
          sendCode.disabled = false; sendCode.textContent = 'Send Verification Code';
          if (res.ok && res.j && res.j.success){ phoneEcho.textContent = p; showStep(2); startCountdown(); }
          else { err1.textContent = (res.j && res.j.error) || 'Could not send the code. Please try again.'; }
        }).catch(function(){ sendCode.disabled=false; sendCode.textContent='Send Verification Code'; err1.textContent='Network error. Please try again.'; });
    }

    sendCode.addEventListener('click', requestCode);
    resend.addEventListener('click', function(){ if (!resend.disabled) requestCode(); });
    verifyCode.addEventListener('click', function(){
      var c = (code.value || '').trim();
      if (c.length !== 6){ err2.textContent = 'Enter the 6-digit code.'; return; }
      verifyCode.disabled = true; verifyCode.textContent = 'Verifying…'; err2.textContent='';
      fetch('/sign/' + encodeURIComponent(D.token) + '/verify-code', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ phone: phone.value.trim(), code: c })
      }).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
        .then(function(res){
          verifyCode.disabled = false; verifyCode.textContent = 'Verify';
          if (res.ok && res.j && res.j.verified){ sessionToken = res.j.sessionToken; if (timer) clearInterval(timer); showStep(3); }
          else { err2.textContent = (res.j && res.j.error) || 'That code was not correct. Please try again.'; }
        }).catch(function(){ verifyCode.disabled=false; verifyCode.textContent='Verify'; err2.textContent='Network error. Please try again.'; });
    });
  } else {
    setTimeout(resize, 30);
  }
})();
</script>`;
  // Open Graph / Twitter preview so the shared signing link unfurls with a branded card + total.
  const ogImg = `${SIGNING_BASE}/og-image/${encodeURIComponent(token)}`;
  const ogDesc = `${bizName} sent you a quote for ${money(total)}. Tap to review and sign.`;
  const ogTags = `
<meta property="og:title" content="Sign your quote — ${esc(bizName)}"/>
<meta property="og:description" content="${esc(ogDesc)}"/>
<meta property="og:image" content="${esc(ogImg)}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${esc(ogImg)}"/>`;
  return pageShell('Sign your quote — ' + bizName, body, ogTags);
}

// ── Audit-trail derived values + emails + signed-document HTML ──────────────────
function fmtDateTime(ts) {
  try {
    return new Date(ts).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  } catch (_) { return new Date(ts).toISOString(); }
}

// Resolve the contractor's notification email from the existing business config (no new onboarding
// field — see summary note). Checks notificationEmail, then a top-level email, then brand.email.
function contractorEmail(business) {
  const c = (business && business.config) || {};
  return (c.notificationEmail || c.email || (c.brand && c.brand.email) || '').toString().trim();
}

// Shared line-item rows for the email summary (HTML table rows).
function emailSummaryRows(pres) {
  const items = Array.isArray(pres.lineItems) ? pres.lineItems : [];
  let rows = items.map((li) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#1E2640;">${esc(li.label)}</td>` +
    `<td style="padding:8px 0;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:600;white-space:nowrap;">${money(li.amount)}</td></tr>`
  ).join('');
  if (pres.taxRate > 0) {
    rows += `<tr><td style="padding:8px 0;border-bottom:1px solid #E2E8F0;color:#64748B;">Tax (${esc(pres.taxRate)}%)</td>` +
      `<td style="padding:8px 0;border-bottom:1px solid #E2E8F0;text-align:right;color:#64748B;">${money(pres.tax)}</td></tr>`;
  }
  return rows;
}

// Clean confirmation email for the customer (sent only if they gave an email).
function customerEmailHtml(quote, business, accent, opts) {
  opts = opts || {};
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const bizName = pres.businessName || (business && business.name) || 'Your contractor';
  const logo = pres.logoUri || (business && business.config && business.config.brand && business.config.brand.logoUri) || '';
  const name = pres.customerName || quote.customer_name || 'there';
  const total = pres.total != null ? pres.total : (quote.total || 0);
  const contactBits = [pres.phone, pres.email, pres.address].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
  const depLine = (pres.depositPct > 0 && total > 0)
    ? `<tr><td style="padding:8px 0;color:#1E2640;">${esc(pres.depositPct)}% deposit due today</td><td style="padding:8px 0;text-align:right;font-weight:700;color:${esc(accent)};">${money(pres.deposit)}</td></tr>`
    : '';
  const signedAt = opts.signedAt || (quote.signed_at ? new Date(quote.signed_at).getTime() : Date.now());
  const certBtn = opts.certificateUrl
    ? `<p style="margin:18px 0 0;"><a href="${esc(opts.certificateUrl)}" style="color:${esc(accent)};font-weight:600;font-size:14px;">View your certificate of completion &rarr;</a></p>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A0E1A;">
    <div style="background:#0A0E1A;color:#fff;padding:24px 22px;border-bottom:4px solid ${esc(accent)};border-radius:12px 12px 0 0;">
      ${logo ? `<img src="${esc(logo)}" alt="${esc(bizName)}" style="max-height:40px;max-width:200px;display:block;margin-bottom:8px;"/>` : ''}
      <div style="font-size:22px;font-weight:800;">${esc(bizName)}</div>
    </div>
    <div style="padding:24px 22px;background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
      <p style="font-size:16px;margin:0 0 12px;">Thank you for signing, ${esc(name)}.</p>
      <p style="font-size:14px;color:#10B981;font-weight:700;margin:0 0 16px;">&#10003; Your signature is legally binding under the E-SIGN Act.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${emailSummaryRows(pres)}
        <tr><td style="padding:14px 0 0;font-size:16px;font-weight:800;">Total</td><td style="padding:14px 0 0;text-align:right;font-size:20px;font-weight:800;color:${esc(accent)};">${money(total)}</td></tr>
        ${depLine}
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#475569;margin-top:14px;border-top:1px solid #E2E8F0;">
        <tr><td style="padding:8px 0;">Signed</td><td style="padding:8px 0;text-align:right;color:#0A0E1A;">${esc(fmtDateTime(signedAt))}</td></tr>
        ${opts.token ? `<tr><td style="padding:4px 0;">Document ID</td><td style="padding:4px 0;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#0A0E1A;">${esc(opts.token)}</td></tr>` : ''}
      </table>
      <p style="font-size:14px;color:#475569;margin:16px 0 0;">A copy of your signed agreement is attached.</p>
      ${certBtn}
      ${contactBits ? `<p style="font-size:12px;color:#64748B;margin:18px 0 0;border-top:1px solid #E2E8F0;padding-top:14px;">${contactBits}</p>` : ''}
      <p style="font-size:11px;color:#94A3B8;margin:16px 0 0;">This email serves as your confirmation of electronic signature. Retain for your records.</p>
    </div>
    <p style="text-align:center;color:#94A3B8;font-size:12px;margin:14px 0;">Powered by Pricr</p>
  </div>`;
}

// Notification email for the contractor with signing details + a Certificate link.
function contractorEmailHtml(quote, business, accent, audit, certificateUrl) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const name = pres.customerName || quote.customer_name || 'A customer';
  const total = pres.total != null ? pres.total : (quote.total || 0);
  const deposit = (pres.depositPct > 0 && total > 0) ? pres.deposit : 0;
  const verifiedRow = audit.phoneLast4
    ? `<tr><td style="padding:5px 0;">Verified via</td><td style="padding:5px 0;text-align:right;color:#0A0E1A;">SMS (•••• ${esc(audit.phoneLast4)})</td></tr>` : '';
  const docIdRow = audit.token
    ? `<tr><td style="padding:5px 0;">Document ID</td><td style="padding:5px 0;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#0A0E1A;">${esc(audit.token)}</td></tr>` : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A0E1A;">
    <div style="background:#0A0E1A;color:#fff;padding:24px 22px;border-bottom:4px solid ${esc(accent)};border-radius:12px 12px 0 0;">
      <div style="font-size:13px;letter-spacing:1.5px;font-weight:700;color:${esc(accent)};text-transform:uppercase;">&#10003; Quote signed</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px;">${esc(name)} — ${money(total)}</div>
    </div>
    <div style="padding:24px 22px;background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
      <p style="font-size:16px;margin:0 0 16px;"><strong>${esc(name)}</strong> just signed their quote.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#475569;margin-bottom:8px;">
        <tr><td style="padding:5px 0;">Amount</td><td style="padding:5px 0;text-align:right;color:#0A0E1A;font-weight:700;">${money(total)}${deposit ? ' · Deposit ' + money(deposit) : ''}</td></tr>
        <tr><td style="padding:5px 0;">Signed</td><td style="padding:5px 0;text-align:right;color:#0A0E1A;">${esc(fmtDateTime(audit.signedAt))}</td></tr>
        ${verifiedRow}
        <tr><td style="padding:5px 0;">IP address</td><td style="padding:5px 0;text-align:right;color:#0A0E1A;">${esc(audit.ip || 'unknown')}</td></tr>
        ${docIdRow}
      </table>
      <p style="margin:20px 0 8px;"><a href="${esc(APP_URL)}" style="display:inline-block;background:${esc(accent)};color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">Log in to Pricr</a></p>
      <p style="font-size:13px;margin:10px 0 0;"><a href="${esc(certificateUrl)}" style="color:${esc(accent)};font-weight:600;">View certificate of completion</a></p>
    </div>
    <p style="text-align:center;color:#94A3B8;font-size:12px;margin:14px 0;">Powered by Pricr</p>
  </div>`;
}

// A self-contained signed-agreement document (HTML) attached to the customer's confirmation email.
// HTML rather than PDF deliberately — keeps the proxy lean with no headless-browser dependency.
function signedAgreementHtml(quote, business, accent) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const bizName = pres.businessName || (business && business.name) || 'Your contractor';
  const logo = pres.logoUri || (business && business.config && business.config.brand && business.config.brand.logoUri) || '';
  const name = pres.customerName || quote.customer_name || 'Customer';
  const total = pres.total != null ? pres.total : (quote.total || 0);
  const signedAt = quote.signed_at ? new Date(quote.signed_at).getTime() : Date.now();
  const sig = quote.signature_data || (quote.quote_data && quote.quote_data.signatureData) || '';
  const rows = (Array.isArray(pres.lineItems) ? pres.lineItems : []).map((li) =>
    `<tr><td>${esc(li.label)}</td><td class="amt">${money(li.amount)}</td></tr>`).join('')
    + (pres.taxRate > 0 ? `<tr><td class="muted">Tax (${esc(pres.taxRate)}%)</td><td class="amt muted">${money(pres.tax)}</td></tr>` : '');
  const dep = (pres.depositPct > 0 && total > 0)
    ? `<div class="dep"><div><b>${esc(pres.depositPct)}% Deposit Due Today</b><div class="ds">Balance of ${money(pres.balanceDue)} due upon completion</div></div><div class="da">${money(pres.deposit)}</div></div>` : '';
  const payMethods = resolvePaymentMethods(pres, business);
  const paySec = payMethods.length ? `<div class="sec"><div class="lbl">Payment Methods Accepted</div><div>${esc(payMethods.join(', '))}</div></div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Signed Agreement — ${esc(bizName)}</title><style>
    *{box-sizing:border-box;margin:0;padding:0;} body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0A0E1A;padding:0;}
    .hd{background:#0A0E1A;color:#fff;padding:28px 32px;border-bottom:4px solid ${esc(accent)};}
    .hd img{max-height:44px;max-width:220px;margin-bottom:8px;display:block;} .hd .biz{font-size:24px;font-weight:800;}
    .bd{padding:28px 32px;} .ttl{color:${esc(accent)};font-size:11px;letter-spacing:1.5px;font-weight:700;text-transform:uppercase;}
    .cust{font-size:22px;font-weight:800;margin:6px 0 18px;}
    table{width:100%;border-collapse:collapse;} td{padding:11px 0;border-bottom:1px solid #E2E8F0;font-size:14px;}
    .amt{text-align:right;font-weight:600;white-space:nowrap;} .muted{color:#64748B;}
    .total{display:flex;justify-content:space-between;align-items:center;padding-top:16px;}
    .total .l{font-size:18px;font-weight:800;} .total .a{font-size:26px;font-weight:800;color:${esc(accent)};}
    .dep{display:flex;justify-content:space-between;align-items:center;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-top:18px;} .dep .ds{color:#475569;font-size:12px;} .dep .da{font-size:20px;font-weight:800;color:${esc(accent)};}
    .sec{margin-top:24px;} .lbl{font-size:13px;font-weight:700;color:#1E2640;margin-bottom:8px;}
    .sig{max-width:300px;max-height:110px;border-bottom:1.5px solid #0A0E1A;display:block;}
    .accepted{color:${esc(accent)};font-weight:700;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-top:8px;}
  </style></head><body>
    <div class="hd">${logo ? `<img src="${esc(logo)}"/>` : ''}<div class="biz">${esc(bizName)}</div></div>
    <div class="bd">
      <div class="ttl">Fixed price estimate — signed agreement</div>
      <div class="cust">${esc(name)}</div>
      <table>${rows}</table>
      <div class="total"><span class="l">Total</span><span class="a">${money(total)}</span></div>
      ${dep}
      ${paySec}
      <div class="sec"><div class="lbl">Customer Signature</div>
        ${sig ? `<img class="sig" src="${esc(sig)}"/>` : ''}
        <div class="accepted">Accepted &amp; signed — ${esc(fmtDateTime(signedAt))}</div>
      </div>
    </div>
  </body></html>`;
}

// ── Certificate of Completion (Part 6) ─────────────────────────────────────────
// Public (token is the access control). Standalone, printable, court-suitable document. Exposes
// only what the signer already saw (their own name/email/phone-last4/IP/browser) plus the hash.
function certificatePage(token, quote, business) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const accent = pres.brandColor || '#2979FF';
  const bizName = pres.businessName || (business && business.name) || 'Your contractor';
  const name = pres.customerName || quote.customer_name || '—';
  const total = pres.total != null ? pres.total : (quote.total || 0);
  const hash = quote.document_hash || documentHash(quote.quote_data);
  const signedAt = quote.signed_at ? new Date(quote.signed_at).getTime() : null;
  const createdAt = quote.created_at ? new Date(quote.created_at).getTime() : null;
  const last4 = quote.signer_phone ? phoneLast4(quote.signer_phone) : null;
  const verified = !!quote.phone_verified;
  const ua = quote.signer_user_agent ? String(quote.signer_user_agent).slice(0, 120) : '—';
  const events = Array.isArray(quote.audit_log) ? quote.audit_log : [];
  const eventLabel = (e) => ({ quote_viewed: 'Quote viewed', verification_requested: 'Verification requested', verification_completed: 'Identity verified', quote_signed: 'Quote signed' }[e] || e);

  const row = (label, value) => `<tr><td class="k">${esc(label)}</td><td class="v">${value}</td></tr>`;
  const eventsRows = events.length
    ? events.map((ev) => `<tr><td class="ev-t">${esc(fmtDateTime(ev.timestamp))}</td><td class="ev-e">${esc(eventLabel(ev.event))}</td><td class="ev-i">${esc(ev.ip || '—')}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">No events recorded.</td></tr>';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Certificate of Completion — ${esc(bizName)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#F1F5F9;color:#0A0E1A;line-height:1.5;padding:24px 12px;}
  .doc{max-width:720px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;}
  .hd{background:#0A0E1A;color:#fff;padding:28px 32px;display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid ${esc(accent)};}
  .wm{font-size:24px;font-weight:800;letter-spacing:-.5px;} .wm .dot{color:${esc(accent)};}
  .hd .t{font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#CBD5E1;font-weight:700;}
  .body{padding:28px 32px;}
  .sec{margin-bottom:26px;}
  .sec h2{font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${esc(accent)};font-weight:800;border-bottom:2px solid #E2E8F0;padding-bottom:6px;margin-bottom:10px;}
  table{width:100%;border-collapse:collapse;}
  td{padding:7px 0;vertical-align:top;font-size:14px;}
  td.k{color:#64748B;width:42%;} td.v{color:#0A0E1A;font-weight:600;text-align:right;word-break:break-word;}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:400;color:#475569;}
  .ok{color:#10B981;font-weight:800;}
  .audit td{border-bottom:1px solid #F1F5F9;font-size:13px;}
  .audit .ev-t{color:#475569;} .audit .ev-e{font-weight:700;} .audit .ev-i{color:#64748B;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:12px;}
  .muted{color:#94A3B8;}
  .legal{font-size:12px;color:#475569;line-height:1.7;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;}
  .foot{margin-top:22px;text-align:center;color:#94A3B8;font-size:12px;}
  @media print{body{background:#fff;padding:0;}.doc{border:none;border-radius:0;}}
</style></head><body>
<div class="doc">
  <div class="hd"><div class="wm">Pricr<span class="dot">.</span></div><div class="t">Certificate of Completion</div></div>
  <div class="body">
    <div class="sec"><h2>Document Information</h2><table>
      ${row('Document ID', `<span class="mono">${esc(token)}</span>`)}
      ${row('Business', esc(bizName))}
      ${row('Created', esc(createdAt ? fmtDateTime(createdAt) : '—'))}
      ${row('Total Value', money(total))}
    </table></div>
    <div class="sec"><h2>Signer Information</h2><table>
      ${row('Name', esc(name))}
      ${row('Email', esc(quote.signer_email || 'Not provided'))}
      ${row('Phone', last4 ? '•••• ' + esc(last4) : 'Not provided')}
      ${row('Identity verified via SMS', verified ? '<span class="ok">&#10003; Yes</span>' : 'No')}
    </table></div>
    <div class="sec"><h2>Signature Event</h2><table>
      ${row('Signed', esc(signedAt ? fmtDateTime(signedAt) : 'Not yet signed'))}
      ${row('IP Address', esc(quote.signer_ip || '—'))}
      ${row('Browser', `<span class="mono">${esc(ua)}</span>`)}
      ${row('Document Hash (SHA-256)', `<span class="mono">${esc(hash)}</span>`)}
    </table></div>
    <div class="sec"><h2>Audit Trail</h2><table class="audit"><tr><td class="k">Timestamp</td><td class="k">Event</td><td class="k" style="text-align:right;">IP</td></tr>${eventsRows}</table></div>
    <div class="legal">This Certificate of Completion confirms that the above-named party reviewed and electronically signed the attached document. This record serves as legal evidence of the signing event under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act, 15 U.S.C. § 7001 et seq.) and the Uniform Electronic Transactions Act (UETA). The document hash above can be used to verify the document has not been tampered with since signing.</div>
    <div class="foot">Secured by Pricr · pricr.veraa.io · Document retained for 7 years</div>
  </div>
</div>
</body></html>`;
}

// ── Request/response helpers ───────────────────────────────────────────────────
function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(html);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

async function handleSignSubmit(req, res, token, rawBody) {
  let parsed;
  try { parsed = JSON.parse(rawBody.toString() || '{}'); } catch (_) { return sendJson(res, 400, { error: 'Invalid request body' }); }
  const signature_data = parsed.signature_data;
  const customer_name = (parsed.customer_name || '').toString().trim();
  const signer_email = (parsed.signer_email || '').toString().trim();
  const sessionToken = (parsed.sessionToken || '').toString();
  if (!signature_data) return sendJson(res, 400, { error: 'Signature is required' });
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendJson(res, 404, { error: 'This quote could not be found.' });
    if (ctx.quote.signed_at) return sendJson(res, 409, { error: 'This quote has already been signed.' });
    // FEATURE 1: reject signing on an expired quote (ADD-only guard).
    const presExp = (ctx.quote.quote_data && ctx.quote.quote_data.presentation) || {};
    if (presExp.validThrough && Date.now() > presExp.validThrough) return sendJson(res, 410, { error: 'This quote has expired. Please ask your contractor for an updated quote.' });
    // Identity gate: when SMS verification is enforced, require a valid, unexpired session token
    // (issued by /verify-code) and a verified phone on the row.
    const requireSms = smsRequiredFor(ctx.business);
    if (requireSms) {
      const expEpoch = ctx.quote.verification_expires_at ? new Date(ctx.quote.verification_expires_at).getTime() : 0;
      const sessionOk = !!sessionToken && !!ctx.quote.verification_code
        && hashSecret(token, sessionToken) === ctx.quote.verification_code && Date.now() < expEpoch;
      if (!ctx.quote.phone_verified || !sessionOk) {
        return sendJson(res, 403, { error: 'Identity verification required' });
      }
    }
    const signedAt = Date.now();
    const ip = clientIp(req);
    const ua = userAgent(req);
    const merged = Object.assign({}, ctx.quote.quote_data || {}, {
      signatureData: signature_data, signedAt, status: 'won',
      ...(customer_name ? { customerName: customer_name } : {}),
    });
    const docHash = documentHash(merged);
    // Append the signed event to the audit trail (written in the same PATCH below).
    const auditLog = (Array.isArray(ctx.quote.audit_log) ? ctx.quote.audit_log.slice() : []);
    auditLog.push({
      event: 'quote_signed', timestamp: new Date(signedAt).toISOString(), ip, user_agent: ua,
      customer_name: customer_name || ctx.quote.customer_name || null, signer_email: signer_email || null,
      document_hash: docHash,
    });
    const upd = await supabaseRequest('PATCH', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}`, {
      signature_data,
      signed_at: new Date(signedAt).toISOString(),
      status: 'accepted',
      customer_name: customer_name || ctx.quote.customer_name || null,
      signer_ip: ip || null,
      signer_user_agent: ua || null,
      signer_email: signer_email || null,
      document_hash: docHash,
      audit_log: auditLog,
      quote_data: merged,
      verification_code: null,            // consume the session — can't be reused
      verification_expires_at: null,
      updated_at: new Date(signedAt).toISOString(),
    });
    if (upd.status >= 200 && upd.status < 300) {
      const last4 = ctx.quote.signer_phone ? phoneLast4(ctx.quote.signer_phone) : null;
      // Fire-and-forget email delivery — never block (or fail) the signing response on email.
      try {
        const signedQuote = Object.assign({}, ctx.quote, {
          quote_data: merged, signature_data, signed_at: new Date(signedAt).toISOString(),
          customer_name: customer_name || ctx.quote.customer_name || null, signer_email: signer_email || null,
          signer_ip: ip || ctx.quote.signer_ip || null, signer_user_agent: ua || null, document_hash: docHash,
        });
        const accent = (merged.presentation && merged.presentation.brandColor) || '#2979FF';
        // Use the clean signing base for the certificate link in emails (falls back to the Railway URL).
        const certificateUrl = `${SIGNING_BASE}/sign/${encodeURIComponent(token)}/certificate`;
        const tokenShort = String(token).slice(0, 8).toUpperCase();
        // EMAIL 1 — customer confirmation (only if they provided an address). Body links to the
        // hosted certificate page; no HTML attachment (customers were receiving a "signed-quote.html"
        // file blob alongside the link, which was confusing on iOS Mail / Gmail — the link in the
        // body always renders the signed document in the browser).
        if (signer_email) {
          sendEmail({
            to: signer_email,
            subject: `Your signed quote from ${(ctx.business && ctx.business.name) || 'your contractor'} — Document ID: ${tokenShort}`,
            html: customerEmailHtml(signedQuote, ctx.business, accent, { token, certificateUrl, signedAt }),
          });
        }
        // EMAIL 2 — contractor notification (always, if we have their email).
        const cEmail = contractorEmail(ctx.business);
        if (cEmail) {
          const name = (merged.presentation && merged.presentation.customerName) || customer_name || ctx.quote.customer_name || 'A customer';
          const total = (merged.presentation && merged.presentation.total != null) ? merged.presentation.total : (ctx.quote.total || 0);
          sendEmail({
            to: cEmail,
            subject: `✓ Signed — ${name} — ${money(total)}`,
            html: contractorEmailHtml(signedQuote, ctx.business, accent, { signedAt, ip, userAgent: ua, phoneLast4: last4, token }, certificateUrl),
          });
        }
        // Push: client signed.
        sendPushNotification(businessPushToken(ctx.business), `${name} signed your quote! 🎉`, `${name} accepted the quote for ${money(total)}`);
      } catch (e) { console.warn('[sign] email trigger error:', e && e.message); }
      return sendJson(res, 200, { ok: true, phone_last4: last4 });
    }
    return sendJson(res, 500, { error: 'Could not save your signature. Please try again.' });
  } catch (e) {
    return sendJson(res, 500, { error: 'Server error. Please try again.' });
  }
}

// POST /sign/:token/request-code — generate + SMS a 6-digit code (hashed at rest), rate-limited.
async function handleRequestCode(req, res, token, rawBody) {
  let parsed;
  try { parsed = JSON.parse(rawBody.toString() || '{}'); } catch (_) { return sendJson(res, 400, { error: 'Invalid request body' }); }
  const phone = (parsed.phone || '').toString().trim();
  if (phone.replace(/\D/g, '').length < 7) return sendJson(res, 400, { error: 'Enter a valid mobile number.' });
  if (!twilioConfigured()) return sendJson(res, 503, { error: 'SMS verification is unavailable right now.' });
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendJson(res, 404, { error: 'This quote could not be found.' });
    if (ctx.quote.signed_at) return sendJson(res, 409, { error: 'This quote has already been signed.' });
    // Rate limit: max 3 code requests per token per hour (counted from the audit log).
    const log = Array.isArray(ctx.quote.audit_log) ? ctx.quote.audit_log : [];
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const recent = log.filter((e) => e && e.event === 'verification_requested' && new Date(e.timestamp).getTime() > hourAgo).length;
    if (recent >= 3) return sendJson(res, 429, { error: 'Too many code requests. Please try again later.' });

    const code = genCode();
    const ip = clientIp(req);
    const newLog = log.slice();
    newLog.push({ event: 'verification_requested', timestamp: new Date().toISOString(), ip, phone_last4: phoneLast4(phone) });
    const upd = await supabaseRequest('PATCH', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}`, {
      verification_code: hashSecret(token, code),                          // hashed — never plaintext
      verification_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      audit_log: newLog,
    });
    if (!(upd.status >= 200 && upd.status < 300)) return sendJson(res, 500, { error: 'Could not send a code. Please try again.' });
    // Fire-and-forget SMS — the code is never returned in the response or logged.
    sendSms(phone, `Your Pricr signing code is: ${code}. Valid for 10 minutes.`);
    return sendJson(res, 200, { success: true });
  } catch (e) {
    return sendJson(res, 500, { error: 'Server error. Please try again.' });
  }
}

// POST /sign/:token/verify-code — validate the code, mark phone_verified, issue a session token.
async function handleVerifyCode(req, res, token, rawBody) {
  let parsed;
  try { parsed = JSON.parse(rawBody.toString() || '{}'); } catch (_) { return sendJson(res, 400, { error: 'Invalid request body' }); }
  const phone = (parsed.phone || '').toString().trim();
  const code = (parsed.code || '').toString().trim();
  if (code.length !== 6) return sendJson(res, 400, { error: 'Enter the 6-digit code.' });
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendJson(res, 404, { error: 'This quote could not be found.' });
    if (ctx.quote.signed_at) return sendJson(res, 409, { error: 'This quote has already been signed.' });
    const expEpoch = ctx.quote.verification_expires_at ? new Date(ctx.quote.verification_expires_at).getTime() : 0;
    if (!ctx.quote.verification_code || Date.now() >= expEpoch) {
      return sendJson(res, 400, { error: 'Your code has expired. Please request a new one.' });
    }
    if (hashSecret(token, code) !== ctx.quote.verification_code) {
      return sendJson(res, 400, { error: 'That code was not correct. Please try again.' });
    }
    // Verified — issue a short-lived session token (stored hashed, reusing the verification column).
    const sessionToken = genSessionToken();
    const ip = clientIp(req);
    const log = Array.isArray(ctx.quote.audit_log) ? ctx.quote.audit_log.slice() : [];
    log.push({ event: 'verification_completed', timestamp: new Date().toISOString(), ip, phone_last4: phoneLast4(phone) });
    const upd = await supabaseRequest('PATCH', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}`, {
      phone_verified: true,
      signer_phone: phone || ctx.quote.signer_phone || null,
      verification_code: hashSecret(token, sessionToken),                  // now holds the hashed session token
      verification_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      audit_log: log,
    });
    if (!(upd.status >= 200 && upd.status < 300)) return sendJson(res, 500, { error: 'Could not verify your code. Please try again.' });
    return sendJson(res, 200, { verified: true, sessionToken });
  } catch (e) {
    return sendJson(res, 500, { error: 'Server error. Please try again.' });
  }
}

// FEATURE 5: increment view_count, and on the FIRST view set first_viewed_at + notify the contractor
// (email + push). Best-effort — never blocks the page render.
async function trackQuoteView(token, ctx) {
  const quote = ctx.quote;
  const firstView = !quote.first_viewed_at;
  const patch = { view_count: (quote.view_count || 0) + 1 };
  if (firstView) patch.first_viewed_at = new Date().toISOString();
  try { await supabaseRequest('PATCH', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}`, patch); } catch (_) { /* column may not exist until migration 0008 */ }
  if (!firstView) return;
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const clientName = pres.customerName || quote.customer_name || 'A client';
  const total = pres.total != null ? pres.total : (quote.total || 0);
  const signingUrl = `${SIGNING_BASE}/sign/${encodeURIComponent(token)}`;
  const cEmail = contractorEmail(ctx.business);
  if (cEmail) {
    sendEmail({
      to: cEmail,
      subject: `${clientName} viewed your quote`,
      html: `<p>${esc(clientName)} just opened your quote for ${money(total)}.</p><p>They haven't signed yet — this is a great time to follow up.</p><p><a href="${esc(signingUrl)}">View quote</a></p>`,
    });
  }
  sendPushNotification(businessPushToken(ctx.business), `${clientName} viewed your quote`, `They opened the quote for ${money(total)} — great time to follow up`);
}

async function handleSignPage(req, res, token) {
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendHtml(res, 404, stateCard('#2979FF', '?', 'Quote not found', 'This signing link is invalid or has expired. Please ask your contractor to resend it.'));
    const accent = (ctx.quote.quote_data && ctx.quote.quote_data.presentation && ctx.quote.quote_data.presentation.brandColor) || '#2979FF';
    if (ctx.quote.signed_at) {
      const biz = (ctx.business && ctx.business.name) || 'Your contractor';
      return sendHtml(res, 200, stateCard(accent, '&#10003;', 'Already signed', 'This quote has already been accepted. ' + biz + ' will be in touch to confirm.'));
    }
    // FEATURE 1: block expired quotes (ADD-only guard — does not alter the signing flow itself).
    const pres = (ctx.quote.quote_data && ctx.quote.quote_data.presentation) || {};
    if (pres.validThrough && Date.now() > pres.validThrough) {
      const biz = (ctx.business && ctx.business.name) || 'your contractor';
      return sendHtml(res, 200, stateCard(accent, '!', 'This quote has expired', 'This quote is no longer valid. Contact ' + biz + ' for an updated quote.'));
    }
    // Log a "quote_viewed" event (fire-and-forget — does not block rendering the page).
    appendAuditEvent(token, ctx.quote.audit_log, {
      event: 'quote_viewed', timestamp: new Date().toISOString(), ip: clientIp(req), user_agent: userAgent(req),
    });
    // FEATURE 5: count views + notify the contractor on the first open (fire-and-forget).
    trackQuoteView(token, ctx).catch((e) => console.warn('[view] track failed:', e && e.message));
    // FEATURE 6: best-effort count of completed (signed) projects for the social-proof line.
    let signedCount = 0;
    try {
      const sc = await supabaseRequest('GET', `/rest/v1/quotes?business_id=eq.${encodeURIComponent(ctx.quote.business_id)}&status=eq.accepted&select=id`);
      signedCount = Array.isArray(sc.json) ? sc.json.length : 0;
    } catch (_) { /* social proof is optional */ }
    return sendHtml(res, 200, signingPage(token, ctx.quote, ctx.business, signedCount));
  } catch (e) {
    return sendHtml(res, 500, stateCard('#2979FF', '!', 'Something went wrong', 'We could not load this quote right now. Please try again shortly.'));
  }
}

async function handleCertificate(res, token) {
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendHtml(res, 404, stateCard('#2979FF', '?', 'Not found', 'This certificate link is invalid or has expired.'));
    return sendHtml(res, 200, certificatePage(token, ctx.quote, ctx.business));
  } catch (e) {
    return sendHtml(res, 500, stateCard('#2979FF', '!', 'Something went wrong', 'We could not load this certificate right now. Please try again shortly.'));
  }
}

// ── Super-admin cross-tenant endpoints (service role; guarded by the master code) ──
// These are the ONLY way the app reads/writes across tenants — the app's anon key is RLS-limited.
// No hardcoded fallback. If MASTER_CODE isn't configured, the admin endpoints are disabled (503).
const MASTER_CODE = process.env.MASTER_CODE || '';
const adminConfigured = () => MASTER_CODE.length > 0;

// In-memory admin session tokens → expiry (ms). Cleared on every redeploy by design (a feature:
// a redeploy invalidates all admin sessions). 4-hour TTL.
const ADMIN_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const adminTokens = new Map();
function issueAdminToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_MS;
  adminTokens.set(token, expiresAt);
  return { token, expiresAt };
}
function adminTokenValid(token) {
  if (!token) return false;
  const exp = adminTokens.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { adminTokens.delete(token); return false; }
  return true;
}
// Timing-safe code comparison. SHA-256 both sides → equal-length buffers, so timingSafeEqual is
// safe regardless of input length and leaks neither the code nor its length.
function codeMatches(submitted) {
  if (!adminConfigured()) return false;
  const a = crypto.createHash('sha256').update(String(submitted || '')).digest();
  const b = crypto.createHash('sha256').update(MASTER_CODE).digest();
  return crypto.timingSafeEqual(a, b);
}
// Admin requests now carry a short-lived Bearer token (issued by POST /admin/auth), not the code.
const adminAuthed = (req) => {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? adminTokenValid(m[1].trim()) : false;
};
const parseJsonBody = (buf) => { try { return JSON.parse(buf.toString() || '{}'); } catch (_) { return {}; } };

async function fetchAllBusinesses() {
  const r = await supabaseRequest('GET', '/rest/v1/businesses?select=id,code,name,config,created_at');
  return Array.isArray(r.json) ? r.json : [];
}
async function fetchAllQuotesMeta() {
  const r = await supabaseRequest('GET', '/rest/v1/quotes?select=business_id,signed_at,status,created_at');
  return Array.isArray(r.json) ? r.json : [];
}
// Classify a business's schema for the platform-health view.
function schemaStatus(config) {
  const sc = config && config.schema;
  if (!sc || !Array.isArray(sc.fields) || sc.fields.length === 0) return 'blank';
  const pricing = sc.pricing || {};
  const jobSize = sc.fields.some((f) => /\bjob size\b/i.test(f.label || '')) && Object.values(pricing).some((v) => v === 100);
  if (jobSize) return 'placeholder';
  if (!(sc.trade || '').trim()) return 'no-trade';
  return 'ok';
}

async function fetchAllQuotesFull() {
  const r = await supabaseRequest('GET', '/rest/v1/quotes?select=business_id,total,status,signed_at,created_at');
  return Array.isArray(r.json) ? r.json : [];
}

// Comprehensive cross-tenant analytics for the hidden super-admin screen.
async function handleAdminPlatformAnalytics(res) {
  const now = new Date();
  const thisMonth = (ts) => { const d = new Date(ts); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); };
  const lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const inLastMonth = (ts) => { const d = new Date(ts); return d.getMonth() === lastM.getMonth() && d.getFullYear() === lastM.getFullYear(); };
  const DAY = 86400000;
  const [biz, quotes] = await Promise.all([fetchAllBusinesses(), fetchAllQuotesFull()]);

  const byBiz = {};
  biz.forEach(b => { byBiz[b.id] = { code: b.code, name: b.name, trade: (b.config && b.config.schema && b.config.schema.trade) || '', joined: b.created_at, total: 0, month: 0, last: 0, schemaStatus: schemaStatus(b.config) }; });
  let totalSigned = 0, signedThisMonth = 0, acceptedCount = 0, sentCount = 0, contractValue = 0, highest = 0;
  const signTimes = []; const totalsPos = [];
  quotes.forEach(q => {
    const e = byBiz[q.business_id];
    const t = new Date(q.created_at).getTime();
    if (e) { e.total++; if (thisMonth(t)) e.month++; if (t > e.last) e.last = t; }
    if (q.signed_at) { totalSigned++; if (thisMonth(new Date(q.signed_at).getTime())) signedThisMonth++; const st = (new Date(q.signed_at).getTime() - t) / 3600000; if (st >= 0) signTimes.push(st); }
    if (q.status === 'accepted') { acceptedCount++; contractValue += Number(q.total) || 0; }
    if (['sent', 'accepted', 'declined'].includes(q.status)) sentCount++;
    if (typeof q.total === 'number' && q.total > 0) { totalsPos.push(q.total); if (q.total > highest) highest = q.total; }
  });
  const list = Object.values(byBiz);
  const round1 = (n) => Math.round(n * 10) / 10;
  const avgTimeToSign = signTimes.length ? round1(signTimes.reduce((a, b) => a + b, 0) / signTimes.length) : 0;
  const avgQuoteValue = totalsPos.length ? Math.round(totalsPos.reduce((a, b) => a + b, 0) / totalsPos.length) : 0;

  // Trade breakdown.
  const tradeCount = {};
  list.forEach(b => { const tr = (b.trade || '').trim() || 'Unset'; tradeCount[tr] = (tradeCount[tr] || 0) + 1; });
  const tradeBreakdown = Object.entries(tradeCount).map(([trade, count]) => ({ trade, count })).sort((a, b) => b.count - a.count);
  const popular = tradeBreakdown.find(t => t.trade !== 'Unset') || tradeBreakdown[0] || { trade: 'None', count: 0 };

  const newThisMonth = list.filter(b => thisMonth(new Date(b.joined).getTime())).length;
  const newLastMonth = list.filter(b => inLastMonth(new Date(b.joined).getTime())).length;
  const activeThisMonth = list.filter(b => b.month > 0).length;
  const mapItem = (b) => ({ code: b.code, name: b.name, trade: b.trade, joined: b.joined, lastActive: b.last || null, quotesThisMonth: b.month, totalQuotes: b.total });

  return sendJson(res, 200, {
    totalBusinesses: list.length,
    totalQuotes: quotes.length,
    totalSigned,
    platformCloseRate: sentCount > 0 ? round1((acceptedCount / sentCount) * 100) : 0,
    contractValue: Math.round(contractValue),
    activeThisMonth,
    newThisMonth, newLastMonth,
    growthPct: newLastMonth > 0 ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 100) : (newThisMonth > 0 ? 100 : 0),
    avgQuotesPerBizPerMonth: activeThisMonth > 0 ? round1(list.reduce((s, b) => s + b.month, 0) / activeThisMonth) : 0,
    mostActive: list.filter(b => b.total > 0).sort((a, b) => b.month - a.month || b.total - a.total).slice(0, 5).map(mapItem),
    atRisk: list.filter(b => b.total > 0 && b.last && (Date.now() - b.last > 14 * DAY)).sort((a, b) => a.last - b.last).slice(0, 10).map(mapItem),
    neverUsed: list.filter(b => b.total === 0).slice(0, 20).map(mapItem),
    brokenSchema: list.filter(b => ['blank', 'placeholder', 'no-trade'].includes(b.schemaStatus)).slice(0, 20).map(mapItem),
    signaturesThisMonth: signedThisMonth,
    avgTimeToSignHours: avgTimeToSign,
    avgQuoteValue,
    highestQuote: Math.round(highest),
    popularTrade: popular,
    tradeBreakdown,
  });
}

async function handleAdminStats(res) {
  const [biz, quotes] = await Promise.all([fetchAllBusinesses(), fetchAllQuotesMeta()]);
  const cnt = {};
  quotes.forEach((q) => { cnt[q.business_id] = (cnt[q.business_id] || 0) + 1; });
  const signed = quotes.filter((q) => q.signed_at || q.status === 'accepted').length;
  const blank = biz.filter((b) => ['blank', 'placeholder', 'no-trade'].includes(schemaStatus(b.config))).length;
  const zeroQuote = biz.filter((b) => !cnt[b.id]).length;
  return sendJson(res, 200, { businesses: biz.length, quotes: quotes.length, signed, blankSchemas: blank, zeroQuoteBusinesses: zeroQuote });
}

async function handleAdminSearch(res, body) {
  const q = (parseJsonBody(body).query || '').toString().trim().toLowerCase();
  const [biz, quotes] = await Promise.all([fetchAllBusinesses(), fetchAllQuotesMeta()]);
  const cnt = {}, last = {};
  quotes.forEach((x) => { cnt[x.business_id] = (cnt[x.business_id] || 0) + 1; const t = new Date(x.created_at).getTime(); if (!last[x.business_id] || t > last[x.business_id]) last[x.business_id] = t; });
  const results = biz.filter((b) => {
    if (!q) return true;
    const c = b.config || {};
    return (b.name || '').toLowerCase().includes(q) || (b.code || '').toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q);
  }).slice(0, 50).map((b) => ({
    code: b.code, name: b.name, trade: (b.config && b.config.schema && b.config.schema.trade) || '',
    username: (b.config && b.config.username) || '', quoteCount: cnt[b.id] || 0, lastActive: last[b.id] || null,
    schemaStatus: schemaStatus(b.config), suspended: !!(b.config && b.config.suspended),
  }));
  return sendJson(res, 200, { results });
}

async function handleAdminBusiness(res, body) {
  const code = (parseJsonBody(body).code || '').toString().toUpperCase();
  const r = await supabaseRequest('GET', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}&select=*`);
  const b = Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
  if (!b) return sendJson(res, 404, { error: 'Business not found' });
  // Deep access: every quote ever (capped at 500), full config (settings/schema/brand), team, signing.
  const qr = await supabaseRequest('GET', `/rest/v1/quotes?business_id=eq.${encodeURIComponent(b.id)}&select=customer_name,total,status,signed_at,created_at&order=created_at.desc&limit=500`);
  const quotes = Array.isArray(qr.json) ? qr.json : [];
  const config = b.config || {};
  const signedCount = quotes.filter((q) => q.signed_at).length;
  return sendJson(res, 200, {
    code: b.code, name: b.name, config, schema: config.schema || null, brand: config.brand || null,
    schemaStatus: schemaStatus(config), members: config.members || [],
    quotes, recentQuotes: quotes.slice(0, 10), quoteCount: quotes.length, signedCount, suspended: !!config.suspended,
  });
}

async function handleAdminResetPassword(res, body) {
  const p = parseJsonBody(body); const code = (p.code || '').toString().toUpperCase();
  const r = await supabaseRequest('GET', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}&select=*`);
  const b = Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
  if (!b) return sendJson(res, 404, { error: 'Business not found' });
  const config = b.config || {};
  const username = (p.username || config.username || '').toString().toLowerCase();
  if (!username) return sendJson(res, 400, { error: 'No username on file for this business' });
  const temp = 'pricr-' + Math.random().toString(36).slice(2, 8);
  // Hash matches the app's hashPin: SHA-256 of `pricr:<username-lowercased>:<password>`.
  const hash = crypto.createHash('sha256').update(`pricr:${username}:${temp}`).digest('hex');
  const isAdmin = (config.username || '').toLowerCase() === username;
  const newConfig = Object.assign({}, config, isAdmin ? { adminPinHash: hash, adminPin: '' } : {});
  if (Array.isArray(newConfig.members)) newConfig.members = newConfig.members.map((m) => ((m.username || '').toLowerCase() === username ? Object.assign({}, m, { pinHash: hash }) : m));
  const upd = await supabaseRequest('PATCH', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}`, { config: newConfig });
  if (!(upd.status >= 200 && upd.status < 300)) return sendJson(res, 500, { error: 'Could not reset password' });
  return sendJson(res, 200, { ok: true, tempPassword: temp, username });
}

async function handleAdminExport(res) {
  const [biz, quotes] = await Promise.all([fetchAllBusinesses(), fetchAllQuotesMeta()]);
  const cnt = {}, signed = {};
  quotes.forEach((q) => { cnt[q.business_id] = (cnt[q.business_id] || 0) + 1; if (q.signed_at || q.status === 'accepted') signed[q.business_id] = (signed[q.business_id] || 0) + 1; });
  const cell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = [['Code', 'Name', 'Trade', 'Quotes', 'Signed', 'Schema', 'Created']];
  biz.forEach((b) => rows.push([b.code, b.name, (b.config && b.config.schema && b.config.schema.trade) || '', cnt[b.id] || 0, signed[b.id] || 0, schemaStatus(b.config), b.created_at]));
  const csv = rows.map((r) => r.map(cell).join(',')).join('\n');
  res.writeHead(200, { 'Content-Type': 'text/csv', 'Access-Control-Allow-Origin': '*', 'Content-Disposition': 'attachment; filename="pricr-businesses.csv"' });
  res.end(csv);
}

async function handleAdminNotify(res, body) {
  const p = parseJsonBody(body); const code = (p.code || '').toString().toUpperCase();
  const r = await supabaseRequest('GET', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}&select=name,config`);
  const b = Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
  if (!b) return sendJson(res, 404, { error: 'Business not found' });
  const email = contractorEmail({ config: b.config });
  if (!email) return sendJson(res, 400, { error: 'No email on file for this business' });
  sendEmail({ to: email, subject: 'A message from Pricr', html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0A0E1A;padding:8px;"><p style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(p.message || '')}</p><p style="color:#94A3B8;font-size:12px;margin-top:18px;">Sent via Pricr</p></div>` });
  return sendJson(res, 200, { ok: true, sentTo: email });
}

async function handleAdminBusinessAction(res, body) {
  const p = parseJsonBody(body); const code = (p.code || '').toString().toUpperCase();
  const r = await supabaseRequest('GET', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}&select=*`);
  const b = Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
  if (!b) return sendJson(res, 404, { error: 'Business not found' });
  if (p.action === 'delete') {
    // Full cascade cleanup (explicit, in FK-safe order): quotes → brand_configs → users → business.
    const id = encodeURIComponent(b.id);
    await supabaseRequest('DELETE', `/rest/v1/quotes?business_id=eq.${id}`);
    await supabaseRequest('DELETE', `/rest/v1/brand_configs?business_id=eq.${id}`);
    await supabaseRequest('DELETE', `/rest/v1/users?business_id=eq.${id}`);
    const d = await supabaseRequest('DELETE', `/rest/v1/businesses?id=eq.${id}`);
    return sendJson(res, d.status < 300 ? 200 : 500, d.status < 300 ? { ok: true } : { error: 'Delete failed' });
  }
  if (p.action === 'suspend' || p.action === 'unsuspend') {
    const config = Object.assign({}, b.config, { suspended: p.action === 'suspend' });
    const upd = await supabaseRequest('PATCH', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}`, { config });
    return sendJson(res, upd.status < 300 ? 200 : 500, upd.status < 300 ? { ok: true, suspended: p.action === 'suspend' } : { error: 'Failed' });
  }
  if (p.action === 'clear-schema') {
    // Force a rebuild: blank the schema so the business is routed back into onboarding on next load.
    const config = Object.assign({}, b.config, { schema: null });
    const upd = await supabaseRequest('PATCH', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}`, { config });
    return sendJson(res, upd.status < 300 ? 200 : 500, upd.status < 300 ? { ok: true } : { error: 'Failed' });
  }
  return sendJson(res, 400, { error: 'Unknown action' });
}

async function handleAdminUser(res, body) {
  const p = parseJsonBody(body); const code = (p.code || '').toString().toUpperCase();
  const r = await supabaseRequest('GET', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}&select=*`);
  const b = Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
  if (!b) return sendJson(res, 404, { error: 'Business not found' });
  const config = b.config || {};
  let members = Array.isArray(config.members) ? config.members : [];
  if (p.action === 'remove') members = members.filter((m) => m.id !== p.userId);
  else if (p.action === 'role') members = members.map((m) => (m.id === p.userId ? Object.assign({}, m, { role: p.role }) : m));
  const upd = await supabaseRequest('PATCH', `/rest/v1/businesses?code=eq.${encodeURIComponent(code)}`, { config: Object.assign({}, config, { members }) });
  return sendJson(res, upd.status < 300 ? 200 : 500, upd.status < 300 ? { ok: true } : { error: 'Failed' });
}

// ── Stripe (lazy require; only touched when STRIPE_SECRET_KEY is set, so dev without it never errors) ──
let _stripe = null;
function getStripe() {
  if (_stripe) return _stripe;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try { _stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); }
  catch (e) { console.warn('[billing] stripe module unavailable:', e && e.message); _stripe = null; }
  return _stripe;
}

// ── Veraa partner codes ──────────────────────────────────────────────────────────
const VERAA_CODE_RE = /^VERAA-[A-Z]+-\d{4}$/;
function envVeraaCodes() { try { const a = JSON.parse(process.env.VERAA_CODES || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch (_) { return []; } }
async function veraaCodeValid(code) {
  if (envVeraaCodes().includes(code)) return true; // env-array fast path (works before the table exists; not single-use)
  try {
    const r = await supabaseRequest('GET', `/rest/v1/veraa_codes?select=code,revoked,used_by&code=eq.${encodeURIComponent(code)}`);
    if (Array.isArray(r.json) && r.json.length) {
      const row = r.json[0];
      return !row.revoked && !row.used_by; // single-use: a claimed code is no longer "valid" for new applications
    }
  } catch (_) { /* table may not exist yet */ }
  return false;
}
async function handleValidatePromo(res, buf) {
  const code = String(parseJsonBody(buf).code || '').toUpperCase().trim();
  if (VERAA_CODE_RE.test(code)) {
    const valid = await veraaCodeValid(code);
    return sendJson(res, 200, { valid, type: 'veraa', message: valid ? 'Veraa client code accepted' : 'Invalid code' });
  }
  return sendJson(res, 200, { valid: false, type: 'unknown', message: 'Invalid promo code' });
}
// Atomically claim a (DB-stored) Veraa code for a business. Marks used_by/used_at so a code can't be
// re-applied by anyone else. The env-array fast path (VERAA_CODES) is NOT single-use — those are
// shared/seed codes and the function accepts them without DB marking. Returns 409 if already claimed.
async function handleApplyPromo(res, buf) {
  const body = parseJsonBody(buf);
  const code = String(body.code || '').toUpperCase().trim();
  const businessCode = String(body.businessCode || '').trim();
  if (!VERAA_CODE_RE.test(code)) return sendJson(res, 400, { ok: false, error: 'invalid format' });
  if (!businessCode) return sendJson(res, 400, { ok: false, error: 'businessCode required' });
  // Env-array codes: accept without marking (no DB row to mark).
  if (envVeraaCodes().includes(code)) return sendJson(res, 200, { ok: true });
  let row = null;
  try {
    const r = await supabaseRequest('GET', `/rest/v1/veraa_codes?select=code,revoked,used_by&code=eq.${encodeURIComponent(code)}`);
    row = Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
  } catch (_) { return sendJson(res, 500, { ok: false, error: 'lookup failed' }); }
  if (!row) return sendJson(res, 404, { ok: false, error: 'code not found' });
  if (row.revoked) return sendJson(res, 400, { ok: false, error: 'code revoked' });
  if (row.used_by) return sendJson(res, 409, { ok: false, error: 'code already used' });
  // Conditional update: only PATCH rows where used_by IS NULL — guards against two simultaneous claims.
  // (PostgREST: ?used_by=is.null forces the server-side check.)
  try {
    const r = await supabaseRequest('PATCH', `/rest/v1/veraa_codes?code=eq.${encodeURIComponent(code)}&used_by=is.null`, { used_by: businessCode, used_at: new Date().toISOString() });
    if (r.status < 200 || r.status >= 300) { console.error('[Veraa] apply error:', r.status, r.text); return sendJson(res, 500, { ok: false, error: 'mark used failed' }); }
  } catch (_) { return sendJson(res, 500, { ok: false, error: 'mark used failed' }); }
  return sendJson(res, 200, { ok: true });
}
async function handleGenerateVeraaCode(res, buf) {
  const clientName = String(parseJsonBody(buf).clientName || '').trim();
  const slug = clientName.toUpperCase().replace(/[^A-Z]/g, '');
  if (!slug) return sendJson(res, 400, { error: 'clientName must contain letters' });
  const code = `VERAA-${slug}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  console.log('[Veraa] generating code →', code); // log the code only — don't log the client/business name (PII minimization)
  // Explicit columns (created_at/revoked have DB defaults, but send them so the row is complete even
  // if a default is ever missing). The proxy uses the SERVICE ROLE client (supabaseRequest), which
  // bypasses RLS — so this insert is not subject to any anon/authenticated policy.
  const row = { code, client_name: clientName, created_at: new Date().toISOString(), revoked: false };
  try {
    console.log('[Veraa] inserting to Supabase...');
    const result = await supabaseRequest('POST', '/rest/v1/veraa_codes', row);
    console.log('[Veraa] insert result:', result.status, result.text);
    // supabaseRequest resolves on ANY HTTP status — a non-2xx here means the insert did NOT persist
    // (this was the bug: the old code returned 200 regardless, so codes vanished on reload).
    if (result.status < 200 || result.status >= 300) {
      console.error('[Veraa] insert error:', result.status, result.text);
      return sendJson(res, 500, { error: `Could not save code (HTTP ${result.status}): ${result.text || 'unknown error'}` });
    }
  } catch (e) {
    console.error('[Veraa] insert error:', e && e.message);
    return sendJson(res, 500, { error: (e && e.message) || 'Could not save code to the database' });
  }
  console.log('[Veraa] saved:', code);
  return sendJson(res, 200, { code, clientName });
}
async function handleListVeraaCodes(res) {
  try {
    // All non-revoked codes, newest first.
    const r = await supabaseRequest('GET', '/rest/v1/veraa_codes?select=code,client_name,created_at,used_by,used_at,revoked&revoked=eq.false&order=created_at.desc');
    if (r.status < 200 || r.status >= 300) { console.error('[Veraa] list error:', r.status, r.text); return sendJson(res, 200, { codes: [] }); }
    return sendJson(res, 200, { codes: Array.isArray(r.json) ? r.json : [] });
  } catch (e) { console.error('[Veraa] list error:', e && e.message); return sendJson(res, 200, { codes: [] }); }
}
async function handleRevokeVeraaCode(res, buf) {
  const code = String(parseJsonBody(buf).code || '').toUpperCase().trim();
  if (!code) return sendJson(res, 400, { error: 'code required' });
  try {
    const r = await supabaseRequest('PATCH', `/rest/v1/veraa_codes?code=eq.${encodeURIComponent(code)}`, { revoked: true });
    if (r.status < 200 || r.status >= 300) { console.error('[Veraa] revoke error:', r.status, r.text); return sendJson(res, 500, { error: `Could not revoke code (HTTP ${r.status})` }); }
  } catch (e) { console.error('[Veraa] revoke error:', e && e.message); return sendJson(res, 500, { error: (e && e.message) || 'Could not revoke code' }); }
  return sendJson(res, 200, { ok: true });
}

// ── Billing (Stripe Checkout via browser; webhook updates subscription state) ──────
async function updateBusinessSubscription(businessCode, fields) {
  const sel = await supabaseRequest('GET', `/rest/v1/businesses?select=config&code=eq.${encodeURIComponent(businessCode)}`);
  const config = (Array.isArray(sel.json) && sel.json[0] && sel.json[0].config) ? sel.json[0].config : {};
  const colPatch = {};
  if (fields.subscriptionStatus) colPatch.subscription_status = fields.subscriptionStatus;
  if (fields.stripeCustomerId) colPatch.stripe_customer_id = fields.stripeCustomerId;
  if (fields.partnerCodeUsed) colPatch.partner_code = fields.partnerCodeUsed;
  // Mirror trialStartedAt to the dedicated column so handleBillingStatus's trialDaysLeft math has a
  // real anchor (the column was previously read but never written — defaulted to Date.now() on every
  // poll, which silently gave every business a fresh 3 days).
  if (fields.trialStartedAt) colPatch.trial_started_at = new Date(fields.trialStartedAt).toISOString();
  await supabaseRequest('PATCH', `/rest/v1/businesses?code=eq.${encodeURIComponent(businessCode)}`, { config: { ...config, ...fields }, ...colPatch });
}
async function handleCreateCheckoutSession(res, buf) {
  const stripe = getStripe();
  if (!stripe) return sendJson(res, 503, { error: 'Billing not configured' });
  const body = parseJsonBody(buf);
  const plan = body.plan === 'annual' ? 'annual' : 'monthly';
  const price = plan === 'annual' ? process.env.STRIPE_ANNUAL_PRICE_ID : process.env.STRIPE_PRICE_ID;
  if (!price) return sendJson(res, 503, { error: 'Billing not configured' });
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'], mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      // Collect the card NOW, but don't charge for 3 days (Stripe-managed trial). If the customer
      // cancels before the trial ends they're never charged; otherwise Stripe auto-charges on day 3.
      // missing_payment_method:'cancel' is belt-and-suspenders (we already force card collection).
      subscription_data: { trial_period_days: 3, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } },
      payment_method_collection: 'always',
      // Redirect back to the app root with a flag the SPA detects on load (Option A). The webhook is the
      // source of truth for activation; this flag just triggers an immediate status re-check.
      success_url: (process.env.APP_URL || '') + '?billing-success=1&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: (process.env.APP_URL || '') + '?billing-cancel=1',
      metadata: { businessCode: String(body.businessCode || ''), plan },
    });
    return sendJson(res, 200, { url: session.url, sessionId: session.id });
  } catch (e) { console.warn('[billing] checkout error:', e && e.message); return sendJson(res, 500, { error: 'checkout failed' }); }
}
// Stripe Customer Portal — lets a subscriber update payment, view invoices, switch plan, or cancel.
async function handleCustomerPortal(res, buf) {
  const stripe = getStripe();
  if (!stripe) return sendJson(res, 503, { error: 'Billing not configured' });
  const code = String(parseJsonBody(buf).businessCode || '');
  try {
    const sel = await supabaseRequest('GET', `/rest/v1/businesses?select=config,stripe_customer_id&code=eq.${encodeURIComponent(code)}`);
    const row = Array.isArray(sel.json) && sel.json[0] ? sel.json[0] : null;
    const customer = (row && (row.stripe_customer_id || (row.config && row.config.stripeCustomerId))) || '';
    if (!customer) return sendJson(res, 404, { error: 'No billing account found' });
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: process.env.APP_URL || 'https://app.pricr.veraa.io' });
    return sendJson(res, 200, { url: session.url });
  } catch (e) { console.warn('[billing] portal error:', e && e.message); return sendJson(res, 500, { error: 'portal failed' }); }
}
// Find the business that owns a Stripe customer id (subscription.* events carry the customer, not our
// business code). Returns { code, config } or null.
async function businessByStripeCustomer(customerId) {
  if (!customerId) return null;
  try {
    const r = await supabaseRequest('GET', `/rest/v1/businesses?select=code,config&stripe_customer_id=eq.${encodeURIComponent(customerId)}`);
    return (Array.isArray(r.json) && r.json[0]) ? r.json[0] : null;
  } catch (_) { return null; }
}
// Map a Stripe subscription status → our subscriptionStatus.
function mapStripeStatus(s) {
  if (s === 'active') return 'active';
  if (s === 'trialing') return 'trialing';
  if (s === 'canceled' || s === 'unpaid' || s === 'incomplete_expired') return 'expired';
  return null; // past_due / incomplete → don't downgrade access; handled via payment_failed flag/email
}
function subEndedEmailHtml() {
  return emailShell('<p style="margin:0 0 14px;">Your Pricr subscription has ended.</p><p style="margin:0 0 14px;">Your quote tool, history, and signed documents are safe. Resubscribe anytime to pick up right where you left off.</p>' + ctaButton('Resubscribe →', APP_URL, '#2979FF'), '#2979FF');
}
function paymentFailedEmailHtml() {
  return emailShell('<p style="margin:0 0 14px;">We couldn\'t process your latest Pricr payment.</p><p style="margin:0 0 14px;">Please update your card to keep your account active — open Pricr → Settings → Manage Billing.</p>' + ctaButton('Update payment →', APP_URL, '#EF4444'), '#EF4444');
}

async function handleStripeWebhook(req, res, rawBuf) {
  const stripe = getStripe();
  if (!stripe) return sendJson(res, 503, { error: 'Billing not configured' });
  let event;
  try { event = stripe.webhooks.constructEvent(rawBuf, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { console.warn('[billing] webhook signature failed:', e && e.message); return sendJson(res, 400, { error: 'bad signature' }); }
  // Always 200 quickly so Stripe doesn't retry; do the work best-effort.
  try {
    const obj = event.data && event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        // Card collected + trial started → trialing (NOT active yet; auto-charges on day 3). Also
        // stamps trialStartedAt server-side so the 3-day countdown anchors here and not on a later
        // poll (the column is the source of truth; the client mirrors it locally).
        const code = obj.metadata && obj.metadata.businessCode;
        if (code) await updateBusinessSubscription(code, { subscriptionStatus: 'trialing', stripeCustomerId: obj.customer, stripeSubscriptionId: obj.subscription || undefined, paymentFailed: false, trialStartedAt: Date.now() });
        break;
      }
      case 'customer.subscription.trial_will_end': {
        // The trial is ending → the customer will be charged. Mark active + notify.
        const biz = await businessByStripeCustomer(obj.customer);
        if (biz) {
          await updateBusinessSubscription(biz.code, { subscriptionStatus: 'active', paymentFailed: false });
          sendPushNotification(businessPushToken(biz), 'Your Pricr trial has ended', "You've been charged for your subscription — thank you for subscribing! 🎉");
        }
        break;
      }
      case 'customer.subscription.updated': {
        const biz = await businessByStripeCustomer(obj.customer);
        const mapped = mapStripeStatus(obj.status);
        if (biz && mapped) await updateBusinessSubscription(biz.code, { subscriptionStatus: mapped, ...(mapped === 'active' ? { paymentFailed: false } : {}) });
        break;
      }
      case 'customer.subscription.deleted': {
        const biz = await businessByStripeCustomer(obj.customer);
        if (biz) {
          await updateBusinessSubscription(biz.code, { subscriptionStatus: 'expired' });
          const to = onboardingEmailFor(biz.config); if (to) sendEmail({ to, subject: 'Your Pricr subscription has ended', html: subEndedEmailHtml(), from: ONBOARD_FROM });
        }
        break;
      }
      case 'invoice.payment_failed': {
        const biz = await businessByStripeCustomer(obj.customer);
        if (biz) {
          await updateBusinessSubscription(biz.code, { paymentFailed: true });
          const to = onboardingEmailFor(biz.config); if (to) sendEmail({ to, subject: 'Action needed — your Pricr payment failed', html: paymentFailedEmailHtml(), from: ONBOARD_FROM });
        }
        break;
      }
      default: break;
    }
  } catch (e) { console.warn('[billing] webhook handler error:', e && e.message); }
  return sendJson(res, 200, { received: true });
}
async function handleBillingStatus(res, businessCode) {
  try {
    const r = await supabaseRequest('GET', `/rest/v1/businesses?select=subscription_status,trial_started_at,config&code=eq.${encodeURIComponent(businessCode)}`);
    const row = Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
    const status = (row && (row.subscription_status || (row.config && row.config.subscriptionStatus))) || 'trial';
    const startedRaw = row && (row.trial_started_at || (row.config && row.config.trialStartedAt));
    const started = startedRaw ? new Date(startedRaw).getTime() : Date.now();
    const trialDaysLeft = Math.max(0, 3 - Math.floor((Date.now() - started) / 86400000));
    const isVeraaClient = !!(row && row.config && row.config.isVeraaClient) || status === 'veraa';
    // FEATURE 7 #3: nudge once when the trial has exactly 1 day left.
    if (status === 'trial' && trialDaysLeft === 1) {
      sendPushNotification(row && row.config && row.config.pushToken, 'Your trial ends tomorrow', 'Upgrade to keep access to Pricr — $49/month');
    }
    return sendJson(res, 200, { status, trialDaysLeft, isVeraaClient, monthlyAvailable: !!process.env.STRIPE_PRICE_ID, annualAvailable: !!process.env.STRIPE_ANNUAL_PRICE_ID });
  } catch (_) { return sendJson(res, 200, { status: 'trial', trialDaysLeft: 3, isVeraaClient: false, monthlyAvailable: !!process.env.STRIPE_PRICE_ID, annualAvailable: !!process.env.STRIPE_ANNUAL_PRICE_ID }); }
}

// ── Quote delivery — link only, never a file attachment ─────────────────────────
// Sends a hosted-quote LINK to the customer via email and/or SMS. Two scenarios:
//   signed=false → "Review and sign: <link to /sign/:token>"   (initial quote share)
//   signed=true  → "Your signed quote: <link to /sign/:token/certificate>"   (post-sign delivery)
// Never attaches a file. Carriers and iMessage auto-render the URL into a tap-to-open preview;
// the customer always lands on the hosted page, never downloads "Pricr-Quote.html".
function quoteLinkSmsBody({ bizName, total, link, signed, customerName }) {
  const greet = (customerName && String(customerName).trim()) ? `Hi ${String(customerName).trim()},\n\n` : '';
  if (signed) return `${greet}Your signed quote from ${bizName}: ${link}`;
  return `${greet}Thanks for considering ${bizName}. Here's your quote for ${money(total)}.\n\nReview and sign: ${link}`;
}
function quoteLinkEmailHtml({ bizName, total, link, signed, accent }) {
  const accentColor = accent || '#2979FF';
  const headline = signed ? 'Your signed quote is ready' : 'Your quote is ready';
  const ctaLabel = signed ? 'View signed quote &rarr;' : 'Review &amp; sign &rarr;';
  const blurb = signed
    ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;">Thanks for signing with ${esc(bizName)}. Your signed copy is hosted at the link below — open it any time.</p>`
    : `<p style="margin:0 0 14px;font-size:14px;line-height:1.55;">Thanks for considering ${esc(bizName)}. Tap below to review your quote (${money(total)}) and sign when you're ready.</p>`;
  return emailShell(`<h1 style="margin:0 0 12px;font-size:20px;">${esc(headline)}</h1>${blurb}${ctaButton(ctaLabel, link, accentColor)}<p style="margin:18px 0 0;font-size:12px;color:#94A3B8;">Or paste this into your browser: ${esc(link)}</p>`, accentColor);
}
async function handleSendQuoteLink(req, res, rawBody) {
  let body;
  try { body = JSON.parse(rawBody.toString() || '{}'); }
  catch (_) { return sendJson(res, 400, { ok: false, error: 'invalid body' }); }
  const token = String(body.token || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const signed = !!body.signed;
  if (!token) return sendJson(res, 400, { ok: false, error: 'token required' });
  if (!email && !phone) return sendJson(res, 400, { ok: false, error: 'email or phone required' });
  const ctx = await loadSigningContext(token);
  if (!ctx) return sendJson(res, 404, { ok: false, error: 'quote not found' });
  const pres = (ctx.quote.quote_data && ctx.quote.quote_data.presentation) || {};
  const bizName = pres.businessName || (ctx.business && ctx.business.name) || 'your contractor';
  const total = pres.total != null ? pres.total : (ctx.quote.total || 0);
  const accent = pres.brandColor || (ctx.business && ctx.business.config && ctx.business.config.brand && ctx.business.config.brand.primaryColor) || '#2979FF';
  const customerName = pres.customerName || ctx.quote.customer_name || '';
  const link = signed
    ? `${SIGNING_BASE}/sign/${encodeURIComponent(token)}/certificate`
    : `${SIGNING_BASE}/sign/${encodeURIComponent(token)}`;
  // Fire-and-forget delivery — never block the response on email/SMS providers.
  if (email) {
    sendEmail({
      to: email,
      subject: signed ? `Your signed quote from ${bizName}` : `Your quote from ${bizName}`,
      html: quoteLinkEmailHtml({ bizName, total, link, signed, accent }),
    });
  }
  if (phone) sendSms(phone, quoteLinkSmsBody({ bizName, total, link, signed, customerName }));
  // Audit log the send so the contractor can see where the link went.
  try {
    const log = Array.isArray(ctx.quote.audit_log) ? ctx.quote.audit_log.slice() : [];
    log.push({ event: signed ? 'signed_copy_sent' : 'quote_link_sent', timestamp: new Date().toISOString(), email: email || null, phone_last4: phone ? phoneLast4(phone) : null });
    await supabaseRequest('PATCH', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}`, { audit_log: log });
  } catch (_) { /* audit best-effort */ }
  return sendJson(res, 200, { ok: true, sentEmail: !!email, sentSms: !!phone });
}

// ── FEATURE 3: onboarding email sequence (Resend, fire-and-forget) ──────────────
// Three lifecycle emails, sent at most once each, tracked in config.onboardingEmails. The app
// calls POST /onboarding/check on login/open; this decides which (if any) are now due and sends.
const ONBOARD_FROM = 'Christian at Pricr <christian@veraa.io>';
// Where new-signup notifications go (the Pricr owner). Defaults to christian@veraa.io.
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'christian@veraa.io';
// Resolve the recipient from the business config (same precedence as signing notifications).
function onboardingEmailFor(config) {
  const c = config || {};
  return (c.notificationEmail || c.email || (c.brand && c.brand.email) || '').toString().trim();
}
function emailShell(bodyHtml, accent) {
  const ac = /^#[0-9a-fA-F]{3,8}$/.test(String(accent || '')) ? accent : '#2979FF';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;background:#F1F5F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0A0E1A;">
<div style="max-width:560px;margin:0 auto;padding:24px;">
  <div style="background:#0A0E1A;color:#fff;border-radius:16px 16px 0 0;padding:24px;border-bottom:4px solid ${ac};">
    <div style="font-size:22px;font-weight:800;">Pricr</div>
  </div>
  <div style="background:#fff;border-radius:0 0 16px 16px;padding:28px 24px;line-height:1.6;font-size:15px;">${bodyHtml}</div>
  <div style="text-align:center;color:#94A3B8;font-size:12px;padding:16px;">Pricr · The AI quote tool that pays for itself</div>
</div></body></html>`;
}
const ctaButton = (label, href, accent) => `<a href="${esc(href)}" style="display:inline-block;background:${esc(accent)};color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 28px;border-radius:12px;margin:18px 0;">${esc(label)}</a>`;
// Internal owner notification: a new business just signed up. Sent once per business (welcome gate).
function ownerSignupEmailHtml({ businessName, ownerName, ownerEmail, ownerPhone, trade, code, joined, trialEnds }) {
  return emailShell(`
    <p style="margin:0 0 14px;">A new business just joined Pricr.</p>
    <p style="margin:0 0 6px;"><b>Business:</b> ${esc(businessName)}</p>
    <p style="margin:0 0 6px;"><b>Owner:</b> ${esc(ownerName)}</p>
    <p style="margin:0 0 6px;"><b>Email:</b> ${esc(ownerEmail || '—')}</p>
    <p style="margin:0 0 6px;"><b>Phone:</b> ${esc(ownerPhone || '—')}</p>
    <p style="margin:0 0 6px;"><b>Trade:</b> ${esc(trade)}</p>
    <p style="margin:0 0 6px;"><b>Joined:</b> ${esc(joined)}</p>
    <p style="margin:0 0 6px;"><b>Trial ends:</b> ${esc(trialEnds)}</p>
    <p style="margin:14px 0 6px;"><b>Their business ID:</b> ${esc(code)}</p>
    <p style="margin:14px 0 0;">Reply to their welcome email or text them to help them get their first quote built.</p>
    <p style="margin:14px 0 0;">— Pricr</p>`, '#2979FF');
}
function welcomeEmailHtml(ownerName, accent) {
  return emailShell(`
    <p style="margin:0 0 14px;">Hi ${esc(ownerName)},</p>
    <p style="margin:0 0 14px;">You're set up and ready to go. Here's how to build your first quote:</p>
    <p style="margin:0 0 8px;">📋 <b>1. Import your price list</b> (or use the wizard)</p>
    <p style="margin:0 0 8px;">✅ <b>2. Tap the sections that apply</b> to your job</p>
    <p style="margin:0 0 8px;">✍️ <b>3. Get it signed on the spot</b></p>
    ${ctaButton('Build Your First Quote →', APP_URL, accent)}
    <p style="margin:14px 0 0;color:#475569;font-size:13px;">P.S. Reply to this email anytime — I read every one.</p>`, accent);
}
function day2EmailHtml(ownerName, accent) {
  return emailShell(`
    <p style="margin:0 0 14px;">Hi ${esc(ownerName)},</p>
    <p style="margin:0 0 14px;">The contractors who close the most jobs do one thing differently — they show the client the quote while they're still on site.</p>
    <p style="margin:0 0 14px;">Turn your phone around and tap <b>Show Customer</b> — let them see the total update as you add sections.</p>
    <p style="margin:0 0 14px;">Then tap <b>Review → Sign Now</b>. The whole thing takes 60 seconds.</p>
    ${ctaButton('Try it on your next job →', APP_URL, accent)}`, accent);
}
function trialEndingEmailHtml(ownerName, accent) {
  return emailShell(`
    <p style="margin:0 0 14px;">Hi ${esc(ownerName)},</p>
    <p style="margin:0 0 14px;">Your 3-day trial ends tomorrow.</p>
    <p style="margin:0 0 8px;">Here's what you keep when you upgrade:</p>
    <p style="margin:0 0 6px;">• Unlimited quotes</p>
    <p style="margin:0 0 6px;">• Legal e-signatures</p>
    <p style="margin:0 0 6px;">• SMS verification</p>
    <p style="margin:0 0 14px;">• Everything you've set up stays</p>
    <p style="margin:0 0 14px;"><b>Monthly:</b> $49/month &nbsp;·&nbsp; <b>Annual:</b> $490/year (save $98)</p>
    ${ctaButton('Upgrade Now →', APP_URL, accent)}
    <p style="margin:14px 0 0;color:#475569;font-size:13px;">Questions? Reply to this email.</p>`, accent);
}
async function handleOnboardingCheck(res, rawBody) {
  const { businessCode } = parseJsonBody(rawBody) || {};
  if (!businessCode) return sendJson(res, 400, { error: 'missing businessCode' });
  const enc = encodeURIComponent(businessCode);
  const r = await supabaseRequest('GET', `/rest/v1/businesses?code=eq.${enc}&select=name,config,created_at,trial_started_at&limit=1`);
  const row = Array.isArray(r.json) && r.json[0] ? r.json[0] : null;
  if (!row) return sendJson(res, 200, { ok: true, sent: [] });
  const config = row.config || {};
  const to = onboardingEmailFor(config);
  if (!to) return sendJson(res, 200, { ok: true, sent: [] }); // no recipient on file → nothing to do
  const accent = (config.brand && config.brand.primaryColor) || '#2979FF';
  const ownerName = config.ownerName || row.name || 'there';
  const onboarding = config.onboardingEmails || { welcome: null, day2: null, trialEnding: null };
  const createdMs = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const ageMs = Date.now() - createdMs;
  const startedRaw = row.trial_started_at || config.trialStartedAt;
  const started = startedRaw ? new Date(startedRaw).getTime() : createdMs;
  const trialDaysLeft = Math.max(0, 3 - Math.floor((Date.now() - started) / 86400000));
  const status = config.subscriptionStatus || 'trial';
  const sent = [];
  if (!onboarding.welcome) {
    sendEmail({ to, subject: 'Welcome to Pricr — build your first quote in 5 minutes', html: welcomeEmailHtml(ownerName, accent), from: ONBOARD_FROM });
    onboarding.welcome = Date.now(); sent.push('welcome');
    // First login → notify the Pricr owner of the new signup (email + optional push). Same once-per-
    // business gate as the welcome email. Both are fire-and-forget and never block the response.
    const bizName = row.name || businessCode;
    const trade = (config.schema && config.schema.trade) || 'Not set yet';
    const realOwner = config.ownerName || '—';
    const ownerEmail = config.ownerEmail || config.notificationEmail || (config.brand && config.brand.email) || '';
    const ownerPhone = config.ownerPhone || '';
    const joined = new Date(createdMs).toLocaleString('en-US');
    const trialEnds = new Date(started + 3 * 86400000).toLocaleDateString('en-US');
    sendEmail({ to: OWNER_EMAIL, subject: `🎉 New Pricr signup — ${bizName}`, html: ownerSignupEmailHtml({ businessName: bizName, ownerName: realOwner, ownerEmail, ownerPhone, trade, code: businessCode, joined, trialEnds }), from: ONBOARD_FROM });
    sendPushNotification(process.env.OWNER_PUSH_TOKEN, '🎉 New Pricr signup!', `${bizName} · ${trade} · ${ownerPhone || ownerEmail || 'no contact'}`);
  }
  if (!onboarding.day2 && ageMs >= 2 * 86400000) {
    sendEmail({ to, subject: 'The #1 way contractors close more jobs with Pricr', html: day2EmailHtml(ownerName, accent), from: ONBOARD_FROM });
    onboarding.day2 = Date.now(); sent.push('day2');
  }
  if (!onboarding.trialEnding && trialDaysLeft <= 1 && status !== 'veraa' && status !== 'active') {
    sendEmail({ to, subject: 'Your Pricr trial ends tomorrow', html: trialEndingEmailHtml(ownerName, accent), from: ONBOARD_FROM });
    onboarding.trialEnding = Date.now(); sent.push('trialEnding');
  }
  if (sent.length) {
    config.onboardingEmails = onboarding;
    try { await supabaseRequest('PATCH', `/rest/v1/businesses?code=eq.${enc}`, { config }); } catch (_) { /* best-effort; re-sends guarded by created_at windows */ }
  }
  return sendJson(res, 200, { ok: true, sent });
}

const ADMIN_HANDLERS = {
  stats: (res) => handleAdminStats(res),
  'generate-veraa-code': (res, buf) => handleGenerateVeraaCode(res, buf),
  'list-veraa-codes': (res) => handleListVeraaCodes(res),
  'revoke-veraa-code': (res, buf) => handleRevokeVeraaCode(res, buf),
  'platform-analytics': (res) => handleAdminPlatformAnalytics(res),
  search: (res, buf) => handleAdminSearch(res, buf),
  business: (res, buf) => handleAdminBusiness(res, buf),
  'reset-password': (res, buf) => handleAdminResetPassword(res, buf),
  notify: (res, buf) => handleAdminNotify(res, buf),
  'business-action': (res, buf) => handleAdminBusinessAction(res, buf),
  user: (res, buf) => handleAdminUser(res, buf),
};

// ── Anthropic proxy (unchanged behaviour for /v1/messages and anything else) ────
function proxyToAnthropic(req, res, bodyBuf) {
  const apiKey = process.env.ANTHROPIC_KEY;
  const proxy = https.request({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  }, (r) => {
    res.writeHead(r.statusCode, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    r.pipe(res);
  });
  proxy.on('error', () => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'upstream error' })); });
  proxy.write(bodyBuf);
  proxy.end();
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Path without query string.
  const path = (req.url || '/').split('?')[0];
  const submitMatch = path.match(/^\/sign\/([^/]+)\/submit\/?$/);
  const requestCodeMatch = path.match(/^\/sign\/([^/]+)\/request-code\/?$/);
  const verifyCodeMatch = path.match(/^\/sign\/([^/]+)\/verify-code\/?$/);
  const certMatch = path.match(/^\/sign\/([^/]+)\/certificate\/?$/);
  const ogImageMatch = path.match(/^\/og-image\/([^/]+)\/?$/);
  const pageMatch = path.match(/^\/sign\/([^/]+)\/?$/);

  const readBody = (cb) => { const body = []; req.on('data', (c) => body.push(c)); req.on('end', () => cb(Buffer.concat(body))); };

  // Health check (public) — used by the super-admin "proxy ping" + uptime checks.
  if (path === '/health' && req.method === 'GET') { return sendJson(res, 200, { ok: true, ts: Date.now() }); }

  // Super-admin endpoints (POST /admin/<action>) — service role, guarded by a short-lived Bearer
  // token issued by POST /admin/auth (the master code is never compared client-side).
  const adminMatch = path.match(/^\/admin\/([a-z-]+)\/?$/);
  if (adminMatch && req.method === 'POST') {
    const action = adminMatch[1];
    if (!adminConfigured()) return sendJson(res, 503, { error: 'Admin not configured' });
    // Auth handshake: exchange the master code for a session token (timing-safe compare).
    if (action === 'auth') {
      readBody((buf) => {
        const { code } = parseJsonBody(buf);
        if (codeMatches(code)) { return sendJson(res, 200, issueAdminToken()); }
        console.warn('[admin] failed auth attempt');
        return sendJson(res, 401, { error: 'invalid code' });
      });
      return;
    }
    if (!adminAuthed(req)) return sendJson(res, 401, { error: 'unauthorized' });
    if (action === 'export') { handleAdminExport(res).catch(() => sendJson(res, 500, { error: 'export failed' })); return; }
    readBody((buf) => {
      const handler = ADMIN_HANDLERS[action];
      if (!handler) return sendJson(res, 404, { error: 'unknown admin action' });
      Promise.resolve(handler(res, buf)).catch((e) => { console.error('[admin] error:', e && e.message); captureProxyError(e); sendJson(res, 500, { error: 'server error' }); });
    });
    return;
  }

  // ── Billing (public — pre-signup / boot checks) ──
  if (path === '/billing/validate-promo' && req.method === 'POST') { readBody((buf) => handleValidatePromo(res, buf).catch(() => sendJson(res, 500, { error: 'validate failed' }))); return; }
  if (path === '/billing/apply-promo' && req.method === 'POST') { readBody((buf) => handleApplyPromo(res, buf).catch(() => sendJson(res, 500, { ok: false, error: 'apply failed' }))); return; }
  if (path === '/billing/create-checkout-session' && req.method === 'POST') { readBody((buf) => handleCreateCheckoutSession(res, buf).catch(() => sendJson(res, 500, { error: 'checkout failed' }))); return; }
  if (path === '/billing/customer-portal' && req.method === 'POST') { readBody((buf) => handleCustomerPortal(res, buf).catch(() => sendJson(res, 500, { error: 'portal failed' }))); return; }
  if (path === '/billing/webhook' && req.method === 'POST') { readBody((buf) => handleStripeWebhook(req, res, buf).catch(() => sendJson(res, 500, { error: 'webhook failed' }))); return; }
  if (path === '/quote/send-link' && req.method === 'POST') { readBody((buf) => handleSendQuoteLink(req, res, buf).catch(() => sendJson(res, 500, { ok: false, error: 'send failed' }))); return; }
  if (path === '/billing/status' && req.method === 'GET') {
    const code = new URLSearchParams((req.url || '').split('?')[1] || '').get('businessCode') || '';
    handleBillingStatus(res, code).catch(() => sendJson(res, 200, { status: 'trial', trialDaysLeft: 3, isVeraaClient: false }));
    return;
  }

  // ── Onboarding emails (fire-and-forget from the app on login/open) ──
  if (path === '/onboarding/check' && req.method === 'POST') { readBody((buf) => handleOnboardingCheck(res, buf).catch(() => sendJson(res, 200, { ok: false }))); return; }

  if (requestCodeMatch && req.method === 'POST') {
    readBody((buf) => handleRequestCode(req, res, decodeURIComponent(requestCodeMatch[1]), buf));
    return;
  }
  if (verifyCodeMatch && req.method === 'POST') {
    readBody((buf) => handleVerifyCode(req, res, decodeURIComponent(verifyCodeMatch[1]), buf));
    return;
  }
  if (submitMatch && req.method === 'POST') {
    readBody((buf) => handleSignSubmit(req, res, decodeURIComponent(submitMatch[1]), buf));
    return;
  }
  if (ogImageMatch && req.method === 'GET') {
    handleOgImage(res, decodeURIComponent(ogImageMatch[1])).catch(() => { try { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(ogSvg(null, null, '#2979FF')); } catch (_) {} });
    return;
  }
  if (certMatch && req.method === 'GET') {
    handleCertificate(res, decodeURIComponent(certMatch[1]));
    return;
  }
  if (pageMatch && req.method === 'GET') {
    handleSignPage(req, res, decodeURIComponent(pageMatch[1]));
    return;
  }

  // Default: proxy everything else to Anthropic (preserves the existing /v1/messages flow).
  const body = [];
  req.on('data', (chunk) => body.push(chunk));
  req.on('end', () => proxyToAnthropic(req, res, Buffer.concat(body)));
});

// Only listen when run directly (`node proxy.js`); requiring the file (e.g. for tests)
// exposes the pure render helpers below without starting the server.
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[sign] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — the remote signing routes (/sign/:token) will be disabled until they are.');
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn('[sign] RESEND_API_KEY not set — signing-confirmation emails are disabled until it is (signing itself still works).');
  }
  if (!twilioConfigured()) {
    console.warn('[sign] TWILIO_* not set — SMS identity verification is disabled; signing proceeds without it until Twilio is configured.');
  }
  server.listen(PORT, () => console.log(`Pricr proxy running on port ${PORT}`));
}

module.exports = { server, signingPage, stateCard, pageShell, certificatePage, documentHash, stableStringify };

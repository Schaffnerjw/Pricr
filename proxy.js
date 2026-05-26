const https = require('https');
const http = require('http');
const crypto = require('crypto');

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
// Sends an email via Resend. Never throws into the caller — errors are logged only, so a mail
// failure can never block or fail the signing response. No-ops cleanly if RESEND_API_KEY is unset.
function sendEmail({ to, subject, html, attachments }) {
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key || !to) return;
    let resendClient = null;
    try { const { Resend } = require('resend'); resendClient = new Resend(key); } catch (_) { resendClient = null; }
    const payload = { from: FROM_EMAIL, to, subject, html };
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

function pageShell(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:#0A0E1A;color:#0A0E1A;line-height:1.5;}
  .wrap{max-width:560px;margin:0 auto;padding:16px;}
  .card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.35);}
  .hd{background:#0A0E1A;color:#fff;padding:24px 22px;border-bottom:4px solid var(--accent,#2979FF);}
  .hd img{max-height:42px;max-width:200px;display:block;margin-bottom:8px;}
  .hd .biz{font-size:22px;font-weight:800;letter-spacing:-.4px;}
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

function signingPage(token, quote, business) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const accent = pres.brandColor || '#2979FF';
  const bizName = pres.businessName || (business && business.name) || 'Your Contractor';
  const logo = pres.logoUri || (business && business.config && business.config.brand && business.config.brand.logoUri) || '';
  const terms = (business && business.terms_and_conditions) || '';
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
  const header = (logo ? `<img src="${esc(logo)}" alt="${esc(bizName)}"/>` : '') + `<div class="biz">${esc(bizName)}</div>`;
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
    <div class="ttl" style="margin-top:8px;">Fixed price estimate</div>
    <div class="cust">${esc(pres.customerName || quote.customer_name || 'Your Quote')}</div>
    ${rows}
    <div class="total"><span class="l">Total</span><span class="a">${money(total)}</span></div>
    ${dep}
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
  return pageShell('Sign your quote — ' + bizName, body);
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
        const host = (req.headers && req.headers.host) || '';
        const certificateUrl = host ? `https://${host}/sign/${encodeURIComponent(token)}/certificate` : '';
        const tokenShort = String(token).slice(0, 8).toUpperCase();
        // EMAIL 1 — customer confirmation (only if they provided an address) with the signed agreement attached.
        if (signer_email) {
          sendEmail({
            to: signer_email,
            subject: `Your signed quote from ${(ctx.business && ctx.business.name) || 'your contractor'} — Document ID: ${tokenShort}`,
            html: customerEmailHtml(signedQuote, ctx.business, accent, { token, certificateUrl, signedAt }),
            attachments: [{ filename: 'signed-quote.html', content: Buffer.from(signedAgreementHtml(signedQuote, ctx.business, accent)).toString('base64') }],
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

async function handleSignPage(req, res, token) {
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendHtml(res, 404, stateCard('#2979FF', '?', 'Quote not found', 'This signing link is invalid or has expired. Please ask your contractor to resend it.'));
    const accent = (ctx.quote.quote_data && ctx.quote.quote_data.presentation && ctx.quote.quote_data.presentation.brandColor) || '#2979FF';
    if (ctx.quote.signed_at) {
      const biz = (ctx.business && ctx.business.name) || 'Your contractor';
      return sendHtml(res, 200, stateCard(accent, '&#10003;', 'Already signed', 'This quote has already been accepted. ' + biz + ' will be in touch to confirm.'));
    }
    // Log a "quote_viewed" event (fire-and-forget — does not block rendering the page).
    appendAuditEvent(token, ctx.quote.audit_log, {
      event: 'quote_viewed', timestamp: new Date().toISOString(), ip: clientIp(req), user_agent: userAgent(req),
    });
    return sendHtml(res, 200, signingPage(token, ctx.quote, ctx.business));
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
  const pageMatch = path.match(/^\/sign\/([^/]+)\/?$/);

  const readBody = (cb) => { const body = []; req.on('data', (c) => body.push(c)); req.on('end', () => cb(Buffer.concat(body))); };

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

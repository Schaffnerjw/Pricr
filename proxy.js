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
  .state h1{font-size:22px;margin-bottom:10px;} .state p{color:#475569;}
  .check{width:64px;height:64px;border-radius:50%;background:var(--accent,#2979FF);color:#fff;font-size:34px;line-height:64px;margin:0 auto 18px;}
  .err{color:#EF4444;font-size:13px;margin-top:10px;text-align:center;min-height:18px;}
</style></head><body><div class="wrap"><div class="card">${bodyHtml}</div>
<p class="muted">Powered by Pricr</p></div></body></html>`;
}

function stateCard(accent, emoji, title, body) {
  return pageShell(title, `<div class="bd" style="--accent:${esc(accent)}"><div class="state"><div class="check">${emoji}</div><h1>${esc(title)}</h1><p>${esc(body)}</p></div></div>`);
}

function signingPage(token, quote, business) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const accent = pres.brandColor || '#2979FF';
  const bizName = pres.businessName || (business && business.name) || 'Your Contractor';
  const logo = pres.logoUri || (business && business.config && business.config.brand && business.config.brand.logoUri) || '';
  const terms = (business && business.terms_and_conditions) || '';
  const lineItems = Array.isArray(pres.lineItems) ? pres.lineItems : [];
  const total = pres.total != null ? pres.total : (quote.total || 0);

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
    ? `<div class="sec"><div class="lbl">Terms &amp; Conditions</div><div class="terms">${esc(terms)}</div>
        <label class="chk"><input type="checkbox" id="agree"/><span>I have read and agree to the terms and conditions</span></label></div>`
    : '';

  const data = jsonForScript({ token, hasTerms: !!terms.trim(), bizName });

  const body = `<div class="hd" style="--accent:${esc(accent)}">${header}</div>
<div class="bd" style="--accent:${esc(accent)}">
  <div class="ttl">Fixed price estimate</div>
  <div class="cust">${esc(pres.customerName || quote.customer_name || 'Your Quote')}</div>
  ${rows}
  <div class="total"><span class="l">Total</span><span class="a">${money(total)}</span></div>
  ${dep}
  ${paySec}
  ${termsSec}
  <div class="sec">
    <div class="lbl">Your Signature</div>
    <div class="sigbox"><canvas id="pad"></canvas></div>
    <div class="sigtools"><button type="button" class="clear" id="clear">Clear</button></div>
  </div>
  <div class="sec">
    <div class="lbl">Your Name</div>
    <input class="name" id="cname" type="text" placeholder="Type your full name" value="${esc(pres.customerName || quote.customer_name || '')}"/>
  </div>
  <div class="sec">
    <div class="lbl">Your email address <span style="font-weight:400;color:#64748B;">(optional — to receive a copy of the signed quote)</span></div>
    <input class="name" id="cemail" type="email" placeholder="you@example.com" autocomplete="email"/>
  </div>
  <button class="btn" id="submit" disabled>Sign &amp; Accept</button>
  <div class="err" id="err"></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
<script>
(function(){
  var D = ${data};
  var canvas = document.getElementById('pad');
  var pad = new SignaturePad(canvas, { penColor:'#0A0E1A', backgroundColor:'#FFFFFF' });
  function resize(){ var r = Math.max(window.devicePixelRatio||1,1); var w=canvas.offsetWidth, h=canvas.offsetHeight; canvas.width=w*r; canvas.height=h*r; canvas.getContext('2d').scale(r,r); pad.clear(); }
  window.addEventListener('resize', resize); setTimeout(resize, 30);
  var agree = document.getElementById('agree');
  var submit = document.getElementById('submit');
  var cname = document.getElementById('cname');
  var cemail = document.getElementById('cemail');
  var err = document.getElementById('err');
  function refresh(){
    var ok = !pad.isEmpty() && cname.value.trim().length > 0 && (!D.hasTerms || (agree && agree.checked));
    submit.disabled = !ok;
  }
  pad.addEventListener('endStroke', refresh);
  cname.addEventListener('input', refresh);
  if (agree) agree.addEventListener('change', refresh);
  document.getElementById('clear').addEventListener('click', function(){ pad.clear(); refresh(); });
  submit.addEventListener('click', function(){
    if (submit.disabled) return;
    submit.disabled = true; submit.textContent = 'Submitting…'; err.textContent='';
    fetch('/sign/' + encodeURIComponent(D.token) + '/submit', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ signature_data: pad.toDataURL('image/png'), customer_name: cname.value.trim(), signer_email: (cemail && cemail.value.trim()) || '' })
    }).then(function(r){ return r.json().then(function(j){ return { ok:r.ok, j:j }; }); })
      .then(function(res){
        if (res.ok && res.j && res.j.ok) {
          document.querySelector('.card').innerHTML =
            '<div class="bd" style="--accent:${esc(accent)}"><div class="state"><div class="check">&#10003;</div><h1>Quote accepted</h1><p>' + D.bizName + ' will be in touch to confirm.</p></div></div>';
        } else {
          err.textContent = (res.j && res.j.error) || 'Something went wrong. Please try again.';
          submit.disabled = false; submit.textContent = 'Sign & Accept';
        }
      }).catch(function(){ err.textContent='Network error. Please try again.'; submit.disabled=false; submit.textContent='Sign & Accept'; });
  });
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
function customerEmailHtml(quote, business, accent) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const bizName = pres.businessName || (business && business.name) || 'Your contractor';
  const logo = pres.logoUri || (business && business.config && business.config.brand && business.config.brand.logoUri) || '';
  const name = pres.customerName || quote.customer_name || 'there';
  const total = pres.total != null ? pres.total : (quote.total || 0);
  const contactBits = [pres.phone, pres.email, pres.address].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
  const depLine = (pres.depositPct > 0 && total > 0)
    ? `<tr><td style="padding:8px 0;color:#1E2640;">${esc(pres.depositPct)}% deposit due today</td><td style="padding:8px 0;text-align:right;font-weight:700;color:${esc(accent)};">${money(pres.deposit)}</td></tr>`
    : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A0E1A;">
    <div style="background:#0A0E1A;color:#fff;padding:24px 22px;border-bottom:4px solid ${esc(accent)};border-radius:12px 12px 0 0;">
      ${logo ? `<img src="${esc(logo)}" alt="${esc(bizName)}" style="max-height:40px;max-width:200px;display:block;margin-bottom:8px;"/>` : ''}
      <div style="font-size:22px;font-weight:800;">${esc(bizName)}</div>
    </div>
    <div style="padding:24px 22px;background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
      <p style="font-size:16px;margin:0 0 14px;">Thank you for signing your quote, ${esc(name)}.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">${emailSummaryRows(pres)}
        <tr><td style="padding:14px 0 0;font-size:16px;font-weight:800;">Total</td><td style="padding:14px 0 0;text-align:right;font-size:20px;font-weight:800;color:${esc(accent)};">${money(total)}</td></tr>
        ${depLine}
      </table>
      <p style="font-size:14px;color:#475569;margin:18px 0 0;">A copy of your signed agreement is attached.</p>
      ${contactBits ? `<p style="font-size:12px;color:#64748B;margin:18px 0 0;border-top:1px solid #E2E8F0;padding-top:14px;">${contactBits}</p>` : ''}
    </div>
    <p style="text-align:center;color:#94A3B8;font-size:12px;margin:14px 0;">Powered by Pricr</p>
  </div>`;
}

// Notification email for the contractor with signing details + a Certificate link.
function contractorEmailHtml(quote, business, accent, audit, certificateUrl) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const bizName = pres.businessName || (business && business.name) || 'Your business';
  const name = pres.customerName || quote.customer_name || 'A customer';
  const total = pres.total != null ? pres.total : (quote.total || 0);
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A0E1A;">
    <div style="background:#0A0E1A;color:#fff;padding:24px 22px;border-bottom:4px solid ${esc(accent)};border-radius:12px 12px 0 0;">
      <div style="font-size:13px;letter-spacing:1.5px;font-weight:700;color:${esc(accent)};text-transform:uppercase;">Quote signed</div>
      <div style="font-size:22px;font-weight:800;margin-top:4px;">${esc(name)} — ${money(total)}</div>
    </div>
    <div style="padding:24px 22px;background:#fff;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px;">
      <p style="font-size:16px;margin:0 0 16px;"><strong>${esc(name)}</strong> just signed their quote for <strong>${money(total)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#475569;margin-bottom:8px;">
        <tr><td style="padding:5px 0;">Signed</td><td style="padding:5px 0;text-align:right;color:#0A0E1A;">${esc(fmtDateTime(audit.signedAt))}</td></tr>
        <tr><td style="padding:5px 0;">IP address</td><td style="padding:5px 0;text-align:right;color:#0A0E1A;">${esc(audit.ip || 'unknown')}</td></tr>
        <tr><td style="padding:5px 0;">Browser</td><td style="padding:5px 0;text-align:right;color:#0A0E1A;">${esc(audit.userAgent || 'unknown')}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:8px;">${emailSummaryRows(pres)}
        <tr><td style="padding:14px 0 0;font-size:16px;font-weight:800;">Total</td><td style="padding:14px 0 0;text-align:right;font-size:20px;font-weight:800;color:${esc(accent)};">${money(total)}</td></tr>
      </table>
      <p style="margin:20px 0 8px;"><a href="${esc(APP_URL)}" style="display:inline-block;background:${esc(accent)};color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">Log in to Pricr to view the full signed quote</a></p>
      <p style="font-size:13px;margin:10px 0 0;"><a href="${esc(certificateUrl)}" style="color:${esc(accent)};font-weight:600;">View Certificate of Completion</a></p>
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

// ── Certificate of Completion (Part 5) ─────────────────────────────────────────
// Public (token is the access control). Shows the full audit trail for a signed quote.
function certificatePage(token, quote, business) {
  const pres = (quote.quote_data && quote.quote_data.presentation) || {};
  const accent = pres.brandColor || '#2979FF';
  const bizName = pres.businessName || (business && business.name) || 'Your contractor';
  const name = pres.customerName || quote.customer_name || '—';
  const total = pres.total != null ? pres.total : (quote.total || 0);
  const hash = documentHash(quote.quote_data);
  const signedAt = quote.signed_at ? new Date(quote.signed_at).getTime() : null;
  const events = Array.isArray(quote.audit_log) ? quote.audit_log : [];
  const eventLabel = (e) => e === 'quote_viewed' ? 'Quote viewed' : e === 'quote_signed' ? 'Quote signed' : esc(e);

  const fieldRow = (label, value) =>
    `<div class="frow"><div class="fl">${esc(label)}</div><div class="fv">${value}</div></div>`;
  const eventsHtml = events.length
    ? events.map((ev) => `<div class="ev"><div class="evh"><span class="evt">${eventLabel(ev.event)}</span><span class="evd">${esc(fmtDateTime(ev.timestamp))}</span></div>` +
        `<div class="evm">IP ${esc(ev.ip || 'unknown')} · ${esc(ev.user_agent || 'unknown')}${ev.customer_name ? ' · ' + esc(ev.customer_name) : ''}</div></div>`).join('')
    : '<div class="evm">No events recorded.</div>';

  const body = `<div class="hd" style="--accent:${esc(accent)}"><div class="biz">Certificate of Completion</div><div class="sub">${esc(bizName)}</div></div>
<div class="bd" style="--accent:${esc(accent)}">
  ${fieldRow('Customer', esc(name))}
  ${fieldRow('Total amount', money(total))}
  ${fieldRow('Status', quote.signed_at ? '<span class="ok">Signed &amp; accepted</span>' : 'Awaiting signature')}
  ${signedAt ? fieldRow('Signed', esc(fmtDateTime(signedAt))) : ''}
  ${fieldRow('Signer IP', esc(quote.signer_ip || '—'))}
  ${fieldRow('Signer browser', esc(quote.signer_user_agent || '—'))}
  ${quote.signer_email ? fieldRow('Signer email', esc(quote.signer_email)) : ''}
  ${fieldRow('Quote ID', esc(quote.id || '—'))}
  ${fieldRow('Signing token', `<span class="mono">${esc(token)}</span>`)}
  ${fieldRow('Document hash (SHA-256)', `<span class="mono hash">${esc(hash)}</span>`)}
  <div class="sec"><div class="lbl">Audit log</div>${eventsHtml}</div>
  <div class="foot">This document was electronically signed using Pricr.</div>
</div>`;

  const extraCss = `
  .sub{font-size:14px;color:#94A3B8;margin-top:4px;}
  .frow{display:flex;justify-content:space-between;gap:16px;padding:11px 0;border-bottom:1px solid #E2E8F0;font-size:14px;}
  .fl{color:#64748B;} .fv{font-weight:600;text-align:right;word-break:break-word;}
  .ok{color:#10B981;font-weight:700;}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;} .hash{font-weight:400;color:#475569;}
  .ev{padding:10px 0;border-bottom:1px solid #F1F5F9;} .evh{display:flex;justify-content:space-between;gap:10px;}
  .evt{font-weight:700;font-size:13px;} .evd{color:#64748B;font-size:12px;} .evm{color:#64748B;font-size:12px;margin-top:2px;word-break:break-word;}
  .foot{margin-top:24px;text-align:center;color:#94A3B8;font-size:12px;}`;
  // Reuse the page shell but inject the certificate-specific styles before </style>.
  return pageShell('Certificate of Completion — ' + bizName, body).replace('</style>', extraCss + '</style>');
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
  if (!signature_data) return sendJson(res, 400, { error: 'Signature is required' });
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendJson(res, 404, { error: 'This quote could not be found.' });
    if (ctx.quote.signed_at) return sendJson(res, 409, { error: 'This quote has already been signed.' });
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
      customer_name: customer_name || ctx.quote.customer_name || null, document_hash: docHash,
    });
    const upd = await supabaseRequest('PATCH', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}`, {
      signature_data,
      signed_at: new Date(signedAt).toISOString(),
      status: 'accepted',
      customer_name: customer_name || ctx.quote.customer_name || null,
      signer_ip: ip || null,
      signer_user_agent: ua || null,
      signer_email: signer_email || null,
      audit_log: auditLog,
      quote_data: merged,
      updated_at: new Date(signedAt).toISOString(),
    });
    if (upd.status >= 200 && upd.status < 300) {
      // Fire-and-forget email delivery — never block (or fail) the signing response on email.
      try {
        const signedQuote = Object.assign({}, ctx.quote, {
          quote_data: merged, signature_data, signed_at: new Date(signedAt).toISOString(),
          customer_name: customer_name || ctx.quote.customer_name || null, signer_email: signer_email || null,
        });
        const accent = (merged.presentation && merged.presentation.brandColor) || '#2979FF';
        const host = (req.headers && req.headers.host) || '';
        const certificateUrl = host ? `https://${host}/sign/${encodeURIComponent(token)}/certificate` : '';
        // EMAIL 1 — customer confirmation (only if they provided an address) with the signed agreement attached.
        if (signer_email) {
          sendEmail({
            to: signer_email,
            subject: `Your signed quote from ${(ctx.business && ctx.business.name) || 'your contractor'}`,
            html: customerEmailHtml(signedQuote, ctx.business, accent),
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
            subject: `Quote signed — ${name} — ${money(total)}`,
            html: contractorEmailHtml(signedQuote, ctx.business, accent, { signedAt, ip, userAgent: ua }, certificateUrl),
          });
        }
      } catch (e) { console.warn('[sign] email trigger error:', e && e.message); }
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 500, { error: 'Could not save your signature. Please try again.' });
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
  const certMatch = path.match(/^\/sign\/([^/]+)\/certificate\/?$/);
  const pageMatch = path.match(/^\/sign\/([^/]+)\/?$/);

  if (submitMatch && req.method === 'POST') {
    const body = [];
    req.on('data', (c) => body.push(c));
    req.on('end', () => handleSignSubmit(req, res, decodeURIComponent(submitMatch[1]), Buffer.concat(body)));
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
  server.listen(PORT, () => console.log(`Pricr proxy running on port ${PORT}`));
}

module.exports = { server, signingPage, stateCard, pageShell, certificatePage, documentHash, stableStringify };

const https = require('https');
const http = require('http');

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
      body: JSON.stringify({ signature_data: pad.toDataURL('image/png'), customer_name: cname.value.trim() })
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

// ── Request/response helpers ───────────────────────────────────────────────────
function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(html);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

async function handleSignSubmit(res, token, rawBody) {
  let parsed;
  try { parsed = JSON.parse(rawBody.toString() || '{}'); } catch (_) { return sendJson(res, 400, { error: 'Invalid request body' }); }
  const signature_data = parsed.signature_data;
  const customer_name = (parsed.customer_name || '').toString().trim();
  if (!signature_data) return sendJson(res, 400, { error: 'Signature is required' });
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendJson(res, 404, { error: 'This quote could not be found.' });
    if (ctx.quote.signed_at) return sendJson(res, 409, { error: 'This quote has already been signed.' });
    const signedAt = Date.now();
    const merged = Object.assign({}, ctx.quote.quote_data || {}, {
      signatureData: signature_data, signedAt, status: 'won',
      ...(customer_name ? { customerName: customer_name } : {}),
    });
    const upd = await supabaseRequest('PATCH', `/rest/v1/quotes?signing_token=eq.${encodeURIComponent(token)}`, {
      signature_data,
      signed_at: new Date(signedAt).toISOString(),
      status: 'accepted',
      customer_name: customer_name || ctx.quote.customer_name || null,
      quote_data: merged,
      updated_at: new Date(signedAt).toISOString(),
    });
    if (upd.status >= 200 && upd.status < 300) return sendJson(res, 200, { ok: true });
    return sendJson(res, 500, { error: 'Could not save your signature. Please try again.' });
  } catch (e) {
    return sendJson(res, 500, { error: 'Server error. Please try again.' });
  }
}

async function handleSignPage(res, token) {
  try {
    const ctx = await loadSigningContext(token);
    if (!ctx) return sendHtml(res, 404, stateCard('#2979FF', '?', 'Quote not found', 'This signing link is invalid or has expired. Please ask your contractor to resend it.'));
    const accent = (ctx.quote.quote_data && ctx.quote.quote_data.presentation && ctx.quote.quote_data.presentation.brandColor) || '#2979FF';
    if (ctx.quote.signed_at) {
      const biz = (ctx.business && ctx.business.name) || 'Your contractor';
      return sendHtml(res, 200, stateCard(accent, '&#10003;', 'Already signed', 'This quote has already been accepted. ' + biz + ' will be in touch to confirm.'));
    }
    return sendHtml(res, 200, signingPage(token, ctx.quote, ctx.business));
  } catch (e) {
    return sendHtml(res, 500, stateCard('#2979FF', '!', 'Something went wrong', 'We could not load this quote right now. Please try again shortly.'));
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
  const pageMatch = path.match(/^\/sign\/([^/]+)\/?$/);

  if (submitMatch && req.method === 'POST') {
    const body = [];
    req.on('data', (c) => body.push(c));
    req.on('end', () => handleSignSubmit(res, decodeURIComponent(submitMatch[1]), Buffer.concat(body)));
    return;
  }
  if (pageMatch && req.method === 'GET') {
    handleSignPage(res, decodeURIComponent(pageMatch[1]));
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
  server.listen(PORT, () => console.log(`Pricr proxy running on port ${PORT}`));
}

module.exports = { server, signingPage, stateCard, pageShell };

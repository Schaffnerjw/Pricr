/* Pricr "Get the App" button — self-contained, zero-dependency vanilla JS.
 * Embed on the marketing site (GHL) with:
 *   <div id="pricr-install"></div>
 *   <script src="https://app.pricr.veraa.io/install-button.js"></script>
 * Behaviour by device:
 *   iPhone/iPad → overlay: open in Safari + "Share → Add to Home Screen" instructions
 *   Android     → opens app.pricr.veraa.io (the PWA then offers native install)
 *   Desktop     → overlay with a QR code (qrcodejs from cdnjs) pointing at the app
 */
(function () {
  var APP_URL = "https://app.pricr.veraa.io";
  var BLUE = "#2979FF";
  var mount = document.getElementById("pricr-install");
  if (!mount) return;

  var ua = navigator.userAgent || "";
  var isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  var isAndroid = /android/i.test(ua);
  var isMobile = isIOS || isAndroid;

  // ── styles (scoped, injected once) ──
  if (!document.getElementById("pricr-install-style")) {
    var st = document.createElement("style");
    st.id = "pricr-install-style";
    st.textContent =
      ".pricr-btn{display:inline-flex;align-items:center;gap:8px;background:" + BLUE + ";color:#fff;border:none;" +
      "font:700 16px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:14px 22px;border-radius:12px;" +
      "cursor:pointer;text-decoration:none;box-shadow:0 6px 20px rgba(41,121,255,.35);transition:transform .12s ease;}" +
      ".pricr-btn:hover{transform:translateY(-1px);}" +
      ".pricr-ov{position:fixed;inset:0;background:rgba(10,14,26,.72);display:flex;align-items:center;justify-content:center;z-index:2147483647;padding:20px;}" +
      ".pricr-card{background:#fff;border-radius:18px;max-width:360px;width:100%;padding:26px 24px;text-align:center;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.4);}" +
      ".pricr-card h3{margin:0 0 10px;font-size:20px;color:#0A0E1A;}" +
      ".pricr-card p{margin:0 0 16px;color:#475569;font-size:14px;line-height:1.5;}" +
      ".pricr-card a.pricr-go{display:inline-block;background:" + BLUE + ";color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;margin-bottom:12px;}" +
      ".pricr-qr{display:flex;justify-content:center;margin:6px 0 14px;}" +
      ".pricr-url{font-size:13px;color:" + BLUE + ";word-break:break-all;}" +
      ".pricr-x{margin-top:8px;background:none;border:none;color:#94A3B8;font-size:14px;cursor:pointer;}";
    document.head.appendChild(st);
  }

  function overlay(innerHtml) {
    var ov = document.createElement("div");
    ov.className = "pricr-ov";
    ov.innerHTML = '<div class="pricr-card">' + innerHtml + '<button class="pricr-x">Close</button></div>';
    function close(e) { if (e.target === ov || (e.target.className === "pricr-x")) ov.remove(); }
    ov.addEventListener("click", close);
    document.body.appendChild(ov);
    return ov;
  }

  function showIOS() {
    overlay(
      '<h3>Add Pricr to your iPhone</h3>' +
      '<p>Open the app in <b>Safari</b>, tap the <b>Share</b> icon, then choose <b>“Add to Home Screen.”</b></p>' +
      '<a class="pricr-go" href="' + APP_URL + '" target="_blank" rel="noopener">Open Pricr in Safari</a>'
    );
  }

  function showDesktop() {
    var ov = overlay(
      '<h3>Open Pricr on your phone</h3>' +
      '<p>Scan this code with your phone camera to open the app, then add it to your home screen.</p>' +
      '<div class="pricr-qr" id="pricr-qr"></div>' +
      '<div class="pricr-url">' + APP_URL.replace(/^https?:\/\//, "") + '</div>'
    );
    var target = ov.querySelector("#pricr-qr");
    function render() {
      try { new window.QRCode(target, { text: APP_URL, width: 180, height: 180, colorDark: "#0A0E1A", colorLight: "#ffffff" }); }
      catch (e) { target.innerHTML = '<a href="' + APP_URL + '" target="_blank" rel="noopener">' + APP_URL + '</a>'; }
    }
    if (window.QRCode) { render(); }
    else {
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      s.onload = render;
      s.onerror = function () { target.innerHTML = '<a href="' + APP_URL + '" target="_blank" rel="noopener">' + APP_URL + '</a>'; };
      document.head.appendChild(s);
    }
  }

  // ── render the button ──
  var btn = document.createElement(isAndroid ? "a" : "button");
  btn.className = "pricr-btn";
  btn.innerHTML = "📲 Get the App";
  if (isAndroid) { btn.setAttribute("href", APP_URL); btn.setAttribute("target", "_blank"); btn.setAttribute("rel", "noopener"); }
  else { btn.addEventListener("click", isIOS ? showIOS : showDesktop); }
  mount.appendChild(btn);
})();

// Generates the Pricr. wordmark logo assets (icon, splash, favicon, PWA icons, horizontal
// wordmark) from the Syne Bold font. Run: node scripts/generate-logo.js  (npm run logo)
// Brand: midnight #0A0E1A background, "Pricr" white + "." electric blue #2979FF, Syne Bold.
const fs = require("fs");
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

const ROOT = path.join(__dirname, "..");
const TTF = path.join(ROOT, "node_modules", "@expo-google-fonts", "syne", "700Bold", "Syne_700Bold.ttf");
if (!fs.existsSync(TTF)) { console.error("Syne Bold TTF not found:", TTF); process.exit(1); }
GlobalFonts.registerFromPath(TTF, "SyneBold");

const MIDNIGHT = "#0A0E1A";
const WHITE = "#FFFFFF";
const BLUE = "#2979FF";

// Draws "Pricr." centered, sized so the whole wordmark spans `frac` of the canvas width.
function render(width, height, frac, outRel) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = MIDNIGHT;
  ctx.fillRect(0, 0, width, height);

  // Scale the font so "Pricr." width ≈ width * frac.
  const target = width * frac;
  ctx.font = "100px SyneBold";
  const at100 = ctx.measureText("Pricr.").width;
  const fontSize = (100 * target) / at100;
  ctx.font = `${fontSize}px SyneBold`;

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const fullW = ctx.measureText("Pricr.").width;
  const pricrW = ctx.measureText("Pricr").width;
  const startX = (width - fullW) / 2;
  const y = height / 2;

  ctx.fillStyle = WHITE;
  ctx.fillText("Pricr", startX, y);
  ctx.fillStyle = BLUE;
  ctx.fillText(".", startX + pricrW, y);

  const out = path.join(ROOT, outRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log("wrote", outRel, `(${width}x${height})`);
}

// [width, height, wordmark fraction of width, output path]
const TARGETS = [
  [1024, 1024, 0.63, "assets/images/icon.png"],          // app / store icon — wordmark fills the canvas
  [1024, 1024, 0.63, "assets/images/splash-icon.png"],   // native splash (expo-splash-screen)
  [2048, 2048, 0.5, "assets/images/splash.png"],         // 2048 splash asset
  [64, 64, 0.78, "assets/images/favicon.png"],           // browser tab
  [400, 120, 0.8, "assets/images/logo-horizontal.png"],  // app nav header
  [192, 192, 0.64, "public/icons/icon-192.png"],         // PWA manifest
  [512, 512, 0.63, "public/icons/icon-512.png"],         // PWA manifest
];

for (const [w, h, frac, out] of TARGETS) render(w, h, frac, out);
console.log("done.");

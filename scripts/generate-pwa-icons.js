// Generates the PWA icons (public/icons/icon-192.png and icon-512.png) from the app icon.
// Run with: node scripts/generate-pwa-icons.js   (also wired as `npm run pwa:icons`)
// Uses jimp (pure JS, no native build) so it runs anywhere CI does.
const path = require("path");
const fs = require("fs");
const { Jimp } = require("jimp");

const SRC = path.join(__dirname, "..", "assets", "images", "icon.png");
const OUT_DIR = path.join(__dirname, "..", "public", "icons");
const SIZES = [192, 512];

(async () => {
  if (!fs.existsSync(SRC)) { console.error("Source icon not found:", SRC); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const size of SIZES) {
    const img = await Jimp.read(SRC);
    img.resize({ w: size, h: size });
    const out = path.join(OUT_DIR, `icon-${size}.png`);
    await img.write(out);
    console.log("wrote", path.relative(path.join(__dirname, ".."), out));
  }
})().catch((e) => { console.error(e); process.exit(1); });

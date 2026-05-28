#!/usr/bin/env node
/* Post-export build stamper. Run AFTER `expo export --platform web`.
 *
 * (1) Rewrites the placeholder CACHE_VERSION in dist/sw.js so /sw.js is byte-different per deploy
 *     — that's what makes the browser's service-worker update check actually trigger (the React
 *     side already listens for `updatefound`; the SW file just needs to change). Without this,
 *     CACHE_VERSION stays "pricr-v1" forever and the existing UpdateBanner never fires.
 *
 * (2) Writes dist/version.json with the same build SHA. A global poll in the app (~5 min) reads
 *     this file and dispatches the same 'pricr-update-available' event the SW pipeline uses —
 *     catches the kept-open-tab case where the browser's own SW-update cadence is too slow
 *     (typically ~24h).
 *
 * SHA source: VERCEL_GIT_COMMIT_SHA (set automatically on Vercel git-linked deploys); falls back
 * to `git rev-parse HEAD` for local builds. */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function buildSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try { return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim(); }
  catch { return "local-" + Date.now(); }
}

const sha = buildSha();
const short = sha.slice(0, 12);
const distDir = path.resolve(__dirname, "..", "dist");

// (1) Stamp dist/sw.js — rewrite the CACHE_VERSION line in place.
const swPath = path.join(distDir, "sw.js");
if (!fs.existsSync(swPath)) {
  console.error("[stamp-build] dist/sw.js not found — did `expo export --platform web` run first?");
  process.exit(1);
}
const orig = fs.readFileSync(swPath, "utf8");
const stamped = orig.replace(/const CACHE_VERSION = "[^"]*";/, `const CACHE_VERSION = "pricr-${short}";`);
if (stamped === orig) {
  console.error("[stamp-build] CACHE_VERSION line not found in dist/sw.js — refusing to deploy a stale-cache build");
  process.exit(1);
}
fs.writeFileSync(swPath, stamped);
console.log(`[stamp-build] dist/sw.js CACHE_VERSION → pricr-${short}`);

// (2) Write dist/version.json — consumed by the runtime poll.
const versionPath = path.join(distDir, "version.json");
const payload = { sha, short, builtAt: new Date().toISOString() };
fs.writeFileSync(versionPath, JSON.stringify(payload));
console.log(`[stamp-build] dist/version.json written (sha=${short})`);

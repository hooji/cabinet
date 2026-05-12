// Visual debug helper. Usage:
//   node screenshot.mjs                          → screenshots/latest.png from http://localhost:3000
//   OUT=screenshots/01-foo.png node screenshot.mjs
//   URL=http://192.168.0.42:3000 node screenshot.mjs
//
// PNGs in screenshots/ are committed so the design state is visible in the repo.

import { chromium } from "playwright";

const url = process.env.URL || "http://localhost:3000";
const out = process.env.OUT || "screenshots/latest.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(`Saved ${out}`);

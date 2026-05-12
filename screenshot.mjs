import { chromium } from "playwright";

const url = process.env.URL || "http://localhost:3000";
const out = process.env.OUT || "screenshot.png";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: out, fullPage: false });
await browser.close();
console.log(`Saved ${out}`);

// Verifies the static export works when loaded via file:// — that the
// asset paths resolve and the WebSocket can still reach the Java bridge.

import { chromium } from "playwright";
import { resolve } from "node:path";

const indexPath = resolve("out/index.html");
const url = `file://${indexPath}`;
console.log(`opening: ${url}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
page.on("requestfailed", (req) => {
  // Skip favicon-ish 404s if any sneak in.
  const u = req.url();
  if (u.startsWith("file://") || u.startsWith("data:")) return;
  errors.push(`requestfailed: ${u} (${req.failure()?.errorText})`);
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.waitForSelector("text=Therapy Room", { timeout: 4000 });

await page.click("text=Eliza (Classic)");
await page.locator("textarea").fill("I feel anxious.");
await page.locator("textarea").press("Enter");

await page.waitForFunction(
  () => document.querySelectorAll("p.whitespace-pre-wrap").length >= 2,
  { timeout: 5000 },
);
await page.waitForTimeout(200);

const bubbles = await page.locator("p.whitespace-pre-wrap").allTextContents();
console.log("bubbles:", bubbles);

await page.screenshot({ path: "screenshots/05-file-protocol-roundtrip.png" });
console.log("→ 05-file-protocol-roundtrip.png");

if (errors.length) {
  console.log("\nERRORS:");
  for (const e of errors) console.log(`  ${e}`);
  process.exit(1);
} else {
  console.log("\n✓ file:// works clean");
}
await browser.close();

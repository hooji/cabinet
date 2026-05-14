// Verify the SHIPPED dist tarball (extracted to /tmp/agent-bridge-ui-0.1.0)
// works correctly via file:// — same way the user is testing.

import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => console.log("[c]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[err]", e.message));

await page.goto("file:///tmp/agent-bridge-ui-0.1.0/index.html", { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.click("text=Eliza (Classic)");
await page.waitForTimeout(500);

await page.locator("textarea").fill("/image");
await page.locator("textarea").press("Enter");
await page.waitForTimeout(2500);

const imgs = await page.$$eval("img", (els) =>
  els.map((e) => ({ srcStart: (e.getAttribute("src") || "").slice(0, 80), alt: e.alt, complete: e.complete, naturalWidth: e.naturalWidth })),
);
console.log("--- img elements ---");
console.log(JSON.stringify(imgs, null, 2));

const html = await page.locator(".markdown-body").last().innerHTML();
console.log("--- last .markdown-body innerHTML (first 600 chars) ---");
console.log(html.slice(0, 600));

await page.screenshot({ path: "/tmp/dist-test.png" });
await browser.close();

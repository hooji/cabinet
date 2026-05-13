// Drives the /math, /image, /pdf viewer demos and saves screenshots.

import { chromium } from "playwright";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.click("text=Eliza (Classic)");
await page.waitForTimeout(400);

const textarea = page.locator("textarea");
const bubbleCount = () => page.locator(".rounded-2xl").count();

async function send(text) {
  const before = await bubbleCount();
  await textarea.fill(text);
  await textarea.press("Enter");
  await page.waitForFunction(
    (n) => document.querySelectorAll(".rounded-2xl").length >= n,
    before + 2,
    { timeout: 8000 },
  );
}

// 1. /math — pure markdown, no file transfer.
await send("/math");
await page.waitForSelector(".katex", { timeout: 4000 });
await page.waitForTimeout(400);
await page.locator(".markdown-body").last().scrollIntoViewIfNeeded();
await page.screenshot({ path: "screenshots/15-math-katex.png" });
console.log("→ 15-math-katex.png");

// 2. /image — file registry + bridge://file/<id> img.
await send("/image");
await page.waitForSelector("img[src^='blob:']", { timeout: 4000 });
await page.waitForTimeout(500);
await page.locator(".markdown-body").last().scrollIntoViewIfNeeded();
await page.screenshot({ path: "screenshots/16-image-viewer.png" });
console.log("→ 16-image-viewer.png");

// 3. /pdf — same plumbing, MIME=application/pdf, iframe.
await send("/pdf");
await page.waitForSelector("iframe[src^='blob:']", { timeout: 4000 });
// Give the browser PDF viewer time to render.
await page.waitForTimeout(1500);
await page.locator(".markdown-body").last().scrollIntoViewIfNeeded();
await page.screenshot({ path: "screenshots/17-pdf-viewer.png" });
console.log("→ 17-pdf-viewer.png");

await browser.close();
console.log("done");

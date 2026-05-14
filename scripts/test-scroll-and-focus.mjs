// Verifies the two bug fixes against the shipped tarball loaded via file://:
//   - Image bubble auto-scrolls into view after the image loads.
//   - Textarea retains keyboard focus through the first /image arrival.

import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto("file:///tmp/agent-bridge-ui-0.1.0/index.html", { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.click("text=Eliza (Classic)");
await page.waitForTimeout(400);

// Focus the textarea (matches the user's flow — they're typing in it).
const textarea = page.locator("textarea");
await textarea.focus();

async function activeElementTag() {
  return await page.evaluate(() => document.activeElement?.tagName ?? "null");
}

console.log("before /image, activeElement:", await activeElementTag());

await textarea.fill("/image");
await textarea.press("Enter");

// Wait for the image bubble to arrive + image to actually load (naturalWidth > 0).
await page.waitForFunction(
  () => {
    const imgs = Array.from(document.querySelectorAll("img"));
    return imgs.some((i) => i.naturalWidth > 0 && i.src.startsWith("blob:"));
  },
  { timeout: 6000 },
);
// Give the resize observer a tick to re-scroll.
await page.waitForTimeout(400);

console.log("after /image (1st), activeElement:", await activeElementTag());

// Test the scroll behavior: is the image bubble fully visible in the
// viewport? The bubble (last .self-start) bottom should be <= scroll
// container's bottom.
const scrollInfo = await page.evaluate(() => {
  const scroll = document.querySelector(".overflow-y-auto");
  if (!scroll) return { ok: false, why: "no scroll container" };
  const lastBubble = document.querySelectorAll(".self-start, .self-end");
  const last = lastBubble[lastBubble.length - 1];
  if (!last) return { ok: false, why: "no bubble" };
  const sr = scroll.getBoundingClientRect();
  const br = last.getBoundingClientRect();
  return {
    ok: br.bottom <= sr.bottom + 1,
    scrollBottom: sr.bottom,
    bubbleBottom: br.bottom,
    bubbleHeight: br.height,
  };
});
console.log("scroll fit:", JSON.stringify(scrollInfo, null, 2));

await page.screenshot({ path: "screenshots/18-image-scrolled-in.png" });

// Second /image — should also keep focus.
await textarea.fill("/image");
await textarea.press("Enter");
await page.waitForTimeout(1500);
console.log("after /image (2nd), activeElement:", await activeElementTag());

await browser.close();
console.log("done");

// Verifies scroll-to-bottom + focus-retention against the shipped tarball
// loaded via file://. Fills the chat first so the auto-scroll actually
// has work to do.

import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto("file:///tmp/agent-bridge-ui-0.1.0/index.html", { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.click("text=Eliza (Classic)");
await page.waitForTimeout(400);

const textarea = page.locator("textarea");
await textarea.focus();

async function send(text) {
  const before = await page.locator(".rounded-2xl").count();
  await textarea.fill(text);
  await textarea.press("Enter");
  await page.waitForFunction(
    (n) => document.querySelectorAll(".rounded-2xl").length >= n,
    before + 2,
    { timeout: 8000 },
  );
}

async function activeTag() {
  return await page.evaluate(() => document.activeElement?.tagName ?? "null");
}

async function scrollState() {
  return await page.evaluate(() => {
    const scroll = document.querySelector(".overflow-y-auto");
    if (!scroll) return null;
    const bubbles = document.querySelectorAll(".self-start, .self-end");
    const last = bubbles[bubbles.length - 1];
    if (!last) return null;
    const sr = scroll.getBoundingClientRect();
    const br = last.getBoundingClientRect();
    return {
      lastBubbleFullyVisible: br.bottom <= sr.bottom + 1,
      lastBubbleTopVisible: br.top >= sr.top - 1,
      distanceFromBottom:
        scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      bubbleHeight: br.height,
    };
  });
}

// 1. Fill the chat with several plain-text replies so scrolling is
//    actually required (each reply is multi-line because ELIZA streams).
for (let i = 0; i < 6; i++) {
  await send("My mother always told me to think harder about this.");
  await page.waitForTimeout(800);
}
const sBefore = await scrollState();
console.log("after 6 messages:", JSON.stringify(sBefore));
if (!sBefore.lastBubbleFullyVisible) {
  console.error("✗ auto-scroll FAILED on plain messages");
  process.exit(1);
}
console.log("✓ plain-message auto-scroll works");

// 2. First /image — focus + scroll.
console.log("\nbefore 1st /image, activeElement:", await activeTag());
await send("/image");
// Wait for the image to actually decode (naturalWidth > 0).
await page.waitForFunction(
  () => Array.from(document.querySelectorAll("img")).some(
    (i) => i.naturalWidth > 0 && i.src.startsWith("blob:"),
  ),
  { timeout: 6000 },
);
await page.waitForTimeout(500);
console.log("after 1st /image, activeElement:", await activeTag());

const s1 = await scrollState();
console.log("scroll state after 1st /image:", JSON.stringify(s1));
if (!s1.lastBubbleFullyVisible) {
  console.error("✗ image bubble NOT fully scrolled into view");
  process.exit(1);
}
console.log("✓ image bubble fully visible");

await page.screenshot({ path: "screenshots/18-image-scrolled-in.png" });

// 3. Second /image — focus should still be on textarea.
console.log("\nbefore 2nd /image, activeElement:", await activeTag());
await send("/image");
await page.waitForTimeout(1200);
console.log("after 2nd /image, activeElement:", await activeTag());

const s2 = await scrollState();
if (!s2.lastBubbleFullyVisible) {
  console.error("✗ 2nd image bubble NOT fully scrolled into view");
  process.exit(1);
}
console.log("✓ 2nd image bubble fully visible");

const finalActive = await activeTag();
if (finalActive !== "TEXTAREA") {
  console.error(`✗ focus lost — active element is ${finalActive}, expected TEXTAREA`);
  process.exit(1);
}
console.log("✓ focus retained on TEXTAREA");

await browser.close();
console.log("\n✓ all checks passed");

// Verifies the rigorous scroll + focus design against the shipped
// tarball loaded via file://.
//
// Cases covered:
//   1. Auto-scroll keeps the latest plain-message bubble in view.
//   2. First /image — bubble fully scrolled in, focus retained.
//   3. Second /image — same.
//   4. User clicks a directive button → focus moves there (not stolen
//      back to the textarea).
//   5. After step 4, sending a normal message restores composer focus
//      via the agent-id-on-select / scroll-to-bottom paths.

import { chromium } from "playwright";

const URL =
  process.env.AGENT_BRIDGE_TEST_URL ||
  "file:///tmp/agent-bridge-ui-0.1.0/index.html";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: "networkidle" });
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

async function lastBubbleVisible() {
  return await page.evaluate(() => {
    const scroll = document.querySelector(".flex-1.overflow-y-auto");
    if (!scroll) return false;
    const bubbles = document.querySelectorAll(".self-start, .self-end");
    const last = bubbles[bubbles.length - 1];
    if (!last) return false;
    const sr = scroll.getBoundingClientRect();
    const br = last.getBoundingClientRect();
    return br.bottom <= sr.bottom + 1 && br.top >= sr.top - 1;
  });
}

function check(label, ok) {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
}

// 1. Fill the chat so scrolling matters.
for (let i = 0; i < 6; i++) {
  await send("My mother always told me to think harder about this.");
  await page.waitForTimeout(800);
}
check("plain-message auto-scroll keeps last bubble visible", await lastBubbleVisible());

// 2. First /image.
check("focus on textarea before 1st /image", (await activeTag()) === "TEXTAREA");
await send("/image");
await page.waitForFunction(
  () => Array.from(document.querySelectorAll("img")).some(
    (i) => i.naturalWidth > 0 && i.src.startsWith("blob:"),
  ),
  { timeout: 6000 },
);
await page.waitForTimeout(500);
check("focus retained after 1st /image", (await activeTag()) === "TEXTAREA");
check("1st image bubble fully visible", await lastBubbleVisible());

await page.screenshot({ path: "screenshots/18-image-scrolled-in.png" });

// 3. Second /image.
await send("/image");
await page.waitForTimeout(1500);
check("focus retained after 2nd /image", (await activeTag()) === "TEXTAREA");
check("2nd image bubble fully visible", await lastBubbleVisible());

// 4. User clicks Pause button — focus should move and NOT be stolen back.
await page.click('button:has-text("Pause")');
await page.waitForTimeout(200);
check(
  "focus moved to button on user click (and stayed there)",
  (await activeTag()) === "BUTTON",
);

// 5. Click back into the textarea, send a plain message — focus stays.
await textarea.click();
await page.waitForTimeout(100);
check("focus back on textarea after user click", (await activeTag()) === "TEXTAREA");
await send("Hello again.");
await page.waitForTimeout(800);
check("focus retained after plain message", (await activeTag()) === "TEXTAREA");
check("plain message bubble fully visible", await lastBubbleVisible());

// 6. Simulate a real user wheeling up (real wheel event triggers our
//    onWheel handler, which sets following=false). Then send a message
//    — bubble should NOT scroll into view (user is browsing scrollback).
const scroll = page.locator(".flex-1.overflow-y-auto");
const scrollBox = await scroll.boundingBox();
if (scrollBox) {
  await page.mouse.move(
    scrollBox.x + scrollBox.width / 2,
    scrollBox.y + scrollBox.height / 2,
  );
  // Wheel "up" (negative deltaY) several times to actually scroll up.
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -100);
}
await page.waitForTimeout(200);
const scrolledBefore = await scroll.evaluate((el) => el.scrollTop);
await textarea.click();
await textarea.fill("Don't yank me.");
await textarea.press("Enter");
await page.waitForTimeout(2500);
const scrolledAfter = await scroll.evaluate((el) => el.scrollTop);
check(
  `user scrolled-up position preserved (was ${scrolledBefore}, now ${scrolledAfter})`,
  Math.abs(scrolledAfter - scrolledBefore) < 30,
);

await browser.close();
console.log("\n✓ all checks passed");

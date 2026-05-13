// Drives the streaming + thinking + anchored-replace demos.
//
// Prereq: Next dev + Java bridge running on :3000 / :9876.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("screenshots", { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();

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

// 1. Long-enough input → streamed reply with a Thinking preamble.
await send("My mother always told me I should think harder.");

// Catch the thinking block while it's actively streaming + collapsed.
await page.waitForSelector("details.thinking", { timeout: 4000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "screenshots/11-thinking-collapsed.png" });
console.log("→ 11-thinking-collapsed.png");

// Wait for the stream to settle, then expand the thinking section.
await page.waitForTimeout(2500);
await page.locator("details.thinking summary").first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: "screenshots/12-thinking-expanded.png" });
console.log("→ 12-thinking-expanded.png");

// 2. /check → anchored-replace checklist demo.
await send("/check");
// Catch it mid-tick (one or two boxes checked).
await page.waitForTimeout(1500);
await page.screenshot({ path: "screenshots/13-checklist-midway.png" });
console.log("→ 13-checklist-midway.png");
// Wait for all three to finish.
await page.waitForTimeout(1500);
await page.screenshot({ path: "screenshots/14-checklist-complete.png" });
console.log("→ 14-checklist-complete.png");

await browser.close();
console.log("done");

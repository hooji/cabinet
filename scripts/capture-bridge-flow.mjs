// Drives the UI through its key states and saves screenshots.
//
// Prereq: Next dev server + Java bridge running on :3000 and :9876.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("screenshots", { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// 1. Connected, fleet visible, nothing selected.
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.waitForSelector("text=Therapy Room");
await page.screenshot({ path: "screenshots/02-connected-fleet.png" });
console.log("→ 02-connected-fleet.png");

// 2. Select the classic ELIZA agent.
await page.click("text=Eliza (Classic)");
await page.waitForSelector("text=Say hello", { state: "visible", timeout: 4000 }).catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshots/03-agent-selected.png" });
console.log("→ 03-agent-selected.png");

// 3. Type a message and send.
const textarea = await page.locator("textarea");
await textarea.fill("I am tired today.");
await textarea.press("Enter");

// Wait for ELIZA's reply (the agent-from message bubble).
await page.waitForFunction(
  () => {
    const bubbles = document.querySelectorAll("section p.whitespace-pre-wrap");
    return bubbles.length >= 2;
  },
  { timeout: 5000 },
);
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshots/04-conversation-roundtrip.png" });
console.log("→ 04-conversation-roundtrip.png");

await browser.close();
console.log("done");

// Drives the UI through its key states and saves screenshots.
//
// Prereq: Next dev server + Java bridge running on :3000 and :9876.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("screenshots", { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// 1. Connected, fleet visible, nothing selected.
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.waitForSelector("text=Therapy Room");
await page.screenshot({ path: "screenshots/02-connected-fleet.png" });
console.log("→ 02-connected-fleet.png");

// 2. Select the classic ELIZA agent — shows the new left-aligned directive bar.
await page.click("text=Eliza (Classic)");
await page.waitForSelector("text=Say hello", { state: "visible", timeout: 4000 }).catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshots/03-agent-selected.png" });
console.log("→ 03-agent-selected.png");

// 3. Send a plain message — captures the new bubble theming + outside status line.
const textarea = page.locator("textarea");
await textarea.fill("I am tired today.");
await textarea.press("Enter");
await page.waitForFunction(
  () => document.querySelectorAll(".rounded-2xl").length >= 2,
  { timeout: 5000 },
);
await page.waitForTimeout(300);
await page.screenshot({ path: "screenshots/04-conversation-roundtrip.png" });
console.log("→ 04-conversation-roundtrip.png");

// 4. Send a markdown-rich message and screenshot the rendered result.
await textarea.fill(
  [
    "Here's some context, with **bold**, *italics*, and `inline code`:",
    "",
    "1. The first item",
    "2. The second item, with a [link](https://example.com)",
    "",
    "```js",
    "const greeting = \"hello\";",
    "console.log(greeting);",
    "```",
    "",
    "> And a blockquote, just because.",
  ].join("\n"),
);
await textarea.press("Enter");
await page.waitForFunction(
  () => document.querySelectorAll(".rounded-2xl").length >= 4,
  { timeout: 5000 },
);
await page.waitForTimeout(400);
await page.screenshot({ path: "screenshots/06-markdown-rendering.png" });
console.log("→ 06-markdown-rendering.png");

// 5. Hover one of the copy icons + click to demonstrate the check state.
const copyButtons = page.locator('button[aria-label^="Copy"]');
const firstCopy = copyButtons.first();
await firstCopy.click();
await page.waitForTimeout(200);
await page.screenshot({ path: "screenshots/07-copy-feedback.png" });
console.log("→ 07-copy-feedback.png");

await browser.close();
console.log("done");

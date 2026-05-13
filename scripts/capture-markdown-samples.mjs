// Drives the UI through the three verification messages from the
// markdown integration spec and saves screenshots.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("screenshots", { recursive: true });

const MESSAGES = [
  {
    name: "08-md-basic-formatting",
    text: [
      "# Heading 1",
      "",
      "## Heading 2",
      "",
      "**Bold**, *italic*, and ***bold italic***. Here's `inline code` and a [link](https://example.com).",
      "",
      "> A blockquote with a **bold** word.",
      "",
      "- Unordered item one",
      "- Unordered item two",
      "  - Nested item",
      "",
      "1. Ordered item one",
      "2. Ordered item two",
    ].join("\n"),
  },
  {
    name: "09-md-code-and-tables",
    text: [
      "```python",
      "def hello():",
      "    print(\"world\")",
      "```",
      "",
      "| Col A | Col B |",
      "| ----- | ----- |",
      "| 1     | 2     |",
    ].join("\n"),
  },
  {
    name: "10-md-edge-gfm",
    text: [
      "Strikethrough: ~~struck~~",
      "",
      "Task list:",
      "- [x] one",
      "- [ ] two",
      "",
      "And a single short sentence after to test rhythm.",
    ].join("\n"),
  },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.click("text=Eliza (Classic)");
await page.waitForSelector("text=Say hello", { state: "visible", timeout: 4000 }).catch(() => {});

let expectedBubbles = 0;
for (const { name, text } of MESSAGES) {
  const textarea = page.locator("textarea");
  await textarea.fill(text);
  await textarea.press("Enter");
  expectedBubbles += 2; // user echo + agent reply
  await page.waitForFunction(
    (n) => document.querySelectorAll(".rounded-2xl").length >= n,
    expectedBubbles,
    { timeout: 8000 },
  );
  await page.waitForTimeout(500);

  // Scroll the most-recent user message into view for a focused screenshot.
  const lastUser = page.locator(".self-end").last();
  await lastUser.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);

  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(`→ ${name}.png`);
}

await browser.close();
console.log("done");

import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("requestfailed", (req) => console.log("[reqfail]", req.url(), req.failure()?.errorText));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.click("text=Eliza (Classic)");
await page.waitForTimeout(500);

const ta = page.locator("textarea");
await ta.fill("# Hello\n\nWith **bold**.");
await ta.press("Enter");
await page.waitForTimeout(4000);

const bubbleCount = await page.locator(".rounded-2xl").count();
const mdBodyCount = await page.locator(".markdown-body").count();
console.log("rounded-2xl bubbles:", bubbleCount);
console.log("markdown-body elements:", mdBodyCount);
const html = await page.locator(".markdown-body").last().innerHTML().catch(() => "(no .markdown-body)");
console.log("---last markdown-body html---");
console.log(html.slice(0, 800));

await page.screenshot({ path: "screenshots/debug-md.png" });
await browser.close();

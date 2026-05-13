import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.click("text=Eliza (Classic)");
await page.waitForTimeout(400);

await page.locator("textarea").fill("/image");
await page.locator("textarea").press("Enter");
await page.waitForTimeout(2500);

const html = await page.locator(".markdown-body").last().innerHTML().catch(() => "(none)");
console.log("--- last .markdown-body innerHTML ---");
console.log(html);

const imgs = await page.$$eval("img", (els) => els.map(e => ({ src: e.src, alt: e.alt })));
console.log("--- imgs ---");
console.log(JSON.stringify(imgs, null, 2));

await page.screenshot({ path: "screenshots/debug-image.png" });
await browser.close();

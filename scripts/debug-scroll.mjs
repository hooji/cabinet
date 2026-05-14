import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on("console", (m) => console.log("[c]", m.type(), m.text()));

await page.goto("file:///tmp/agent-bridge-ui-0.1.0/index.html", { waitUntil: "networkidle" });
await page.waitForSelector("text=connected", { timeout: 8000 });
await page.click("text=Eliza (Classic)");
await page.waitForTimeout(400);

// Patch in some logging
await page.evaluate(() => {
  const scroll = document.querySelector(".flex-1.overflow-y-auto");
  if (!scroll) { console.log("no scroll container"); return; }
  console.log("scroll container found. scrollHeight=" + scroll.scrollHeight + " clientHeight=" + scroll.clientHeight + " scrollTop=" + scroll.scrollTop);
  scroll.addEventListener("scroll", () => {
    console.log("SCROLL evt scrollTop=" + scroll.scrollTop + " scrollHeight=" + scroll.scrollHeight);
  });
});

const textarea = page.locator("textarea");
await textarea.focus();

for (let i = 0; i < 3; i++) {
  await textarea.fill("Test message " + i + " — needs to be long enough to wrap to a few lines for testing the auto-scroll behavior.");
  await textarea.press("Enter");
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => {
    const scroll = document.querySelector(".flex-1.overflow-y-auto");
    return { scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight };
  });
  console.log("after msg " + i + ":", JSON.stringify(state));
}

await page.screenshot({ path: "/tmp/debug-scroll.png" });
await browser.close();

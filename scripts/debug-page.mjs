import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on("console", (msg) => console.log("[browser]", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("requestfailed", (req) =>
  console.log("[req-failed]", req.url(), req.failure()?.errorText),
);

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const body = await page.locator("body").innerText();
console.log("--- BODY TEXT ---");
console.log(body);

await page.screenshot({ path: "screenshots/debug.png" });
await browser.close();

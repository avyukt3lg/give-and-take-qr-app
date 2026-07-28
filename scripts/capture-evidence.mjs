// Capture entry-surface evidence screenshots from a running server.
// Usage: node scripts/capture-evidence.mjs <baseUrl> <outDir> <prefix>
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [baseUrl, outDir, prefix] = process.argv.slice(2);

if (!baseUrl || !outDir || !prefix) {
  console.error(
    "usage: node scripts/capture-evidence.mjs <baseUrl> <outDir> <prefix>",
  );
  process.exit(1);
}

const viewports = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "desktop-1280x640", width: 1280, height: 640 },
  { name: "mobile-390x844", width: 390, height: 844 },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    await page.screenshot({
      path: `${outDir}/${prefix}-entry-${viewport.name}.png`,
    });
    await context.close();
    console.log(`captured ${prefix}-entry-${viewport.name}.png`);
  }
} finally {
  await browser.close();
}

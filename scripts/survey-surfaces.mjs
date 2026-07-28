// Visual survey: every host surface, optionally across themes and widths.
// Usage: node scripts/survey-surfaces.mjs <baseUrl> <outDir>
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [baseUrl, outDir] = process.argv.slice(2);

if (!baseUrl || !outDir) {
  console.error("usage: node scripts/survey-surfaces.mjs <baseUrl> <outDir>");
  process.exit(1);
}

const surfaces = [
  "setup",
  "play",
  "market",
  "players",
  "scoring",
  "export",
  "help",
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

await page.goto(`${baseUrl}?fixture=host`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

for (const [index, surface] of surfaces.entries()) {
  const button = page.locator(".desktop-navigation button").nth(index);
  await button.click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${outDir}/table-${index + 1}-${surface}.png`,
  });
  console.log(`captured table-${index + 1}-${surface}.png`);
}

for (const theme of ["classroom", "contrast"]) {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
  for (const [index, surface] of [
    ["1", "setup"],
    ["2", "play"],
    ["3", "market"],
  ]) {
    await page
      .locator(".desktop-navigation button")
      .nth(Number(index) - 1)
      .click();
    await page.waitForTimeout(900);
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${outDir}/${theme}-${index}-${surface}.png` });
    console.log(`captured ${theme}-${index}-${surface}.png`);
  }
}

await context.close();
await browser.close();

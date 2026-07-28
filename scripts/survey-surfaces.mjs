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

const UI_STORAGE_KEY = "give-and-take:ui:v1";

// The app writes document.documentElement.dataset.theme from reducer state on
// every commit, so setting the attribute from the test realm is overwritten on
// the next render. The theme has to be seeded into the stored UI preferences
// before the app boots, which means a fresh context per theme.
const openSurvey = async (browser, theme) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(
    ([key, value]) => {
      // eslint-disable-next-line no-undef -- runs in the page realm
      window.localStorage.setItem(key, JSON.stringify({ theme: value }));
    },
    [UI_STORAGE_KEY, theme],
  );
  const page = await context.newPage();
  await page.goto(`${baseUrl}?fixture=host`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const applied = await page.getAttribute("html", "data-theme");
  if (applied !== theme) {
    throw new Error(
      `theme "${theme}" did not apply — html[data-theme] is "${applied}". ` +
        `Refusing to capture mislabelled evidence.`,
    );
  }

  return { context, page };
};

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
let { context, page } = await openSurvey(browser, "table");

for (const [index, surface] of surfaces.entries()) {
  const button = page.locator(".desktop-navigation button").nth(index);
  await button.click();
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: `${outDir}/table-${index + 1}-${surface}.png`,
  });
  console.log(`captured table-${index + 1}-${surface}.png`);
}

await context.close();

for (const theme of ["classroom", "contrast"]) {
  ({ context, page } = await openSurvey(browser, theme));

  for (const [index, surface] of [
    ["1", "setup"],
    ["2", "play"],
    ["3", "market"],
  ]) {
    await page
      .locator(".desktop-navigation button")
      .nth(Number(index) - 1)
      .click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}/${theme}-${index}-${surface}.png` });
    console.log(`captured ${theme}-${index}-${surface}.png`);
  }

  await context.close();
}

await browser.close();

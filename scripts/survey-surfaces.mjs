// Visual survey: every host surface, optionally across themes and widths.
// Usage: node scripts/survey-surfaces.mjs <baseUrl> <outDir> [width] [height]
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const [baseUrl, outDir, widthInput = "1440", heightInput = "900"] =
  process.argv.slice(2);

if (!baseUrl || !outDir) {
  console.error(
    "usage: node scripts/survey-surfaces.mjs <baseUrl> <outDir> [width] [height]",
  );
  process.exit(1);
}

const viewport = {
  width: Number(widthInput),
  height: Number(heightInput),
};

if (
  !Number.isInteger(viewport.width) ||
  !Number.isInteger(viewport.height) ||
  viewport.width < 320 ||
  viewport.height < 480
) {
  throw new Error(`invalid survey viewport ${widthInput}x${heightInput}`);
}

const runtimeErrors = [];

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
    viewport,
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
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
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

const selectSurface = async (page, index) => {
  if (viewport.width > 900) {
    await page.locator(".desktop-navigation button").nth(index).click();
    return;
  }

  if (index < 5) {
    await page.locator(".mobile-navigation > button").nth(index).click();
    return;
  }

  await page
    .getByRole("button", { name: "Open more game sections" })
    .click();
  await page.locator(".more-drawer__list button").nth(index - 5).click();
  await page.locator(".more-drawer").waitFor({ state: "hidden" });
};

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
let { context, page } = await openSurvey(browser, "table");

for (const [index, surface] of surfaces.entries()) {
  await selectSurface(page, index);
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
    await selectSurface(page, Number(index) - 1);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}/${theme}-${index}-${surface}.png` });
    console.log(`captured ${theme}-${index}-${surface}.png`);
  }

  await context.close();
}

await browser.close();

if (runtimeErrors.length) {
  throw new Error(
    `surface survey found browser errors:\n${runtimeErrors.join("\n")}`,
  );
}

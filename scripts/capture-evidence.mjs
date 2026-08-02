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

const scenarios = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "tablet-900x900", width: 900, height: 900 },
  { name: "mobile-390x844", width: 390, height: 844 },
  {
    name: "reduced-motion-1440x900",
    width: 1440,
    height: 900,
    reducedMotion: "reduce",
  },
  {
    name: "forced-colors-1440x900",
    width: 1440,
    height: 900,
    forcedColors: "active",
  },
];

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

async function installSessionMock(page) {
  let record = null;
  await page.route(
    /https:\/\/[^/]+\.supabase\.co\/rest\/v1\/rpc\/.*/,
    async (route) => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      const payload = route.request().postDataJSON() ?? {};
      if (
        name === "create_game_session_public" ||
        name === "update_game_session_public"
      ) {
        const session = payload.p_session;
        record = {
          id: "00000000-0000-4000-8000-000000000001",
          code: String(payload.p_code ?? session.code),
          session,
          revision:
            name === "create_game_session_public"
              ? 1
              : Number(payload.p_revision ?? 0) + 1,
          created_at: "2026-07-28T09:30:00.000Z",
          updated_at: "2026-07-28T09:31:00.000Z",
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(record ? [record] : []),
      });
    },
  );
}

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      deviceScaleFactor: 1,
      reducedMotion: scenario.reducedMotion,
      forcedColors: scenario.forcedColors,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await installSessionMock(page);
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page
      .locator('.entry-page[data-entry-state="settled"]')
      .waitFor({ state: "visible" });
    // eslint-disable-next-line no-undef -- callback runs in the page realm
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
    await page.screenshot({
      path: `${outDir}/${prefix}-entry-${scenario.name}.png`,
    });

    await page.getByLabel("Host name").fill("Evidence Host");
    await page.getByRole("button", { name: "Host table" }).click();
    await page
      .getByRole("heading", { level: 1, name: "Setup" })
      .waitFor({ state: "visible" });
    await page.waitForTimeout(scenario.reducedMotion ? 50 : 700);
    await page.screenshot({
      path: `${outDir}/${prefix}-setup-${scenario.name}.png`,
    });

    if (errors.length > 0) {
      throw new Error(
        `${scenario.name} emitted browser errors:\n${errors.join("\n")}`,
      );
    }
    await context.close();
    console.log(`captured entry and setup at ${scenario.name}`);
  }
} finally {
  await browser.close();
}

// Captures the pre-React vanilla app (design source of truth) at the widths
// that matter, so the React port has a target rather than a memory.
// Run the legacy server first:  node website/host-dashboard/server.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.LEGACY_URL || 'http://127.0.0.1:4173/website/host-dashboard/';
const OUT = path.resolve(process.cwd(), 'docs/design/evidence/legacy');

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1280', width: 1280, height: 720 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
];

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(10_000); // fonts, canvas, loader

    await page.screenshot({ path: path.join(OUT, `entry-${vp.name}.png`) });
    await page.screenshot({
      path: path.join(OUT, `entry-full-${vp.name}.png`),
      fullPage: true,
    });

    // Scroll positions so the chapter/board treatment is captured mid-page.
    for (const frac of [0.33, 0.66]) {
      // Runs in the page, not in node — hence the browser globals.
      /* eslint-disable-next-line no-undef */
      await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), frac);
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: path.join(OUT, `entry-scroll${Math.round(frac * 100)}-${vp.name}.png`),
      });
    }

    console.log(`captured ${vp.name}`);
    await context.close();
  }

  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

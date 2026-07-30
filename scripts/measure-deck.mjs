// Measures the Command Deck geometry the slice-1 defects were stated in, so
// before/after is a number rather than an impression.
// Usage: node scripts/measure-deck.mjs <baseUrl>
import { chromium } from "playwright";

const [baseUrl] = process.argv.slice(2);

if (!baseUrl) {
  console.error("usage: node scripts/measure-deck.mjs <baseUrl>");
  process.exit(1);
}

const SURFACES = ["setup", "play", "market", "players", "scoring", "export", "rules"];
const VIEWPORTS = [
  [1440, 900],
  [1280, 742],
];

const probe = () => {
  const box = (selector) => {
    // eslint-disable-next-line no-undef -- page realm
    const node = document.querySelector(selector);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
    };
  };

  // Only count codes the host can actually see — hidden print sheets and the
  // sub-900px header code are not duplicates on this viewport.
  // eslint-disable-next-line no-undef -- page realm
  const codeNodes = [...document.querySelectorAll("body *")].filter((el) => {
    if (el.children.length > 0) return false;
    if (!/\bGT-\d{4}\b/.test(el.textContent ?? "")) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    // eslint-disable-next-line no-undef -- page realm
    const style = window.getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none";
  });

  return {
    intro: box(".surface-intro"),
    header: box(".workspace-header"),
    h2: box(".surface-intro h2"),
    now: box(".setup-now") ?? box(".now-zone"),
    roster: box(".setup-roster"),
    nav: box(".desktop-navigation"),
    railFooter: box(".command-rail__footer"),
    // eslint-disable-next-line no-undef -- page realm
    eyebrow: document.querySelector(".workspace-header .eyebrow")?.textContent?.trim(),
    codeCount: codeNodes.length,
    // eslint-disable-next-line no-undef -- page realm
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
};

const browser = await chromium.launch();

for (const [width, height] of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}?fixture=host`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  console.log(`\n=== ${width}x${height} ===`);

  for (const [index, surface] of SURFACES.entries()) {
    await page.locator(".desktop-navigation button").nth(index).click();
    await page.waitForTimeout(700);
    const m = await page.evaluate(probe);
    const fold = height;
    console.log(
      [
        surface.padEnd(8),
        `intro ${String(m.intro?.top ?? 0).padStart(3)}>${String(m.intro?.height ?? 0).padStart(3)}px`,
        `h2top ${String(m.h2?.top ?? 0).padStart(3)}`,
        `hdr ${m.header?.bottom}`,
        m.now ? `now ${String(m.now.top).padStart(3)}` : "now   —",
        m.roster ? `roster ${String(m.roster.top).padStart(3)}` : "roster   —",
        `nav ${m.nav?.top}-${m.nav?.bottom}`,
        `railEnd ${m.railFooter?.bottom} (fold ${fold})`,
        `codes ${m.codeCount}`,
        `overflowX ${m.overflowX}`,
        `| ${m.eyebrow}`,
      ].join("  "),
    );
  }

  await context.close();
}

await browser.close();

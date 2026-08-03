// Motion verification for the Command Deck.
//
// A static screenshot cannot prove an animation ran, and it certainly cannot
// prove the animation did not shift the layout. This drives a real phase advance
// and samples frames across the transition, in both the animated and the
// reduced-motion state, asserting three things the motion contract requires:
//
//   1. The transition is actually visible (the Now zone's rendered content
//      changes across consecutive frames rather than swapping in one step).
//   2. The Now zone's box does not move or resize during it — layouts stay
//      stable while data arrives.
//   3. Reduced motion produces a designed static state, not a broken one: the
//      new content is present immediately and the active phase is still marked.
//
// Usage: node scripts/verify-motion.mjs <baseUrl> <outDir>
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const [baseUrl, outDir] = process.argv.slice(2);

if (!baseUrl || !outDir) {
  console.error("usage: node scripts/verify-motion.mjs <baseUrl> <outDir>");
  process.exit(1);
}

const UI_STORAGE_KEY = "give-and-take:ui:v1";
const FRAME_COUNT = 8;
const FRAME_GAP_MS = 55;

const failures = [];
const notes = [];

function check(condition, message) {
  if (condition) {
    notes.push(`  ok   ${message}`);
  } else {
    failures.push(`  FAIL ${message}`);
  }
}

async function openDeck(browser, { appReduced, systemReduced }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: systemReduced ? "reduce" : "no-preference",
  });
  await context.addInitScript(
    ([key, value]) => {
      // eslint-disable-next-line no-undef -- runs in the page realm
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    [UI_STORAGE_KEY, { theme: "table", reducedMotion: appReduced }],
  );
  const page = await context.newPage();
  await page.goto(`${baseUrl}?fixture=host`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  return { context, page };
}

/** Geometry of the Now zone and the phase underline, for stability checks. */
async function geometry(page) {
  /* eslint-disable no-undef -- the callback below is serialized and run in the
     page realm, where document, window and getComputedStyle exist. */
  return page.evaluate(() => {
    const zone = document.querySelector(".now-zone");
    const instruction = document.querySelector(".now-zone__instruction");
    const underline = document.querySelector(".travelling-underline");
    // Document-relative, not viewport-relative. Playwright's element screenshots
    // scroll the target into view, so a getBoundingClientRect y would report the
    // page scrolling as layout drift — which it is not.
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x + window.scrollX),
        y: Math.round(r.y + window.scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    };
    return {
      zone: box(zone),
      instruction: box(instruction),
      underline: box(underline),
      headline:
        document.querySelector(".now-zone__instruction h3")?.textContent?.trim() ??
        null,
      // The computed opacity mid-tween is the evidence the blur-fade ran.
      instructionOpacity: instruction
        ? Number(getComputedStyle(instruction).opacity)
        : null,
      instructionFilter: instruction
        ? getComputedStyle(instruction).filter
        : null,
      activePhase:
        document
          .querySelector(".phase-rail > div[data-active] strong")
          ?.textContent?.trim() ?? null,
    };
  });
  /* eslint-enable no-undef */
}

/**
 * Advances Roll -> Resolve the way a host does: pick the face shown on the real
 * die, then commit it. The control is deliberately two-step, so both are needed.
 */
async function advancePhase(page) {
  await page.getByRole("button", { name: /Die result 3/ }).click();
  await page
    .getByRole("button", { name: /Record die and show destination/ })
    .click();
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();

  // ---- animated ----------------------------------------------------------
  {
    const { context, page } = await openDeck(browser, {
      appReduced: false,
      systemReduced: false,
    });
    const before = await geometry(page);
    check(
      before.zone !== null && before.instruction !== null,
      `animated: Now zone present (phase ${before.activePhase})`,
    );
    check(
      before.underline !== null,
      "animated: phase underline rendered for the active step",
    );

    const frames = [];
    await advancePhase(page);
    for (let i = 0; i < FRAME_COUNT; i += 1) {
      // Awaiting in sequence is the point: this is sampling a timeline.
      const frame = await geometry(page);
      frames.push(frame);
      // An element screenshot, not a fixed clip: committing the die scrolls the
      // physical stage into view, so a fixed region would photograph the wrong
      // part of the page.
      await page
        .locator(".now-zone")
        .screenshot({
          path: `${outDir}/rekey-animated-${String(i).padStart(2, "0")}.png`,
        })
        .catch(() => {});
      await page.waitForTimeout(FRAME_GAP_MS);
    }

    const opacities = frames
      .map((f) => f.instructionOpacity)
      .filter((v) => v !== null);
    const midTween = opacities.filter((v) => v > 0.01 && v < 0.995);
    check(
      midTween.length > 0,
      `animated: blur-fade observed mid-transition (opacities ${opacities
        .map((v) => v.toFixed(2))
        .join(", ")})`,
    );
    check(
      opacities.at(-1) !== undefined && opacities.at(-1) > 0.99,
      "animated: instruction settles fully opaque",
    );
    // Never invisible: the enter-only re-key starts at 0.4 so the host can always
    // read the panel.
    check(
      opacities.every((v) => v >= 0.35),
      `animated: instruction never drops below 0.35 opacity (min ${Math.min(
        ...opacities,
      ).toFixed(2)})`,
    );

    // The zone's own box must not move. Its height is allowed to differ from the
    // pre-advance measurement only if the new instruction copy genuinely needs
    // more lines — what must never happen is the box changing *during* the
    // transition, which is what a host would see as a jump.
    const zones = frames.map((f) => f.zone).filter(Boolean);
    const first = zones[0];
    const drift = zones.find(
      (z) =>
        z.x !== first.x || z.y !== first.y || z.w !== first.w || z.h !== first.h,
    );
    check(
      drift === undefined,
      drift
        ? `animated: Now zone box DRIFTED ${JSON.stringify(first)} -> ${JSON.stringify(drift)}`
        : `animated: Now zone box unchanged through the transition (${JSON.stringify(first)})`,
    );

    const after = frames.at(-1);
    check(
      after.activePhase !== before.activePhase,
      `animated: phase advanced ${before.activePhase} -> ${after.activePhase}`,
    );
    check(
      after.underline !== null && after.underline.x !== before.underline.x,
      `animated: underline travelled (x ${before.underline?.x} -> ${after.underline?.x})`,
    );

    await context.close();
  }

  // ---- reduced motion ----------------------------------------------------
  // Exercise the product switch and the OS preference separately. Combining
  // both here used to let a broken in-app toggle pass because the OS setting
  // happened to suppress Motion on its behalf.
  for (const [label, preference] of [
    ["app setting", { appReduced: true, systemReduced: false }],
    ["system setting", { appReduced: false, systemReduced: true }],
  ]) {
    const { context, page } = await openDeck(browser, preference);
    const before = await geometry(page);
    await advancePhase(page);
    await page.waitForTimeout(140);
    const after = await geometry(page);

    await page
      .locator(".now-zone")
      .screenshot({
        path: `${outDir}/rekey-reduced-${label.replace(" ", "-")}.png`,
      })
      .catch(() => {});

    check(
      after.instructionOpacity === 1,
      `reduced (${label}): instruction fully opaque immediately (${after.instructionOpacity})`,
    );
    check(
      after.instructionFilter === "none" || after.instructionFilter === null,
      `reduced (${label}): no blur left applied (${after.instructionFilter})`,
    );
    check(
      after.activePhase !== before.activePhase,
      `reduced (${label}): phase still advanced ${before.activePhase} -> ${after.activePhase}`,
    );
    check(
      after.underline !== null,
      `reduced (${label}): active phase is still marked — the state is designed, not disabled`,
    );

    await context.close();
  }

  await browser.close();

  const report = [
    "Command Deck motion verification",
    "",
    ...notes,
    ...failures,
    "",
    failures.length === 0
      ? `PASS (${notes.length} checks)`
      : `FAIL (${failures.length} of ${notes.length + failures.length})`,
  ].join("\n");

  await writeFile(`${outDir}/report.txt`, `${report}\n`, "utf8");
  console.log(report);

  if (failures.length > 0) process.exit(1);
}

await run();

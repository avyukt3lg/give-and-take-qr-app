import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");

const required = [
  ".nojekyll",
  "index.html",
  "404.html",
  "website/host-dashboard/index.html",
  "game_data/game_config.json",
  "assets/fonts/SourceSans3Variable.woff2",
  "outputs/final_assets/board/give_and_take_board_web_1280.webp",
];

await Promise.all(required.map((file) => access(path.join(distRoot, file))));

const html = await readFile(
  path.join(distRoot, "website/host-dashboard/index.html"),
  "utf8",
);

const forbidden = ["/src/", "esm.sh", "app.js?v=", "styles.css?v="];
const found = forbidden.filter((fragment) => html.includes(fragment));

if (found.length > 0) {
  throw new Error(`Artifact contains legacy or source references: ${found.join(", ")}`);
}

if (!html.includes("/give-and-take-qr-app/assets/")) {
  throw new Error("Built dashboard does not use the GitHub Pages base path.");
}

const cspDirectives = [
  "default-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "img-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
];
for (const directive of cspDirectives) {
  if (!html.includes(directive)) {
    throw new Error(`Built dashboard CSP is missing: ${directive}`);
  }
}

const rootAbsoluteAssets = [
  ...html.matchAll(/(?:src|href)="(\/[^"]+)"/g),
].map((match) => match[1]);
const wrongBase = rootAbsoluteAssets.filter(
  (asset) => !asset.startsWith("/give-and-take-qr-app/"),
);
if (wrongBase.length) {
  throw new Error(
    `Built dashboard contains assets outside the Pages base: ${wrongBase.join(", ")}`,
  );
}

const redirectHtml = await readFile(path.join(distRoot, "index.html"), "utf8");
const fallbackHtml = await readFile(path.join(distRoot, "404.html"), "utf8");
for (const [name, document] of [
  ["index.html", redirectHtml],
  ["404.html", fallbackHtml],
]) {
  if (
    !document.includes("website/host-dashboard/") ||
    !document.includes("window.location.search") ||
    !document.includes("window.location.hash")
  ) {
    throw new Error(`${name} does not preserve the nested path, query and hash.`);
  }
}

const gameConfig = JSON.parse(
  await readFile(path.join(distRoot, "game_data/game_config.json"), "utf8"),
);
const spaces =
  gameConfig.boardSpaces ??
  gameConfig.board?.spaces ??
  gameConfig.spaces ??
  [];
const cards = Object.values(gameConfig.cards ?? {}).flatMap((deck) =>
  Array.isArray(deck) ? deck : [],
);

if (spaces.length !== 44 || cards.length !== 81) {
  throw new Error(
    `Game contract changed: expected 44 spaces and 81 cards, got ${spaces.length} and ${cards.length}.`,
  );
}

const dashboardStat = await stat(
  path.join(distRoot, "website/host-dashboard/index.html"),
);

const moduleMatch = html.match(
  /<script[^>]+type="module"[^>]+src="([^"]+\.js)"/,
);
if (!moduleMatch) {
  throw new Error("Built dashboard is missing its production module entry.");
}
const modulePath = moduleMatch[1].replace(/^\/give-and-take-qr-app\//, "");
const initialJavascript = await readFile(path.join(distRoot, modulePath));
const initialJavascriptGzip = gzipSync(initialJavascript).byteLength;
const initialBudget = 240 * 1024;
if (initialJavascriptGzip > initialBudget) {
  throw new Error(
    `Initial JavaScript exceeds 240 KB gzip: ${initialJavascriptGzip} bytes.`,
  );
}

const assetDirectory = path.join(distRoot, "assets");
const assetFiles = await readdir(assetDirectory);
const lazyJavascript = assetFiles.filter(
  (file) => file.endsWith(".js") && file !== path.basename(modulePath),
);
const lazyBudget = 80 * 1024;
for (const file of lazyJavascript) {
  const size = gzipSync(await readFile(path.join(assetDirectory, file))).byteLength;
  if (size > lazyBudget) {
    throw new Error(`${file} exceeds the 80 KB lazy JavaScript gzip budget.`);
  }
}

const desktopHero = assetFiles.find((file) =>
  /^product-box-1024-.*\.avif$/.test(file),
);
const mobileHero = assetFiles.find((file) =>
  /^product-box-640-.*\.jpg$/.test(file),
);
if (!desktopHero || !mobileHero) {
  throw new Error("Both desktop and mobile product-box assets must be emitted.");
}
const desktopHeroBytes = (
  await stat(path.join(assetDirectory, desktopHero))
).size;
const mobileHeroBytes = (
  await stat(path.join(assetDirectory, mobileHero))
).size;
if (desktopHeroBytes > 250 * 1024 || mobileHeroBytes > 120 * 1024) {
  throw new Error(
    `Hero image budget exceeded: desktop ${desktopHeroBytes}, mobile ${mobileHeroBytes}.`,
  );
}

console.log(
  `Artifact verified: ${required.length} required files, dashboard ${dashboardStat.size} bytes, 44 spaces, 81 cards, initial JS ${(initialJavascriptGzip / 1024).toFixed(2)} KB gzip.`,
);

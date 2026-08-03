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
  "assets/fonts/InstrumentSerif-Regular.woff2",
  "assets/fonts/InstrumentSerif-Italic.woff2",
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
  "object-src 'none'",
];
for (const directive of cspDirectives) {
  if (!html.includes(directive)) {
    throw new Error(`Built dashboard CSP is missing: ${directive}`);
  }
}
if (html.includes("worker-src")) {
  throw new Error("Built dashboard still grants a worker source after renderer removal.");
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

const sourceRoot = path.join(
  repoRoot,
  "website/host-dashboard/src",
);
const globalsCss = await readFile(
  path.join(sourceRoot, "styles/globals.css"),
  "utf8",
);
for (const token of [
  "--dur-control",
  "--dur-panel",
  "--dur-surface",
  "--dur-narrative",
]) {
  if (!globalsCss.includes(token)) {
    throw new Error(`Motion timing contract is missing ${token}.`);
  }
}

const surfaceCss = await readFile(
  path.join(sourceRoot, "styles/surfaces.css"),
  "utf8",
);
if (surfaceCss.includes("var(--asset)")) {
  throw new Error("Production CSS regressed to unencoded var(--asset).");
}

for (const file of [
  "features/help/HelpView.tsx",
  "features/market/MarketView.tsx",
  "features/ledger/LedgerView.tsx",
  "features/modes/TableDisplay.tsx",
  "features/modes/PlayerAssist.tsx",
]) {
  const source = await readFile(path.join(sourceRoot, file), "utf8");
  if (!source.includes("data-risk")) {
    throw new Error(`${file} no longer exposes risk-based asset encoding.`);
  }
}

const entrySource = await readFile(
  path.join(sourceRoot, "features/entry/EntryScreen.tsx"),
  "utf8",
);
if (
  !entrySource.includes("data-entry-state") ||
  entrySource.includes("documentElement.dataset.entryState")
) {
  throw new Error("data-entry-state must remain owned by EntryScreen.");
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
const modulePreloads = [
  ...html.matchAll(
    /<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g,
  ),
].map((match) =>
  match[1].replace(/^\/give-and-take-qr-app\//, ""),
);
const initialModulePaths = [...new Set([modulePath, ...modulePreloads])];
const initialJavascriptGzip = (
  await Promise.all(
    initialModulePaths.map(async (file) =>
      gzipSync(await readFile(path.join(distRoot, file))).byteLength,
    ),
  )
).reduce((total, bytes) => total + bytes, 0);
const initialBudget = 240 * 1024;
if (initialJavascriptGzip > initialBudget) {
  throw new Error(
    `Complete initial JavaScript graph exceeds 240 KB gzip: ${initialJavascriptGzip} bytes across ${initialModulePaths.length} modules.`,
  );
}

const assetDirectory = path.join(distRoot, "assets");
const assetFiles = await readdir(assetDirectory);
const legacyEffectArtifacts = assetFiles.filter((file) =>
  /ascii|dither|boardpointcloud|board-point/i.test(file),
);
if (legacyEffectArtifacts.length) {
  throw new Error(
    `Legacy ASCII/dither artifacts remain: ${legacyEffectArtifacts.join(", ")}.`,
  );
}

const legacyEffectSignatures = [
  "AsciiRasterCanvas",
  "ascii-effect-lab",
  "ascii.worker",
  "board-point-scene",
  "BoardPointCloudScene",
];
for (const file of assetFiles.filter(
  (asset) => asset.endsWith(".js") || asset.endsWith(".css"),
)) {
  const source = await readFile(path.join(assetDirectory, file), "utf8");
  const signature = legacyEffectSignatures.find((value) =>
    source.includes(value),
  );
  if (signature) {
    throw new Error(`${file} still contains legacy effect signature ${signature}.`);
  }
}

const initialModuleNames = new Set(
  initialModulePaths.map((file) => path.basename(file)),
);
const lazyJavascript = assetFiles.filter(
  (file) => file.endsWith(".js") && !initialModuleNames.has(file),
);
const lazyBudget = 80 * 1024;
for (const file of lazyJavascript) {
  const size = gzipSync(await readFile(path.join(assetDirectory, file))).byteLength;
  if (size > lazyBudget) {
    throw new Error(`${file} exceeds the 80 KB lazy JavaScript gzip budget.`);
  }
}

// The semantic relief is built from game data. The real board image remains a
// social-preview and documentation asset, not a hidden rendering dependency.
const boardDirectory = path.join(distRoot, "outputs/final_assets/board");
const boardArtwork = [
  { file: "give_and_take_board_web_1280.webp", budget: 250 * 1024 },
];

for (const { file, budget } of boardArtwork) {
  let bytes;
  try {
    bytes = (await stat(path.join(boardDirectory, file))).size;
  } catch {
    throw new Error(`Board artwork missing from the artifact: ${file}.`);
  }
  if (bytes > budget) {
    throw new Error(`Board artwork budget exceeded: ${file} is ${bytes} bytes.`);
  }
}

console.log(
  `Artifact verified: ${required.length} required files, dashboard ${dashboardStat.size} bytes, 44 spaces, 81 cards, complete initial graph ${(initialJavascriptGzip / 1024).toFixed(2)} KB gzip across ${initialModulePaths.length} modules.`,
);

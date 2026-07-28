import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "dist");

const copyDirectory = async (relativePath) => {
  await cp(path.join(repoRoot, relativePath), path.join(distRoot, relativePath), {
    recursive: true,
  });
};

await mkdir(distRoot, { recursive: true });
await mkdir(path.join(distRoot, "assets/fonts"), { recursive: true });
await Promise.all([
  copyDirectory("game_data"),
  copyDirectory("outputs/final_assets/board"),
  cp(
    path.join(repoRoot, "assets/fonts/NewsreaderVariable.woff2"),
    path.join(distRoot, "assets/fonts/NewsreaderVariable.woff2"),
  ),
  cp(
    path.join(repoRoot, "assets/fonts/NewsreaderVariable-Italic.woff2"),
    path.join(distRoot, "assets/fonts/NewsreaderVariable-Italic.woff2"),
  ),
  cp(
    path.join(repoRoot, "assets/fonts/SourceSans3Variable.woff2"),
    path.join(distRoot, "assets/fonts/SourceSans3Variable.woff2"),
  ),
  cp(
    path.join(repoRoot, "assets/fonts/SourceSans3Variable-Italic.woff2"),
    path.join(distRoot, "assets/fonts/SourceSans3Variable-Italic.woff2"),
  ),
]);

await writeFile(path.join(distRoot, ".nojekyll"), "");

const redirectDocument = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="theme-color" content="#090a08">
    <title>Give And Take</title>
    <link rel="canonical" href="https://avyukt3lg.github.io/give-and-take-qr-app/website/host-dashboard/">
    <script>
      const destination = new URL("website/host-dashboard/", window.location.href);
      destination.search = window.location.search;
      destination.hash = window.location.hash;
      window.location.replace(destination);
    </script>
  </head>
  <body>
    <p><a href="website/host-dashboard/">Open Give And Take</a></p>
  </body>
</html>`;

await writeFile(path.join(distRoot, "index.html"), redirectDocument);
await writeFile(path.join(distRoot, "404.html"), redirectDocument);

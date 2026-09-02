// Firefox build: pages + content script (TARGET=firefox) → IIFE background →
// Firefox manifest. Output: dist-firefox/. `--zip` also writes the AMO upload
// zip and the matching source zip (AMO requires source for bundled code).
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: { ...process.env, TARGET: "firefox" } });

run("npx vite build");
run("npx vite build --config vite.content.config.ts");
run("npx vite build --config vite.background.firefox.config.ts");

// the public/ dir copies the Chrome manifest; replace it
copyFileSync("manifest.firefox.json", "dist-firefox/manifest.json");
rmSync("dist-firefox/offscreen.html", { force: true });

const chromeVersion = JSON.parse(readFileSync("public/manifest.json", "utf8")).version;
const ffVersion = JSON.parse(readFileSync("manifest.firefox.json", "utf8")).version;
if (chromeVersion !== ffVersion) {
  throw new Error(`manifest version mismatch: chrome ${chromeVersion} vs firefox ${ffVersion}`);
}

if (process.argv.includes("--zip")) {
  mkdirSync("release", { recursive: true });
  const xpi = `release/applyonce-firefox-v${ffVersion}.zip`;
  const src = `release/applyonce-firefox-v${ffVersion}-source.zip`;
  rmSync(xpi, { force: true });
  rmSync(src, { force: true });
  execSync(`cd dist-firefox && zip -qr ../${xpi} .`, { stdio: "inherit" });
  execSync(`git archive --format=zip -o ${src} HEAD`, { stdio: "inherit" });
  console.log(`\nAMO upload: ${xpi}\nSource zip: ${src}`);
}
console.log("firefox build → dist-firefox/");

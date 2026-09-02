// Captures side-panel screenshots for the store listing through the real
// built extension (Playwright Chromium, dist/ loaded unpacked):
//   node e2e/capture-shots.mjs  -> media/public/shots/panel-scan-review.png, panel-reimport.png
import { chromium } from "playwright";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "media", "public", "shots");
if (!existsSync(join(DIST, "manifest.json"))) { console.error("run npm run build first"); process.exit(1); }
const userDataDir = mkdtempSync(join(tmpdir(), "applyonce-shots-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium", headless: true, viewport: { width: 420, height: 760 }, deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.waitForSelector("input[type=file]", { state: "attached" });
  // 1. scanned resume -> review screen with OCR warning and "check this" tags
  await page.setInputFiles("input[type=file]", join(ROOT, "fixtures/cv/scan/ats-plain--priya.png"));
  await page.waitForSelector("text=Check what we extracted", { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "panel-scan-review.png") });
  console.log("captured panel-scan-review.png");
  // 2. finish onboarding, then the Profile tab with "Import a new resume"
  await page.click("text=Looks right, continue");
  await page.click("text=Finish setup");
  await page.click("nav.tabs >> text=Profile");
  await page.waitForSelector("text=Import a new resume");
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, "panel-reimport.png") });
  console.log("captured panel-reimport.png");
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}

// Chrome end-to-end for resume import: loads dist/ as an unpacked MV3
// extension in Playwright's Chromium, opens the side panel page, uploads a
// resume through the real drop input (service worker -> offscreen document ->
// PDF.js / OCR -> review screen) and reports what the review shows.
//   npm run build && npm run e2e:chrome [path/to/resume.pdf]
import { chromium } from "playwright";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [join(ROOT, "fixtures/cv/bin/classic-right-dates--amara.pdf"), join(ROOT, "fixtures/cv/scan/ats-plain--priya.png")];
if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("dist missing: run `npm run build` first");
  process.exit(1);
}

const userDataDir = mkdtempSync(join(tmpdir(), "applyonce-chrome-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
let failed = false;
try {
  const logs = [];
  const hook = (p) => {
    p.on("console", (m) => logs.push(`[${new URL(p.url()).pathname}] ${m.type()}: ${m.text().slice(0, 200)}`));
    p.on("pageerror", (e) => logs.push(`[${new URL(p.url()).pathname}] pageerror: ${String(e).slice(0, 200)}`));
  };
  context.on("page", hook);
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(sw.url()).host;
  // the offscreen document is not a Playwright page. E2E_OFFSCREEN_TAB=1 also
  // runs its script in a tab so its console shows (it answers the same
  // messages, so results then come from whichever finishes first: debugging
  // only, never the default)
  if (process.env.E2E_OFFSCREEN_TAB) {
    const offscreenTab = await context.newPage();
    hook(offscreenTab);
    await offscreenTab.goto(`chrome-extension://${id}/offscreen.html`);
  }
  for (const file of files) {
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`chrome-extension://${id}/sidepanel.html`);
    await page.waitForSelector("input[type=file]", { state: "attached", timeout: 15000 });
    const t0 = Date.now();
    logs.length = 0;
    await page.setInputFiles("input[type=file]", file);
    try {
      await page.waitForSelector("text=Check what we extracted", { timeout: 120000 });
    } catch {
      const err = await page.$eval(".error", (e) => e.textContent).catch(() => "");
      console.log(`\n${file.split("/").pop()}: review screen never appeared. panel error: ${err || "(none)"}`);
      for (const l of logs) console.log(`  ${l}`);
      failed = true;
      await page.close();
      continue;
    }
    const warnings = await page.$$eval(".warn", (els) => els.map((e) => e.textContent?.trim() ?? ""));
    const cards = await page.$$eval(".card", (els) =>
      els.map((c) => [...c.querySelectorAll("input[type=text]")].slice(0, 2).map((i) => i.value).join(" @ ")),
    );
    const name = await page.$$eval(".field-row input[type=text]", (els) => els.slice(0, 2).map((i) => i.value).join(" "));
    const ms = Date.now() - t0;
    const scan = /\.(png|jpe?g|webp)$/i.test(file) || warnings.some((w) => /OCR/.test(w));
    const broken = warnings.some((w) => /Very little text|could not run/.test(w));
    console.log(`\n${file.split("/").pop()} (${ms} ms)${scan ? " [OCR]" : ""}`);
    console.log(`  name: ${name || "(none)"}`);
    console.log(`  entries: ${cards.filter(Boolean).slice(0, 6).join(" | ") || "(none)"}`);
    for (const w of warnings) console.log(`  warning: ${w}`);
    for (const e of errors) console.log(`  console error: ${e.slice(0, 200)}`);
    for (const l of logs.filter((l) => /OCR|error/i.test(l))) console.log(`  ${l}`);
    const ok = !broken && cards.length > 0;
    console.log(ok ? "  IMPORT: PASS ✅" : "  IMPORT: FAIL ❌");
    if (!ok) failed = true;
    // E2E_CLASSIFIER=1: finish onboarding, enable the on-device classifier in
    // Settings and wait for the model to download from the asset host
    if (process.env.E2E_CLASSIFIER && file === files[0]) {
      await page.click("text=Looks right, continue");
      await page.click("text=Finish setup");
      await page.click("nav.tabs >> text=Settings");
      const t1 = Date.now();
      await page.click("#clf"); // controlled input: state updates after the vault refresh, so no check()
      try {
        await page.waitForSelector("text=Model ready", { timeout: 300000 });
        console.log(`  CLASSIFIER: PASS ✅ (model downloaded and loaded in ${Date.now() - t1} ms)`);
      } catch {
        const note = await page.$$eval(".hint", (els) => els.map((e) => e.textContent).filter((t) => /model|Model/.test(t ?? "")).join(" | "));
        console.log(`  CLASSIFIER: FAIL ❌ ${note}`);
        for (const l of logs.filter((l) => /error|classifier/i.test(l))) console.log(`  ${l}`);
        failed = true;
      }
    }
    await page.close();
  }
} finally {
  await context.close();
  rmSync(userDataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);

// Browser verification for multi-select + salary range: loads the built
// extension in real Chromium, seeds a profile with skills + salary bounds,
// fills the generic-multi fixture via the widget, asserts checkbox-group and
// select[multiple] behavior (including add-only semantics), then undoes.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIST = "/Users/mnyadzayo/projects/job-autofill/dist";
const SCRATCH = "/private/tmp/claude-501/-Users-mnyadzayo-projects-job-autofill/1ca23142-f13d-46b0-859d-1026437e5fee/scratchpad";
const FIXTURE = "http://localhost:8901/generic-multi/page.html";

const profile = {
  version: 1,
  basics: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+44 20 7946 0958", pronouns: "" },
  location: { street: "", city: "London", region: "", country: "United Kingdom", postalCode: "" },
  links: { linkedin: "", github: "", portfolio: "", website: "" },
  work: [],
  education: [],
  skills: ["TypeScript", "Rust"],
  explicit: {
    workAuth: null, requiresSponsorship: null, salary: null,
    salaryMin: "$140,000", salaryMax: "$160,000",
    startDate: null, relocation: null, remote: null, noticePeriod: null,
    gender: null, race: null, hispanic: null, veteran: null, disability: null,
  },
};

const userDataDir = mkdtempSync(join(tmpdir(), "fa-multi-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 10_000 });
const extId = new URL(sw.url()).host;

const panel = await context.newPage();
await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
await panel.waitForTimeout(1200);
await panel.evaluate(async (p) => {
  const open = indexedDB.open("fastapply");
  const db = await new Promise((res, rej) => {
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  await new Promise((res, rej) => {
    const tx = db.transaction("profile", "readwrite");
    tx.objectStore("profile").put({ id: "profile", envelope: { v: 1, enc: false, data: p }, updatedAt: Date.now() });
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}, profile);
await panel.close();

const page = await context.newPage();
page.on("console", (m) => {
  if (m.text().includes("[ApplyOnce]")) console.log("PAGE:", m.text());
});
await page.goto(FIXTURE);

// simulate a user pre-selecting Go BEFORE the fill — add-only semantics must
// leave it alone through fill AND restore it through undo
await page.check('input[name="skills[]"][value="go"]');

await page.waitForTimeout(3500);
const widget = page.locator("[data-fastapply-ui]");
if ((await widget.count()) === 0) {
  console.log("FAIL: widget did not appear");
  await context.close();
  process.exit(1);
}

await widget.locator("button", { hasText: /^Fill$/ }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: join(SCRATCH, "multi-1-filled.png"), fullPage: true });

const filled = await page.evaluate(() => {
  const box = (v) => document.querySelector(`input[name="skills[]"][value="${v}"]`)?.checked;
  const sel = document.getElementById("techs");
  return {
    ts: box("ts"), rust: box("rust"), go: box("go"), py: box("py"),
    techsSelected: [...sel.selectedOptions].map((o) => o.value).sort(),
    smin: document.getElementById("smin")?.value,
    smax: document.getElementById("smax")?.value,
    consent: document.getElementById("agree2")?.checked,
  };
});
console.log("after fill:", JSON.stringify(filled));

const fillPass =
  filled.ts === true &&
  filled.rust === true &&
  filled.go === true && // user's manual pick untouched
  filled.py === false &&
  JSON.stringify(filled.techsSelected) === JSON.stringify(["rust", "typescript"]) &&
  filled.smin === "140000" &&
  filled.smax === "160000" &&
  filled.consent === false;
console.log(fillPass ? "MULTI FILL: PASS ✅" : "MULTI FILL: FAIL ❌");

// undo must restore: ts/rust/py unchecked, GO STILL CHECKED (pre-fill state),
// multiselect cleared, salaries emptied
await widget.locator("button", { hasText: "Undo fill" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: join(SCRATCH, "multi-2-undone.png"), fullPage: true });

const undone = await page.evaluate(() => {
  const box = (v) => document.querySelector(`input[name="skills[]"][value="${v}"]`)?.checked;
  const sel = document.getElementById("techs");
  return {
    ts: box("ts"), rust: box("rust"), go: box("go"),
    techsSelected: sel.selectedOptions.length,
    smin: document.getElementById("smin")?.value,
    smax: document.getElementById("smax")?.value,
  };
});
console.log("after undo:", JSON.stringify(undone));

const undoPass =
  undone.ts === false &&
  undone.rust === false &&
  undone.go === true && // pre-fill user pick restored
  undone.techsSelected === 0 &&
  undone.smin === "" &&
  undone.smax === "";
console.log(undoPass ? "MULTI UNDO: PASS ✅" : "MULTI UNDO: FAIL ❌");

await context.close();
process.exit(fillPass && undoPass ? 0 : 1);

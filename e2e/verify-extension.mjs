// End-to-end verification: load the built extension in a real Chromium,
// seed a profile, open the fixture page, confirm the widget auto-appears,
// click Fill, and verify the form actually got filled.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIST = "/Users/mnyadzayo/projects/job-autofill/dist";
const SCRATCH = "/private/tmp/claude-501/-Users-mnyadzayo-projects-job-autofill/1ca23142-f13d-46b0-859d-1026437e5fee/scratchpad";
const FIXTURE = "http://localhost:8901/generic-basic/page.html";

const profile = {
  version: 1,
  basics: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+44 20 7946 0958", pronouns: "" },
  location: { city: "London", region: "Greater London", country: "United Kingdom", postalCode: "SW1A 1AA" },
  links: { linkedin: "https://linkedin.com/in/ada", github: "https://github.com/ada", portfolio: "", website: "" },
  work: [{ company: "Analytical Engines Ltd", title: "Staff Engineer", start: "2021-03", end: "", current: true, location: "London", description: "Compilers." }],
  education: [{ school: "University of London", degree: "BSc", field: "Mathematics", start: "2012-09", end: "2016-06", gpa: "3.9" }],
  skills: ["TypeScript"],
  explicit: {
    workAuth: "Yes", requiresSponsorship: "No", salary: "$150,000", startDate: "2026-08-01",
    relocation: "Yes", remote: "Remote", noticePeriod: "1 month",
    gender: null, race: null, hispanic: null, veteran: null, disability: null,
  },
};

const userDataDir = mkdtempSync(join(tmpdir(), "fa-verify-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});

// find the extension's service worker → extension id
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 10_000 });
const extId = new URL(sw.url()).host;
console.log("extension loaded:", extId);

// 1. open the side panel page once so Dexie creates the schema, then seed
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
    tx.objectStore("profile").put({
      id: "profile",
      envelope: { v: 1, enc: false, data: p },
      updatedAt: Date.now(),
    });
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}, profile);
console.log("profile seeded into vault");
await panel.close();

// 2. open the fixture and watch the auto-detect trail
const page = await context.newPage();
const logs = [];
page.on("console", (m) => {
  if (m.text().includes("[ApplyOnce]")) {
    logs.push(m.text());
    console.log("PAGE:", m.text());
  }
});
await page.goto(FIXTURE);
await page.waitForTimeout(3500);

const hostPresent = await page.evaluate(() => !!document.querySelector("[data-fastapply-ui]"));
console.log("widget host present:", hostPresent);
await page.screenshot({ path: join(SCRATCH, "verify-1-widget.png") });

if (!hostPresent) {
  console.log("FAIL: widget did not render");
  await context.close();
  process.exit(1);
}

// 3. click Fill by coordinates (closed shadow root): pill sits bottom-right;
//    Fill button is left of the minimize button
const vp = page.viewportSize();
await page.mouse.click(vp.width - 78, vp.height - 34);
await page.waitForTimeout(2500);
await page.screenshot({ path: join(SCRATCH, "verify-2-filled.png"), fullPage: true });

const result = await page.evaluate(() => ({
  fname: document.getElementById("fname")?.value,
  lname: document.getElementById("lname")?.value,
  mail: document.getElementById("mail")?.value,
  tel: document.getElementById("tel")?.value,
  city: document.getElementById("city")?.value,
  country: document.getElementById("country")?.value,
  company: document.getElementById("company")?.value,
  title: document.getElementById("title")?.value,
  degree: document.getElementById("degree")?.value,
  workauthYes: document.querySelector('input[name="workauth"][value="yes"]')?.checked,
  sponsorNo: document.querySelector('input[name="sponsor"][value="no"]')?.checked,
  cvAttached: (document.getElementById("cv")?.files?.length ?? 0) > 0,
  consentUntouched: document.getElementById("consent")?.checked === false,
  dinoEmpty: (document.getElementById("dino")?.value ?? "") === "",
  marks: document.querySelectorAll("[data-fastapply-mark]").length,
}));
console.log("fill results:", JSON.stringify(result, null, 2));

const fillPass =
  result.fname === "Ada" &&
  result.lname === "Lovelace" &&
  result.mail === "ada@example.com" &&
  result.country === "GB" &&
  result.workauthYes === true &&
  result.sponsorNo === true &&
  result.consentUntouched &&
  result.dinoEmpty;
console.log(fillPass ? "FILL: PASS ✅" : "FILL: FAIL ❌");

// 4. click the actual "Undo fill" button in the widget (open shadow root —
//    Playwright locators pierce it) and verify every field is restored
const undoBtn = page.locator("[data-fastapply-ui]").locator("button", { hasText: "Undo fill" });
await undoBtn.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: join(SCRATCH, "verify-3-undone.png") });

const after = await page.evaluate(() => ({
  fname: document.getElementById("fname")?.value,
  mail: document.getElementById("mail")?.value,
  country: document.getElementById("country")?.value,
  workauthAny: !!document.querySelector('input[name="workauth"]:checked'),
  sponsorAny: !!document.querySelector('input[name="sponsor"]:checked'),
  cvCleared: (document.getElementById("cv")?.files?.length ?? 0) === 0,
  marks: document.querySelectorAll("[data-fastapply-mark]").length,
}));
console.log("after undo:", JSON.stringify(after, null, 2));

const undoPass =
  after.fname === "" &&
  after.mail === "" &&
  after.country === "" &&
  !after.workauthAny &&
  !after.sponsorAny &&
  after.cvCleared &&
  after.marks === 0;
console.log(undoPass ? "UNDO: PASS ✅" : "UNDO: FAIL ❌");

await context.close();
process.exit(fillPass && undoPass ? 0 : 1);

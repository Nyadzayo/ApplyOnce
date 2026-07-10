// Visible demo: watch the extension work in a real browser window.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIST = "/Users/mnyadzayo/projects/job-autofill/dist";
const FIXTURE = "http://localhost:8901/generic-basic/page.html";

const profile = {
  version: 1,
  basics: { firstName: "Kelvin", lastName: "Nyadzayo", email: "kelvin.nyadzayo16@gmail.com", phone: "+27761891101", pronouns: "" },
  location: { city: "Cape Town", region: "Western Cape", country: "South Africa", postalCode: "" },
  links: { linkedin: "https://linkedin.com/in/kelvin", github: "https://github.com/Nyadzayo", portfolio: "", website: "" },
  work: [{ company: "Prime Circle Finance", title: "Software Engineer", start: "2025-10", end: "", current: true, location: "Cape Town", description: "Platform API." }],
  education: [{ school: "University of Cape Town", degree: "MSc", field: "Artificial Intelligence", start: "2025-02", end: "", gpa: "" }],
  skills: ["Python", "TypeScript"],
  explicit: { workAuth: "Yes", requiresSponsorship: "No", salary: "", startDate: "", relocation: "Yes", remote: "Remote", noticePeriod: "1 month", gender: null, race: null, hispanic: null, veteran: null, disability: null },
};
const fakePdfB64 = Buffer.from("%PDF-1.4\nfake resume for demo\n%%EOF").toString("base64");

const say = (m) => console.log(`\n>>> ${m}`);
const userDataDir = mkdtempSync(join(tmpdir(), "fa-demo-"));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium",
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 10_000 });
const extId = new URL(sw.url()).host;
say(`extension loaded (${extId}) — seeding your profile + a resume file into the local vault`);

const panel = await context.newPage();
await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
await panel.waitForTimeout(1200);
await panel.evaluate(async ({ p, pdf }) => {
  const open = indexedDB.open("fastapply");
  const db = await new Promise((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
  const put = (store, val) => new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(val);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  await put("profile", { id: "profile", envelope: { v: 1, enc: false, data: p }, updatedAt: Date.now() });
  await put("documents", {
    id: "doc-demo", 
    meta: { id: "doc-demo", role: "resume", fileName: "kelvin-nyadzayo.pdf", mime: "application/pdf", size: 40, addedAt: Date.now() },
    bytes: { v: 1, enc: false, data: pdf },
  });
  db.close();
}, { p: profile, pdf: fakePdfB64 });
await panel.close();

say("opening the job form — watch the bottom-right corner: the pill will peek, then collapse to a dot");
const page = await context.newPage();
page.on("console", (m) => { if (m.text().includes("[ApplyOnce]")) console.log("   ", m.text()); });
await page.goto(FIXTURE);
await page.waitForTimeout(6500);

say("that dot is the resting state — now clicking it to reopen the pill…");
const vp = page.viewportSize();
await page.mouse.click(vp.width - 38, vp.height - 38);
await page.waitForTimeout(2000);

say("clicking FILL — watch the fields turn green (sure) and amber (check me)…");
await page.mouse.click(vp.width - 78, vp.height - 34);
await page.waitForTimeout(2500);

const check = await page.evaluate(() => ({
  name: document.getElementById("fname")?.value,
  country: document.getElementById("country")?.value,
  cvAttached: (document.getElementById("cv")?.files?.length ?? 0) > 0,
  cvFile: document.getElementById("cv")?.files?.[0]?.name,
  consent: document.getElementById("consent")?.checked,
}));
say(`filled: name=${check.name}, country=${check.country}, resume attached=${check.cvAttached} (${check.cvFile}), consent untouched=${!check.consent}`);
say("the receipt list is open — note 'Undo fill' and 'Mark applied' in its footer");
say("browser stays open for 90 seconds — click around, try Undo, drag the dot. Then it closes itself.");
await page.waitForTimeout(90_000);
await context.close();
console.log("\nDemo finished.");

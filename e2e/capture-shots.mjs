// Capture real product UI for store screenshots: the filled fixture page at
// exactly 1280x800, plus side-panel tabs at panel width for Remotion framing.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIST = "/Users/mnyadzayo/projects/job-autofill/dist";
const OUT = "media/public/shots";
const FIXTURE = "http://localhost:8901/generic-basic/page.html";

const profile = {
  version: 1,
  basics: { firstName: "Jordan", lastName: "Rivera", email: "jordan.rivera@email.com", phone: "+1 415 555 0134", pronouns: "" },
  location: { street: "", city: "San Francisco", region: "California", country: "United States", postalCode: "94103" },
  links: { linkedin: "https://linkedin.com/in/jordanrivera", github: "https://github.com/jordanr", portfolio: "", website: "" },
  work: [{ company: "Northwind Labs", title: "Software Engineer", start: "2022-04", end: "", current: true, location: "SF", description: "Platform work." }],
  education: [{ school: "UC Berkeley", degree: "BSc", field: "Computer Science", start: "2014-08", end: "2018-05", gpa: "3.7" }],
  skills: ["TypeScript", "Python", "React"],
  explicit: { workAuth: "Yes", requiresSponsorship: "No", salary: null, salaryMin: "$150,000", salaryMax: "$180,000",
    startDate: null, relocation: "Yes", remote: "Remote", noticePeriod: "2 weeks",
    gender: null, race: null, hispanic: null, veteran: null, disability: null },
};
const pdfB64 = Buffer.from("%PDF-1.4\nplaceholder\n%%EOF").toString("base64");

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "ao-shots-")), {
  channel: "chromium", headless: true, viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const extId = new URL(sw.url()).host;

// seed vault: profile + resume + application history
const seedPage = await ctx.newPage();
await seedPage.goto(`chrome-extension://${extId}/sidepanel.html`);
await seedPage.waitForTimeout(1200);
await seedPage.evaluate(async ({ p, pdf }) => {
  const open = indexedDB.open("fastapply");
  const db = await new Promise((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
  const put = (store, val) => new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(val); tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  await put("profile", { id: "profile", envelope: { v: 1, enc: false, data: p }, updatedAt: Date.now() });
  await put("documents", { id: "d1", meta: { id: "d1", role: "resume", fileName: "jordan-rivera.pdf", mime: "application/pdf", size: 24, addedAt: Date.now() }, bytes: { v: 1, enc: false, data: pdf } });
  const day = 86400000;
  const jobs = [
    { id: "j1", url: "https://boards.greenhouse.io/acme/jobs/1", domain: "boards.greenhouse.io", ats: "greenhouse", title: "Senior Engineer at Acme", firstSeenAt: Date.now() - 5 * day, lastFilledAt: Date.now() - 4 * day, timesFilled: 1, fieldCount: 16, filled: 14, reviewed: 2, abstained: 0, failed: 0, status: "interviewing", reminderAt: Date.now() + 2 * day, jdSnippet: "We are hiring a senior engineer to own our platform APIs and developer tooling..." },
    { id: "j2", url: "https://jobs.lever.co/globex/2", domain: "jobs.lever.co", ats: "lever", title: "Backend Developer at Globex", firstSeenAt: Date.now() - 3 * day, lastFilledAt: Date.now() - 3 * day, timesFilled: 1, fieldCount: 12, filled: 11, reviewed: 1, abstained: 0, failed: 0, status: "applied" },
    { id: "j3", url: "https://jobs.ashbyhq.com/initech/3", domain: "jobs.ashbyhq.com", ats: "ashby", title: "Platform Engineer at Initech", firstSeenAt: Date.now() - day, timesFilled: 0, fieldCount: 0, filled: 0, reviewed: 0, abstained: 0, failed: 0, status: "saved" },
  ];
  for (const j of jobs) await put("jobs", j);
  db.close();
}, { p: profile, pdf: pdfB64 });
await seedPage.close();

// shot A: real page filled, widget list open — native 1280x800
const page = await ctx.newPage();
await page.goto(FIXTURE);
await page.waitForTimeout(3200);
await page.locator("[data-fastapply-ui]").locator("button", { hasText: /^Fill$/ }).click();
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/page-filled.png` });
// shot B: same page, widget collapsed to pill (clean fill view)
await page.locator("[data-fastapply-ui]").locator("button", { hasText: "⌄" }).click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/page-filled-pill.png` });
await page.close();

// panel shots at panel width
const panel = await ctx.newPage();
await panel.setViewportSize({ width: 420, height: 760 });
await panel.goto(`chrome-extension://${extId}/sidepanel.html`);
await panel.waitForTimeout(1500);
await panel.locator("nav.tabs button", { hasText: "Applications" }).click();
await panel.waitForTimeout(500);
await panel.screenshot({ path: `${OUT}/panel-apps.png` });
await panel.locator("nav.tabs button", { hasText: "Settings" }).click();
await panel.waitForTimeout(400);
await panel.screenshot({ path: `${OUT}/panel-settings.png` });
await panel.locator("nav.tabs button", { hasText: "Profile" }).click();
await panel.waitForTimeout(500);
await panel.screenshot({ path: `${OUT}/panel-profile.png` });
await ctx.close();
console.log("captures done");

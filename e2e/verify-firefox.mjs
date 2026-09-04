// Firefox end-to-end: build dist-firefox, launch Playwright's Firefox with the
// remote debugger, sideload the add-on over RDP (no web-ext dependency), seed
// a profile into the extension's IndexedDB, open the fixture page, confirm the
// widget auto-appears, click Fill, verify the form, then Undo and verify.
//
//   npm run build:firefox && npm run e2e:firefox
import { firefox } from "playwright";
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { FirefoxRDP } from "./firefox-rdp.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const DIST = join(ROOT, "dist-firefox");
const OUT = process.env.E2E_OUT ?? join(ROOT, "e2e", "screenshots");
const RDP_PORT = 6009;
const FIXTURE_PORT = 8902;
const FIXTURE = `http://localhost:${FIXTURE_PORT}/generic-basic/page.html`;

if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("dist-firefox missing — run `npm run build:firefox` first");
  process.exit(2);
}

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

// --- tiny static server for fixtures/ ---------------------------------------
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const file = join(ROOT, "fixtures", decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(join(ROOT, "fixtures")) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(FIXTURE_PORT, r));

// --- launch Firefox with the remote debugger, sideload the add-on -----------
const browser = await firefox.launch({
  headless: process.env.HEADED !== "1",
  args: ["-start-debugger-server", String(RDP_PORT)],
  firefoxUserPrefs: {
    "devtools.debugger.remote-enabled": true,
    "devtools.debugger.prompt-connection": false,
    "devtools.chrome.enabled": true,
    "xpinstall.signatures.required": false,
    "extensions.manifestV3.enabled": true,
    // MV3 host_permissions are optional in Firefox; a real user grants them
    // via the Settings button. Temporary add-ons get them at install here.
    "extensions.originControls.grantByDefault": true,
    "extensions.webextensions.remote": true,
  },
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const rdp = await FirefoxRDP.connect(RDP_PORT);
const addon = await rdp.installTemporaryAddon(DIST);
console.log("add-on installed:", addon.id, addon.manifestURL || "(no manifestURL)");
if (!addon.uuid) {
  console.log("FAIL: could not resolve the add-on's internal UUID");
  process.exit(1);
}
const extUrl = (p) => `moz-extension://${addon.uuid}/${p}`;

// --- 1. seed the vault from inside the add-on's background context ---------
// (Playwright's Firefox can't drive moz-extension:// pages, so we go through
// RDP's console actor — the DevTools add-on debugger channel.) Visiting the
// fixture once first makes the background open the vault, so Dexie creates
// the schema exactly as it would for a real user.
const warm = await context.newPage();
await warm.goto(FIXTURE);
await warm.waitForTimeout(3000);
const warmHost = await warm.evaluate(() => !!document.querySelector("[data-fastapply-ui]"));
console.log("content script injected on first visit:", warmHost);
await warm.close();
const seeded = await rdp.evalInAddon(addon.id, `
  const p = ${JSON.stringify(profile)};
  const open = indexedDB.open("fastapply");
  const db = await new Promise((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
  if (!db.objectStoreNames.contains("profile")) { db.close(); return { ok: false, stores: [...db.objectStoreNames] }; }
  await new Promise((res, rej) => {
    const tx = db.transaction("profile", "readwrite");
    tx.objectStore("profile").put({ id: "profile", envelope: { v: 1, enc: false, data: p }, updatedAt: Date.now() });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
  return { ok: true, version: chrome.runtime.getManifest().version, offscreen: typeof chrome.offscreen, sidebar: typeof browser.sidebarAction };
`);
console.log("vault seeded:", JSON.stringify(seeded));
if (!seeded.ok) { await browser.close(); process.exit(1); }

// --- 2. open the fixture and watch the auto-detect trail --------------------
const page = await context.newPage();
page.on("console", (m) => {
  if (m.text().includes("[ApplyOnce]")) console.log("PAGE:", m.text());
});
await page.goto(FIXTURE);
await page.waitForTimeout(3500);
const hostPresent = await page.evaluate(() => !!document.querySelector("[data-fastapply-ui]"));
console.log("widget host present:", hostPresent);
await page.screenshot({ path: join(OUT, "firefox-1-widget.png") });
if (!hostPresent) {
  console.log("FAIL: widget did not render (content script not injected?)");
  await browser.close();
  process.exit(1);
}

// --- 3. Fill ----------------------------------------------------------------
await page.locator("[data-fastapply-ui]").locator("button", { hasText: /^Fill$/ }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: join(OUT, "firefox-2-filled.png"), fullPage: true });

const result = await page.evaluate(() => ({
  fname: document.getElementById("fname")?.value,
  lname: document.getElementById("lname")?.value,
  mail: document.getElementById("mail")?.value,
  tel: document.getElementById("tel")?.value,
  city: document.getElementById("city")?.value,
  country: document.getElementById("country")?.value,
  company: document.getElementById("company")?.value,
  title: document.getElementById("title")?.value,
  workauthYes: document.querySelector('input[name="workauth"][value="yes"]')?.checked,
  sponsorNo: document.querySelector('input[name="sponsor"][value="no"]')?.checked,
  cvAttached: (document.getElementById("cv")?.files?.length ?? 0) > 0,
  consentUntouched: document.getElementById("consent")?.checked === false,
  dinoEmpty: (document.getElementById("dino")?.value ?? "") === "",
  marks: document.querySelectorAll("[data-fastapply-mark]").length,
}));
console.log("fill results:", JSON.stringify(result, null, 2));
const fillPass =
  result.fname === "Ada" && result.lname === "Lovelace" && result.mail === "ada@example.com" &&
  result.country === "GB" && result.workauthYes === true && result.sponsorNo === true &&
  result.consentUntouched && result.dinoEmpty;
console.log(fillPass ? "FILL: PASS ✅" : "FILL: FAIL ❌");

// --- 4. Undo ----------------------------------------------------------------
await page.locator("[data-fastapply-ui]").locator("button", { hasText: "Undo fill" }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: join(OUT, "firefox-3-undone.png") });
const after = await page.evaluate(() => ({
  fname: document.getElementById("fname")?.value,
  mail: document.getElementById("mail")?.value,
  country: document.getElementById("country")?.value,
  workauthAny: !!document.querySelector('input[name="workauth"]:checked'),
  sponsorAny: !!document.querySelector('input[name="sponsor"]:checked'),
  marks: document.querySelectorAll("[data-fastapply-mark]").length,
}));
console.log("after undo:", JSON.stringify(after, null, 2));
const undoPass = after.fname === "" && after.mail === "" && after.country === "" &&
  !after.workauthAny && !after.sponsorAny && after.marks === 0;
console.log(undoPass ? "UNDO: PASS ✅" : "UNDO: FAIL ❌");

// --- 5. resume parsing (Firefox: inline in the background, no offscreen) ---
// Open the panel page as a tab (an extension page is a legitimate sender),
// send PARSE_CV_REQUEST with a real, tiny PDF, and wait for PARSE_CV_RESULT.
function tinyPdf(lines) {
  const content = "BT /F1 12 Tf 50 750 Td 16 TL " + lines.map((l) => `(${l.replace(/[()\\]/g, "\\$&")}) Tj T*`).join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1").toString("base64");
}
const pdfB64 = tinyPdf(["Ada Lovelace", "ada@example.com", "+44 20 7946 0958", "Staff Engineer at Analytical Engines Ltd"]);
await rdp.evalInAddon(addon.id, `await browser.tabs.create({ url: browser.runtime.getURL("sidepanel.html") });`)
  .catch((e) => console.log("tabs.create:", e.message));
const parsed = await rdp.evalInPage(addon.id, /sidepanel\.html/, `
  const jobId = "e2e-cv-" + Math.random().toString(36).slice(2);
  const result = new Promise((res) => {
    const onMsg = (m) => { if (m && m.kind === "PARSE_CV_RESULT" && m.jobId === jobId) { chrome.runtime.onMessage.removeListener(onMsg); res(m); } };
    chrome.runtime.onMessage.addListener(onMsg);
    setTimeout(() => res({ ok: false, error: "timeout" }), 20000);
  });
  const ack = await chrome.runtime.sendMessage({ kind: "PARSE_CV_REQUEST", jobId, fileName: "ada.pdf", mime: "application/pdf", dataB64: ${JSON.stringify(pdfB64)} });
  const r = await result;
  return { ack, ok: r.ok, error: r.error, email: r.patch?.basics?.email, rawHasEmail: (r.rawText || "").includes("ada@example.com") };
`).catch((e) => ({ ok: false, error: e.message }));
console.log("cv parse:", JSON.stringify(parsed));
const cvPass = parsed.ok === true && parsed.rawHasEmail === true;
console.log(cvPass ? "CV PARSE (inline, PDF.js): PASS ✅" : "CV PARSE: FAIL ❌");

rdp.close();
await browser.close();
server.close();
process.exit(fillPass && undoPass && cvPass ? 0 : 1);

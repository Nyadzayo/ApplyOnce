import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const DIST = "/Users/mnyadzayo/projects/job-autofill/dist";
const OUT = "/private/tmp/claude-501/-Users-mnyadzayo-projects-job-autofill/1ca23142-f13d-46b0-859d-1026437e5fee/scratchpad";
const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(),"ao-")), {
  channel: "chromium", headless: true, viewport: { width: 400, height: 820 },
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
const id = new URL(sw.url()).host;
const p = await ctx.newPage();
await p.goto(`chrome-extension://${id}/sidepanel.html`);
await p.waitForTimeout(1500);
// seed profile then reload so tabs show
await p.evaluate(async () => {
  const open = indexedDB.open("fastapply");
  const db = await new Promise((res, rej) => { open.onsuccess=()=>res(open.result); open.onerror=()=>rej(open.error); });
  await new Promise((res, rej) => {
    const tx = db.transaction("profile","readwrite");
    tx.objectStore("profile").put({ id:"profile", envelope:{v:1,enc:false,data:{
      version:1, basics:{firstName:"Kelvin",lastName:"Nyadzayo",email:"kelvin@example.com",phone:"+27761891101",pronouns:""},
      location:{street:"",city:"Cape Town",region:"Western Cape",country:"South Africa",postalCode:""},
      links:{linkedin:"https://linkedin.com/in/k",github:"",portfolio:"",website:""},
      work:[{company:"Prime Circle Finance",title:"Software Engineer",start:"2025-10",end:"",current:true,location:"",description:"x"}],
      education:[], skills:["Python","TypeScript"],
      explicit:{workAuth:"Yes",requiresSponsorship:"No",salary:null,salaryMin:null,salaryMax:null,startDate:null,relocation:null,remote:null,noticePeriod:null,gender:null,race:null,hispanic:null,veteran:null,disability:null}
    }}, updatedAt: Date.now() });
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
  });
  db.close();
});
// seed a few applications so the Applications tab shows chips/pager
await p.evaluate(async () => {
  const open = indexedDB.open("fastapply");
  const db = await new Promise((res, rej) => { open.onsuccess=()=>res(open.result); open.onerror=()=>rej(open.error); });
  const jobs = [
    { id:"j1", url:"https://boards.greenhouse.io/acme/jobs/1", domain:"boards.greenhouse.io", ats:"greenhouse", title:"Staff Engineer at Acme", firstSeenAt:Date.now()-86400000*3, lastFilledAt:Date.now()-86400000*2, timesFilled:1, fieldCount:15, filled:13, reviewed:2, abstained:0, failed:0, status:"applied", jdSnippet:"We are looking for a staff engineer to lead our platform team..." },
    { id:"j2", url:"https://jobs.lever.co/globex/2", domain:"jobs.lever.co", ats:"lever", title:"Backend Developer at Globex", firstSeenAt:Date.now()-86400000, timesFilled:0, fieldCount:0, filled:0, reviewed:0, abstained:0, failed:0, status:"saved" },
    { id:"j3", url:"https://jobs.ashbyhq.com/initech/3", domain:"jobs.ashbyhq.com", ats:"ashby", title:"Platform Engineer at Initech", firstSeenAt:Date.now()-86400000*6, lastFilledAt:Date.now()-86400000*5, timesFilled:2, fieldCount:9, filled:8, reviewed:1, abstained:0, failed:0, status:"interviewing", reminderAt:Date.now()+86400000*2 },
  ];
  await new Promise((res, rej) => {
    const tx = db.transaction("jobs","readwrite");
    for (const j of jobs) tx.objectStore("jobs").put(j);
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
  });
  db.close();
});
await p.reload();
await p.waitForTimeout(1500);
await p.screenshot({ path: join(OUT, "panel-fill.png") });
await p.locator("nav.tabs button", { hasText: "Applications" }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: join(OUT, "panel-history.png"), fullPage: true });
// settings tab
await p.locator("nav.tabs button", { hasText: "Settings" }).click();
await p.waitForTimeout(400);
await p.screenshot({ path: join(OUT, "panel-settings.png") });
await ctx.close();
console.log("shots saved");

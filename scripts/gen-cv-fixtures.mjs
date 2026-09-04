// Synthetic resume corpus generator (PLAN.md Part 9 §5 Layer 0).
// Renders synthetic personas through layout templates that mimic the real
// format pool (LaTeX/Jake's, Word tables, Canva sidebars, LinkedIn export,
// Europass, ATS-plain, academic, German) to PDF via Playwright Chromium and,
// when LibreOffice is installed, to DOCX plus a second PDF producer. The
// generator knows every field it rendered, so golden labels are exact.
// No personal data: every persona is invented.
//
//   node scripts/gen-cv-fixtures.mjs          # writes fixtures/cv/bin/
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "cv", "bin");
const SOFFICE = ["/opt/homebrew/bin/soffice", "/usr/local/bin/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"].find(existsSync);

// ---------------------------------------------------------------- personas
const P = {
  amara: {
    first: "Amara", last: "Okafor", email: "amara.okafor@gmail.com", phone: "+234 803 555 0147",
    city: "Lagos", country: "Nigeria", linkedin: "linkedin.com/in/amaraokafor", headline: "Senior Product Manager",
    summary: "Product leader with 7 years shipping payment products across West Africa.",
    work: [
      { company: "PayFlow Technologies", title: "Senior Product Manager", location: "Lagos, Nigeria", start: "2021-03", end: "", bullets: ["Owned the merchant onboarding roadmap; cut activation time from 9 days to 2.", "Led a squad of 6 engineers and 2 designers across three payment rails.", "Grew monthly active merchants 3x through pricing and KYC experiments."] },
      { company: "First Bank of Nigeria", title: "Product Analyst", location: "Lagos, Nigeria", start: "2018-06", end: "2021-02", bullets: ["Built the analytics layer for the mobile app used by 4M customers.", "Ran quarterly customer research and turned findings into the backlog."] },
    ],
    education: [{ school: "University of Lagos", degree: "BSc", degreeLong: "Bachelor of Science", field: "Computer Science", start: "2013", end: "2017", gpa: "4.2/5.0" }],
    skills: ["Product strategy", "SQL", "Figma", "Jira", "A/B testing", "Roadmapping"],
    languages: ["English (native)", "Igbo (native)", "French (B1)"],
  },
  marcus: {
    first: "Marcus", last: "Webb", email: "marcus@webbdesign.io", phone: "+1 415 555 0022",
    city: "San Francisco", country: "United States", region: "CA", linkedin: "linkedin.com/in/marcuswebb", headline: "Lead Designer",
    summary: "Designer of systems that scale from a landing page to a design language.",
    work: [
      { company: "Framer", title: "Lead Designer", location: "Remote", start: "2022-01", end: "", bullets: ["Design systems for 40+ enterprise clients.", "Hired and mentored a team of four product designers."] },
      { company: "Airbnb", title: "Visual Designer", location: "San Francisco, CA", start: "2019-04", end: "2021-12", bullets: ["Shipped the host onboarding redesign, lifting completion by 18%.", "Owned illustration guidelines used across web and native apps."] },
    ],
    education: [{ school: "CalArts", degree: "BFA", degreeLong: "Bachelor of Fine Arts", field: "Graphic Design", start: "2015", end: "2019", gpa: "" }],
    skills: ["Figma", "Webflow", "Illustration", "Design systems", "Prototyping", "Motion"],
    languages: ["English (native)"],
  },
  sofia: {
    first: "Sofía", last: "Álvarez-Ruiz", email: "sofia.alvarez@gmail.com", phone: "+34 612 345 678",
    city: "Madrid", country: "Spain", linkedin: "linkedin.com/in/sofiaalvarezruiz", headline: "Technical Recruiter",
    summary: "Recruiter who fills hard engineering roles in under 30 days.",
    work: [
      { company: "Amazon Spain", title: "Recruiter", location: "Madrid, Spain", start: "2020-09", end: "", bullets: ["Closed 120+ engineering hires across EU5 with a 92% offer-accept rate.", "Built the sourcing playbook adopted by three sister teams."] },
      { company: "El Celler Restaurant", title: "Sommelier", location: "Girona, Spain", start: "2016-05", end: "2020-08", bullets: ["Curated a 600-label wine list; trained 25 front-of-house staff."] },
    ],
    education: [{ school: "Universidad Complutense de Madrid", degree: "Grado", degreeLong: "Grado", field: "Psicología", start: "2012", end: "2016", gpa: "" }],
    skills: ["Sourcing", "Workday", "Boolean search", "Employer branding", "Interviewing"],
    languages: ["Spanish (native)", "English (C1)", "Catalan (B2)"],
  },
  priya: {
    first: "Priya", last: "Raghunathan", email: "priya.r@outlook.com", phone: "+91 98765 43210",
    city: "Chennai", country: "India", linkedin: "linkedin.com/in/priyaraghunathan", headline: "Audit Associate",
    summary: "Chartered-accountancy trainee with four audit seasons at a Big Four firm.",
    work: [
      { company: "Deloitte, LLP", title: "Audit Associate", location: "Chennai, India", start: "2019-08", end: "2023-03", bullets: ["Led fieldwork on 14 statutory audits of listed manufacturing clients.", "Automated sampling workpapers in Excel, saving 60 hours per engagement."] },
      { company: "Tata Consultancy Services", title: "Intern", location: "Chennai, India", start: "2018-05", end: "2018-07", bullets: ["Reconciled intercompany balances for the finance shared-services team."] },
    ],
    education: [{ school: "Loyola College", degree: "B.Com", degreeLong: "Bachelor of Commerce", field: "Accounting and Finance", start: "2015", end: "2018", gpa: "8.6/10" }],
    skills: ["IFRS", "Excel", "SAP", "Audit planning", "Tally", "Ind AS"],
    languages: ["Tamil (native)", "English (fluent)", "Hindi (conversational)"],
  },
  lena: {
    first: "Lena", last: "Hoffmann", email: "lena.hoffmann@web.de", phone: "+49 30 1234567",
    city: "Berlin", country: "Germany", linkedin: "linkedin.com/in/lenahoffmann", headline: "Produktmanagerin",
    summary: "Produktmanagerin mit Fokus auf Checkout und Zahlungsabwicklung.",
    work: [
      { company: "Zalando SE", title: "Produktmanagerin", location: "Berlin", start: "2021-04", end: "", bullets: ["Verantwortlich für den Checkout mit 12 Mio. Bestellungen pro Monat.", "Einführung von Apple Pay in sechs Märkten."] },
      { company: "Rocket Internet", title: "Werkstudentin", location: "Berlin", start: "2019-10", end: "2021-03", bullets: ["Marktanalysen und Wettbewerbsvergleiche für neue Ventures."] },
    ],
    education: [{ school: "TU Berlin", degree: "Master of Science", degreeLong: "Master of Science", field: "Wirtschaftsinformatik", start: "2018", end: "2021", gpa: "1,7" }],
    skills: ["Produktstrategie", "SQL", "Jira", "Figma", "A/B-Tests"],
    languages: ["Deutsch (Muttersprache)", "Englisch (C1)"],
  },
};

// ---------------------------------------------------------------- helpers
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ym = (s) => [Number(s.slice(0, 4)), Number(s.slice(5, 7))];
const fmt = {
  short: (s) => { const [y, m] = ym(s); return `${MON[m - 1]} ${y}`; },
  long: (s) => { const [y, m] = ym(s); return `${MONL[m - 1]} ${y}`; },
  slash: (s) => { const [y, m] = ym(s); return `${String(m).padStart(2, "0")}/${y}`; },
  year: (s) => s.slice(0, 4),
};
const range = (w, f, present = "Present", dash = "–") => `${f(w.start)} ${dash} ${w.end ? f(w.end) : present}`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const ul = (items, mark = "") => `<ul>${items.map((b) => `<li>${mark}${esc(b)}</li>`).join("")}</ul>`;
const page = (css, body, font = "Helvetica, Arial, sans-serif") =>
  `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 16mm; }
  body { font-family: ${font}; font-size: 10.5pt; color: #111; line-height: 1.35; }
  h1, h2, h3, p, ul { margin: 0; } ul { padding-left: 16px; } li { margin: 2px 0; }
  .row { display: flex; justify-content: space-between; }
  ${css}</style></head><body>${body}</body></html>`;

// ---------------------------------------------------------------- templates
const T = {
  // 1. Jake's-resume / LaTeX look: bold company, right-aligned dates, italic title, uppercase ruled headings
  "classic-right-dates": (p) => page(`
    h1 { font-size: 22pt; text-align: center; } .contact { text-align: center; margin: 4px 0 10px; }
    h2 { font-size: 11.5pt; text-transform: uppercase; border-bottom: 1px solid #000; margin: 12px 0 6px; letter-spacing: 1px; }
    .entry { margin-bottom: 8px; }`,
    `<h1>${esc(p.first)} ${esc(p.last)}</h1>
     <p class="contact">${esc(p.city)}, ${esc(p.country)} · ${esc(p.phone)} · ${esc(p.email)} · ${esc(p.linkedin)}</p>
     <h2>Experience</h2>
     ${p.work.map((w) => `<div class="entry"><div class="row"><b>${esc(w.company)}</b><span>${range(w, fmt.short)}</span></div>
       <div class="row"><i>${esc(w.title)}</i><span>${esc(w.location)}</span></div>${ul(w.bullets)}</div>`).join("")}
     <h2>Education</h2>
     ${p.education.map((e) => `<div class="entry"><div class="row"><b>${esc(e.school)}</b><span>${e.start} – ${e.end}</span></div>
       <div class="row"><i>${esc(e.degreeLong)} in ${esc(e.field)}</i><span>${e.gpa ? "GPA: " + e.gpa : ""}</span></div></div>`).join("")}
     <h2>Skills</h2><p>${p.skills.map(esc).join(", ")}</p>
     <h2>Languages</h2><p>${p.languages.map(esc).join(" · ")}</p>`),

  // 2. Title-first, company on next line, dates on their own line (Google Docs "Serif")
  "dates-own-line": (p) => page(`
    h1 { font-size: 26pt; font-weight: normal; } .sub { color: #444; margin-bottom: 8px; }
    h2 { font-size: 13pt; margin: 14px 0 6px; color: #1a4d8f; } .entry { margin-bottom: 10px; }
    .muted { color: #666; font-size: 9.5pt; }`,
    `<h1>${esc(p.first)} ${esc(p.last)}</h1>
     <p class="sub">${esc(p.headline)}</p>
     <p>${esc(p.email)} | ${esc(p.phone)} | ${esc(p.city)}, ${esc(p.country)}</p>
     <h2>Summary</h2><p>${esc(p.summary)}</p>
     <h2>Work Experience</h2>
     ${p.work.map((w) => `<div class="entry"><b>${esc(w.title)}</b><br>${esc(w.company)}, ${esc(w.location)}<br>
       <span class="muted">${range(w, fmt.long, "Present", "—")}</span>${ul(w.bullets)}</div>`).join("")}
     <h2>Education</h2>
     ${p.education.map((e) => `<div class="entry"><b>${esc(e.degreeLong)}, ${esc(e.field)}</b><br>${esc(e.school)}<br><span class="muted">${e.start} — ${e.end}</span></div>`).join("")}
     <h2>Skills</h2>${ul(p.skills)}`, "Georgia, 'Times New Roman', serif"),

  // 3. Canva-style sidebar: contact + skills in a narrow left column
  sidebar: (p) => page(`
    .head { background: #223; color: #fff; padding: 14px 18px; margin: 0 0 10px; }
    .head h1 { font-size: 24pt; } .grid { display: grid; grid-template-columns: 30% 1fr; gap: 24px; }
    h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 1.5px; margin: 12px 0 5px; color: #223; }
    .side p, .side li { font-size: 9.5pt; } .side ul { padding-left: 12px; }
    .entry { margin-bottom: 9px; } .meta { color: #555; font-size: 9.5pt; }`,
    `<div class="head"><h1>${esc(p.first)} ${esc(p.last)}</h1><p>${esc(p.headline)}</p></div>
     <div class="grid"><div class="side">
       <h2>Contact</h2><p>${esc(p.email)}</p><p>${esc(p.phone)}</p><p>${esc(p.city)}, ${esc(p.country)}</p><p>${esc(p.linkedin)}</p>
       <h2>Skills</h2>${ul(p.skills)}
       <h2>Languages</h2>${ul(p.languages)}
     </div><div class="main">
       <h2>Profile</h2><p>${esc(p.summary)}</p>
       <h2>Experience</h2>
       ${p.work.map((w) => `<div class="entry"><b>${esc(w.company)}</b><br>${esc(w.title)}<br><span class="meta">${range(w, fmt.short)} | ${esc(w.location)}</span>${ul(w.bullets)}</div>`).join("")}
       <h2>Education</h2>
       ${p.education.map((e) => `<div class="entry"><b>${esc(e.school)}</b><br>${esc(e.degree)} ${esc(e.field)}<br><span class="meta">${e.start} – ${e.end}</span></div>`).join("")}
     </div></div>`),

  // 4. Word template built from tables (header table + one table per entry)
  "word-table": (p) => page(`
    table { width: 100%; border-collapse: collapse; } td { padding: 1px 0; vertical-align: top; }
    td.r { text-align: right; } h1 { font-size: 20pt; }
    h2 { font-size: 12pt; margin: 12px 0 4px; border-bottom: 2px solid #999; }`,
    `<table width="100%"><tr><td><h1>${esc(p.first)} ${esc(p.last)}</h1></td><td class="r">${esc(p.email)}<br>${esc(p.phone)}<br>${esc(p.city)}, ${esc(p.country)}</td></tr></table>
     <h2>Professional Experience</h2>
     ${p.work.map((w) => `<table width="100%"><tr><td><b>${esc(w.company)}</b></td><td class="r">${range(w, fmt.slash, "present", "-")}</td></tr>
       <tr><td><i>${esc(w.title)}</i></td><td class="r">${esc(w.location)}</td></tr></table>${ul(w.bullets)}`).join("")}
     <h2>Education</h2>
     ${p.education.map((e) => `<table width="100%"><tr><td><b>${esc(e.school)}</b></td><td class="r">${e.start} - ${e.end}</td></tr>
       <tr><td>${esc(e.degreeLong)}, ${esc(e.field)}${e.gpa ? `, GPA ${e.gpa}` : ""}</td><td class="r"></td></tr></table>`).join("")}
     <h2>Skills</h2><p>${p.skills.map(esc).join(" • ")}</p>`, "Calibri, Carlito, Arial, sans-serif"),

  // 5. LinkedIn PDF export look-alike (left contact column, durations, page footer)
  "linkedin-export": (p) => page(`
    .grid { display: grid; grid-template-columns: 26% 1fr; gap: 20px; }
    .side h3 { font-size: 11pt; margin: 8px 0 3px; } .side p { font-size: 9pt; color: #333; }
    h1 { font-size: 24pt; } .hl { font-size: 12pt; margin: 2px 0; } .loc { color: #555; margin-bottom: 8px; }
    h2 { font-size: 14pt; margin: 14px 0 6px; } .entry { margin-bottom: 10px; } .co { font-size: 11.5pt; font-weight: bold; }
    .dur { color: #555; font-size: 9.5pt; } footer { position: fixed; bottom: 4mm; right: 0; font-size: 8pt; color: #888; }`,
    `<div class="grid"><div class="side">
       <h3>Contact</h3><p>${esc(p.phone)} (Mobile)</p><p>${esc(p.email)}</p><p>www.${esc(p.linkedin)}</p>
       <h3>Top Skills</h3>${p.skills.slice(0, 3).map((s) => `<p>${esc(s)}</p>`).join("")}
       <h3>Languages</h3>${p.languages.map((s) => `<p>${esc(s)}</p>`).join("")}
     </div><div>
       <h1>${esc(p.first)} ${esc(p.last)}</h1>
       <p class="hl">${esc(p.headline)} at ${esc(p.work[0].company)}</p>
       <p class="loc">${esc(p.city)}, ${esc(p.country)}</p>
       <h2>Summary</h2><p>${esc(p.summary)}</p>
       <h2>Experience</h2>
       ${p.work.map((w) => `<div class="entry"><div class="co">${esc(w.company)}</div><div>${esc(w.title)}</div>
         <div class="dur">${range(w, fmt.long, "Present", "-")} (${duration(w)})</div><div class="dur">${esc(w.location)}</div>${ul(w.bullets)}</div>`).join("")}
       <h2>Education</h2>
       ${p.education.map((e) => `<div class="entry"><div class="co">${esc(e.school)}</div><div>${esc(e.degreeLong)} - ${esc(e.degree)}, ${esc(e.field)} · (${e.start} - ${e.end})</div></div>`).join("")}
     </div></div><footer>Page 1 of 1</footer>`),

  // 6. Europass: dates in a left label column, position bold, employer below
  europass: (p) => page(`
    .top { display: flex; justify-content: space-between; border-bottom: 3px solid #1e5aa8; padding-bottom: 6px; }
    .top h1 { font-size: 18pt; color: #1e5aa8; } .top .cv { font-size: 9pt; color: #1e5aa8; text-transform: uppercase; }
    h2 { font-size: 11pt; text-transform: uppercase; color: #1e5aa8; margin: 14px 0 6px; border-bottom: 1px solid #1e5aa8; }
    .e { display: grid; grid-template-columns: 24% 1fr; gap: 12px; margin-bottom: 8px; } .d { color: #333; }`,
    `<div class="top"><div><span class="cv">Curriculum vitae</span><h1>${esc(p.first)} ${esc(p.last)}</h1></div>
       <div style="text-align:right;font-size:9.5pt">${esc(p.city)}, ${esc(p.country)}<br>${esc(p.phone)}<br>${esc(p.email)}</div></div>
     <h2>Work experience</h2>
     ${p.work.map((w) => `<div class="e"><div class="d">${range(w, fmt.slash, "Present", "–")}</div><div><b>${esc(w.title)}</b><br>${esc(w.company)}, ${esc(w.location)}${ul(w.bullets, "▪ ")}</div></div>`).join("")}
     <h2>Education and training</h2>
     ${p.education.map((e) => `<div class="e"><div class="d">${e.start} – ${e.end}</div><div><b>${esc(e.degreeLong)} in ${esc(e.field)}</b><br>${esc(e.school)}, ${esc(p.city)} (${esc(p.country)})</div></div>`).join("")}
     <h2>Personal skills</h2>
     <div class="e"><div class="d">Mother tongue(s)</div><div>${esc(p.languages[0])}</div></div>
     <div class="e"><div class="d">Digital skills</div><div>${p.skills.map(esc).join(", ")}</div></div>`, "Arial, Helvetica, sans-serif"),

  // 7. ATS-plain builder output: all-caps headings, title comma company, no bold at all
  "ats-plain": (p) => page(`
    h1 { font-size: 16pt; font-weight: normal; text-transform: uppercase; } h2 { font-size: 11pt; font-weight: normal; text-transform: uppercase; margin: 12px 0 4px; }
    .entry { margin-bottom: 8px; }`,
    `<h1>${esc(p.first)} ${esc(p.last)}</h1>
     <p>${esc(p.city)}, ${esc(p.country)}</p><p>${esc(p.phone)}</p><p>${esc(p.email)}</p>
     <h2>Professional Summary</h2><p>${esc(p.summary)}</p>
     <h2>Employment History</h2>
     ${p.work.map((w) => `<div class="entry"><p>${esc(w.title)}, ${esc(w.company)}</p><p>${range(w, fmt.short, "Current", "to")} | ${esc(w.location)}</p>${ul(w.bullets)}</div>`).join("")}
     <h2>Education</h2>
     ${p.education.map((e) => `<div class="entry"><p>${esc(e.degreeLong)}, ${esc(e.field)}</p><p>${esc(e.school)}, ${e.end}</p></div>`).join("")}
     <h2>Skills</h2><p>${p.skills.map(esc).join(", ")}</p>`, "Arial, Helvetica, sans-serif"),

  // 8. Academic CV: credentials after the name, education first, publications
  academic: (p) => page(`
    h1 { font-size: 18pt; } h2 { font-size: 12pt; margin: 12px 0 5px; font-variant: small-caps; border-bottom: 1px solid #333; }
    .entry { margin-bottom: 7px; } .meta { font-style: italic; }`,
    `<h1>${esc(p.first)} ${esc(p.last)}, ${esc(p.education[0].degree)}</h1>
     <p>${esc(p.email)} · ${esc(p.phone)} · ${esc(p.linkedin)}</p>
     <h2>Education</h2>
     ${p.education.map((e) => `<div class="entry"><div class="row"><b>${esc(e.school)}</b><span>${e.start}–${e.end}</span></div><div class="meta">${esc(e.degreeLong)} in ${esc(e.field)}${e.gpa ? `, GPA ${e.gpa}` : ""}</div></div>`).join("")}
     <h2>Professional Experience</h2>
     ${p.work.map((w) => `<div class="entry"><div class="row"><b>${esc(w.title)}</b><span>${range(w, fmt.short, "present", "–")}</span></div><div class="meta">${esc(w.company)}, ${esc(w.location)}</div>${ul(w.bullets)}</div>`).join("")}
     <h2>Publications</h2>
     <p>${esc(p.last)}, ${esc(p.first[0])}. (${p.education[0].end}). A study of ${esc(p.education[0].field.toLowerCase())} practice. <i>Journal of Applied Work</i>, 12(3), 45–67.</p>
     <h2>Technical Skills</h2><p>${p.skills.map(esc).join("; ")}</p>`, "'Times New Roman', Times, serif"),

  // 9. German tabular CV ("seit", MM/YYYY, dates at the left)
  german: (p) => page(`
    h1 { font-size: 20pt; } h2 { font-size: 12pt; margin: 12px 0 5px; color: #333; border-bottom: 1px solid #333; }
    .e { display: grid; grid-template-columns: 22% 1fr; margin-bottom: 6px; }`,
    `<h1>${esc(p.first)} ${esc(p.last)}</h1>
     <p>${esc(p.city)} · ${esc(p.phone)} · ${esc(p.email)}</p>
     <h2>Berufserfahrung</h2>
     ${p.work.map((w) => `<div class="e"><div>${w.end ? `${fmt.slash(w.start)} – ${fmt.slash(w.end)}` : `seit ${fmt.slash(w.start)}`}</div><div><b>${esc(w.title)}</b>, ${esc(w.company)}, ${esc(w.location)}${ul(w.bullets)}</div></div>`).join("")}
     <h2>Ausbildung</h2>
     ${p.education.map((e) => `<div class="e"><div>${e.start} – ${e.end}</div><div><b>${esc(e.degreeLong)} ${esc(e.field)}</b>, ${esc(e.school)}${e.gpa ? ` (Note ${e.gpa})` : ""}</div></div>`).join("")}
     <h2>Kenntnisse</h2><p>${p.skills.map(esc).join(", ")}</p>
     <h2>Sprachen</h2><p>${p.languages.map(esc).join(", ")}</p>`),

  // 11. LaTeX "Jake's resume" itemize layout: company | location line, then a
  // bulleted "title | dates" item, then ◦ sub-bullets with bold lead-ins.
  // Markers are real glyphs (LaTeX emits them as text, unlike Chromium lists).
  "latex-itemize": (p) => page(`
    h1 { font-size: 17pt; } h2 { font-size: 12pt; font-variant: small-caps; border-bottom: 1px solid #000; margin: 10px 0 4px; }
    .b { padding-left: 10px; } .s { padding-left: 24px; } .row { margin: 0; }`,
    `<div class="row"><h1>${esc(p.first)} ${esc(p.last)}</h1><span>Email : ${esc(p.email)}</span></div>
     <div class="row"><span>LinkedIn</span><span>Mobile : ${esc(p.phone)}</span></div>
     <h2>Experience</h2>
     ${p.work.map((w) => `<div class="row"><b>${esc(w.company)}</b><span>${esc(w.location)}</span></div>
       <div class="row b"><span>• <i>${esc(w.title)}</i></span><span><i>${range(w, fmt.short, "Present", "–")}</i></span></div>
       ${w.bullets.map((x, i) => `<div class="s">◦ <b>${esc(x.split(" ").slice(0, 2).join(" "))}</b>: ${esc(x)}</div>`).join("")}`).join("")}
     <h2>Education</h2>
     ${p.education.map((e) => `<div class="row"><b>${esc(e.school)}</b><span>${esc(p.city)}, ${esc(p.country)}</span></div>
       <div class="row b"><span>• <i>${esc(e.degreeLong)} in ${esc(e.field)}</i></span><span><i>${e.start} – ${e.end}</i></span></div>`).join("")}
     <h2>Skills</h2><div class="b">• <b>Tools</b>: ${p.skills.map(esc).join(", ")}</div>
     <h2>Projects</h2><div class="b">• <b>Side project</b>: A small ${esc(p.skills[0])} tool used by friends. 2020 – 2021</div>`, "'Times New Roman', Times, serif"),

  // 10. Small-caps headings (synthesized: splits text items like LaTeX), inline "Title, Company (Location)"
  "smallcaps-inline": (p) => page(`
    h1 { font-size: 21pt; font-variant: small-caps; } h2 { font-size: 12.5pt; font-variant: small-caps; margin: 12px 0 4px; letter-spacing: 1px; }
    .entry { margin-bottom: 7px; }`,
    `<h1>${esc(p.first)} ${esc(p.last)}</h1>
     <p>${esc(p.email)} — ${esc(p.phone)} — ${esc(p.city)}, ${esc(p.country)}</p>
     <h2>Experience</h2>
     ${p.work.map((w) => `<div class="entry"><div class="row"><span><b>${esc(w.title)}</b>, ${esc(w.company)} (${esc(w.location)})</span><span>${range(w, fmt.year, "Present")}</span></div>${ul(w.bullets)}</div>`).join("")}
     <h2>Education</h2>
     ${p.education.map((e) => `<div class="entry"><div class="row"><span><b>${esc(e.degree)} ${esc(e.field)}</b>, ${esc(e.school)}</span><span>${e.start} – ${e.end}</span></div></div>`).join("")}
     <h2>Skills</h2><p>${p.skills.map(esc).join(" · ")}</p>`),
};

function duration(w) {
  const [ys, ms] = ym(w.start);
  const [ye, me] = w.end ? ym(w.end) : [2026, 9];
  const months = (ye - ys) * 12 + (me - ms) + 1;
  const y = Math.floor(months / 12), m = months % 12;
  return [y ? `${y} year${y > 1 ? "s" : ""}` : "", m ? `${m} month${m > 1 ? "s" : ""}` : ""].filter(Boolean).join(" ");
}

function golden(p, opts = {}) {
  return {
    dates: opts.dates ?? "month",
    minSkills: opts.minSkills ?? 4,
    firstName: p.first, lastName: p.last, email: p.email, phone: p.phone,
    work: p.work.map((w) => ({ company: w.company, title: w.title, location: w.location, start: w.start, end: w.end, current: !w.end })),
    education: p.education.map((e) => ({ school: e.school, field: e.field, degree: e.degree })),
  };
}

// ---------------------------------------------------------------- render
const DOCX_TEMPLATES = ["classic-right-dates", "dates-own-line", "word-table", "ats-plain"];
const jobs = [];
for (const [tname, render] of Object.entries(T)) {
  for (const [pname, p] of Object.entries(P)) {
    if ((tname === "german") !== (pname === "lena")) continue; // Lena only renders the German template
    const opts = tname === "smallcaps-inline" ? { dates: "year" } : tname === "linkedin-export" ? { minSkills: 3 } : {};
    jobs.push({ name: `${tname}--${pname}`, html: render(p), gold: golden(p, opts), docx: DOCX_TEMPLATES.includes(tname) });
  }
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f !== "golden.json") rmSync(join(OUT, f));
const gold = {};
const tmp = join(tmpdir(), `applyonce-cv-${Date.now()}`);
mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch();
const pg = await browser.newPage();
for (const j of jobs) {
  await pg.setContent(j.html, { waitUntil: "load" });
  await pg.pdf({ path: join(OUT, `${j.name}.pdf`), format: "A4", printBackground: true, preferCSSPageSize: true });
  gold[`${j.name}.pdf`] = j.gold;
  // LibreOffice's HTML import has no flexbox: a flex row would collapse into
  // one run ("Senior Product ManagerLagos"), which no real Word resume does.
  // Word templates use tables for that layout, so hand LibreOffice a table.
  if (j.docx) writeFileSync(join(tmp, `${j.name}.html`), j.html.replace(
    /<div class="row">(.*?)<\/div>/g,
    (_, inner) => `<table width="100%"><tr><td>${inner.replace(/<span>.*$/, "")}</td><td align="right">${(inner.match(/<span>(.*?)<\/span>/) ?? ["", ""])[1]}</td></tr></table>`));
}
await browser.close();
console.log(`chromium pdf: ${jobs.length}`);

const htmls = readdirSync(tmp).filter((f) => f.endsWith(".html"));
if (SOFFICE && htmls.length) {
  try {
    execFileSync(SOFFICE, ["--headless", "--convert-to", 'docx:MS Word 2007 XML', "--outdir", tmp, ...htmls.map((f) => join(tmp, f))], { stdio: "pipe", timeout: 180000 });
    const docxs = readdirSync(tmp).filter((f) => f.endsWith(".docx"));
    execFileSync(SOFFICE, ["--headless", "--convert-to", "pdf", "--outdir", join(tmp, "lo"), ...docxs.map((f) => join(tmp, f))], { stdio: "pipe", timeout: 180000 });
    for (const f of docxs) {
      const base = f.replace(/\.docx$/, "");
      copyFileSync(join(tmp, f), join(OUT, f));
      gold[f] = jobs.find((j) => j.name === base).gold;
      const lo = join(tmp, "lo", `${base}.pdf`);
      if (existsSync(lo)) { copyFileSync(lo, join(OUT, `${base}--lo.pdf`)); gold[`${base}--lo.pdf`] = gold[f]; }
    }
    console.log(`libreoffice docx: ${docxs.length}`);
  } catch (e) {
    console.warn("libreoffice conversion failed:", String(e.stderr ?? e.message).slice(0, 300));
  }
} else if (!SOFFICE) console.warn("soffice not found: DOCX fixtures skipped");
// scanned-resume corpus: 200 dpi page images of a few layouts (OCR path)
const SCAN_TEMPLATES = ["classic-right-dates", "ats-plain", "linkedin-export", "word-table"];
const SCAN = join(OUT, "..", "scan");
if (SOFFICE) {
  mkdirSync(SCAN, { recursive: true });
  const scanGold = {};
  const pdfs = jobs
    .filter((j) => SCAN_TEMPLATES.includes(j.name.split("--")[0]) && /--(priya|amara)$/.test(j.name))
    .map((j) => join(OUT, `${j.name}.pdf`));
  try {
    execFileSync(SOFFICE, ["--headless", "--convert-to", 'png:draw_png_Export:{"PixelWidth":{"type":"long","value":"1654"},"PixelHeight":{"type":"long","value":"2339"}}', "--outdir", SCAN, ...pdfs], { stdio: "pipe", timeout: 180000 });
    for (const p of pdfs) {
      const name = p.split("/").pop().replace(/\.pdf$/, "");
      if (existsSync(join(SCAN, `${name}.png`))) scanGold[`${name}.png`] = jobs.find((j) => j.name === name).gold;
    }
    writeFileSync(join(SCAN, "golden.json"), JSON.stringify(scanGold, null, 1) + "\n");
    console.log(`scan pngs: ${Object.keys(scanGold).length}`);
  } catch (e) {
    console.warn("scan rendering failed:", String(e.stderr ?? e.message).slice(0, 200));
  }
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(OUT, "golden.json"), JSON.stringify(gold, null, 1) + "\n");
console.log(`wrote ${Object.keys(gold).length} fixtures + golden.json to ${OUT}`);

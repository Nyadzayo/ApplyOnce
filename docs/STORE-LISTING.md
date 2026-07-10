# Chrome Web Store listing — ApplyOnce (paste-ready)

Derived from docs/ASO-REPORT.md (verified competitor/keyword research).
Rule: never list an ATS the extension doesn't actually handle.

## Name (45 char max)
ApplyOnce: Job Application Autofill

## Summary (132 char max)
Autofill job applications on Greenhouse, Lever, Ashby & more from your resume. You review, you submit. Data stays local.

## Category / language
Productivity (Workflow & Planning) / English

## Detailed description

Autofill job applications in one click. ApplyOnce reads your resume or CV once, then fills applications on Greenhouse, Lever, Ashby, and thousands of company career sites — name, contact details, links, work history, education, work authorization, and your saved answers to repeated questions. Your resume file attaches itself, too.

YOU STAY IN CONTROL
• Never auto-submits. You review every application and press submit yourself — there is no auto-apply mode to get wrong.
• Never guesses. A field ApplyOnce isn't sure about is flagged for you instead of filled wrong. Green means filled and verified, amber means check me.
• One-click undo. Every fill leaves a receipt; restore any form to exactly how it was.

YOUR DATA NEVER LEAVES YOUR DEVICE
• No account, no signup, no cloud. Your profile, resume, and history live in your browser's local storage.
• Nothing is transmitted — no analytics, no telemetry, no tracking. The source code is public on GitHub.
• Optional passphrase encryption (AES-GCM) for your profile and documents.
• Sensitive questions (work authorization, sponsorship, EEO, salary) fill only from answers you explicitly set — never inferred.

FILL EVERY KIND OF FIELD
• Text, dropdowns, radio buttons, checkboxes, multi-selects, date fields, and searchable comboboxes.
• Country, state, and phone country-code dropdowns resolved intelligently ("South Africa" matches "South Africa (ZA)" or "+27").
• Resume/CV file upload — the real file, attached automatically.
• Skills checkbox groups matched against your profile, salary ranges from your set bounds.

REUSE YOUR BEST ANSWERS
Save an answer once ("Why do you want to work here?") and ApplyOnce fills it whenever the question appears again — even reworded. Templates support {company} and {role}, personalized automatically from the job page.

BUILT-IN APPLICATION TRACKER
Every job you scan or fill is tracked: statuses (Saved, Applied, Interviewing, Offer, Rejected), follow-up reminders, a snapshot of the job description that survives after the posting is taken down, search, and CSV export. Replace the spreadsheet.

GETTING STARTED (UNDER 3 MINUTES)
1. Drop in your resume (PDF or DOCX — LinkedIn's "Save to PDF" works too). It's parsed on your device into a profile you review and correct.
2. Set your explicit answers: work authorization, sponsorship, salary, optional EEO responses.
3. Open any job posting. ApplyOnce detects the application form and shows a small badge — click Fill, review, submit.

HONEST LIMITS
Multi-page enterprise portals like Workday are not fully supported yet. On unfamiliar forms, unrecognized questions are flagged for you rather than answered — that's by design.

Free, open source, and local-first. Questions or a form that didn't fill right? Report it on GitHub and it becomes a test case.

## Screenshot captions (1280x800, this order)
1. One click fills the whole application. Green means verified, amber means check me.
2. It never submits. You review everything — and Undo restores the form instantly.
3. Your resume attaches itself. The real file, every time.
4. Track every application: statuses, follow-up reminders, CSV export.
5. No account. No cloud. Your profile lives on your device.

## Assets
media/out/: PromoTile 1280x800 · SmallTile 440x280 · Marquee 1440x680
Homepage: https://nyadzayo.github.io/ApplyOnce/
Support: https://github.com/Nyadzayo/ApplyOnce/issues

## Review fields
Single purpose: Fills job application forms with the user's locally stored profile.

Permission justifications:
- Host access (all sites): Detects and fills job application forms on any careers site the user visits. Detection runs entirely on-device; pages that are not job applications are ignored. No page content is ever transmitted.
- storage: Stores the user's profile, resume file, saved answers, and application history locally.
- scripting/activeTab: Injects the form-filling script when the user requests a fill.
- offscreen: Parses the user's resume file (PDF/DOCX) locally.
- alarms/notifications: User-scheduled follow-up reminders for applications.
- sidePanel: Hosts the review UI where the user approves every fill.

Privacy tab: collects PII (name/contact), professional background, website
content (form structure) — all stored locally, none transmitted/sold/shared.
Certify Limited Use. Privacy policy: https://nyadzayo.github.io/ApplyOnce/privacy.html

## Don'ts (from the research)
- No Workday in keywords until the adapter is genuinely good (reviews enforce).
- No "auto apply"/"job bot" keywords — the 2.9-star trust graveyard.
- No keyword lists/stuffing — CWS spam policy.

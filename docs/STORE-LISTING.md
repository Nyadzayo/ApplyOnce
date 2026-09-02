# Chrome Web Store listing — ApplyOnce (paste-ready)

Derived from docs/ASO-REPORT.md (verified competitor/keyword research).
Rule: never list an ATS the extension doesn't actually handle.

## Pre-submission checklist for 0.2.0 (2026-09-02)

The Chrome Web Store has no release-notes field: the "What's new" block
below goes at the END of the detailed description. Then check, in order:
1. Detailed description = the text in this file (it now covers scans and
   photos, "check this" flags, re-import and the on-device classifier).
2. Permission justifications: the `offscreen` entry changed (below). No new
   permissions in 0.2.0.
3. Privacy tab: no new data categories. Remote code stays "No" — the
   classifier downloads model *data* (ONNX weights, tokenizer, label map)
   from a GitHub Release of this repo; every script and wasm runtime is
   bundled in the ZIP.
4. Privacy policy: site/privacy.html gained the OCR and model-download
   sentences. It is published by GitHub Pages from `main`, so merge
   release/v0.2.0 first and confirm
   https://nyadzayo.github.io/ApplyOnce/privacy.html shows them before you
   submit; reviewers open that URL.
5. Screenshots: captions 1-5 still hold; add 6-7 below for the new flows
   (1280x800, RGB PNG, no alpha).
6. Version in the dashboard reads 0.2.0 (from the ZIP's manifest).

## What's new in 0.2.0 (append to the end of the detailed description)

What's new in 0.2
• Reads more resumes: LaTeX, Word and Canva layouts, LinkedIn PDF exports, and now scanned or photographed resumes (on-device text recognition, nothing uploaded).
• Fields the parser is less sure about are marked "check this" on the review screen.
• Import an updated resume from the Profile tab at any time.
• Fewer wrong or empty fields, thanks to a rebuilt question lexicon.
• On-device question classifier for questions the rules cannot map: on by default (switch it off in Settings), downloads a 37 MB model once, runs locally, and only ever suggests, never fills silently.

## Name (45 char max)
ApplyOnce: Job Application Autofill

## Summary (132 char max)
Autofill job applications on Greenhouse, Lever, Ashby & more from your resume. You review, you submit. Data stays local.

## Category / language
Productivity (Workflow & Planning) / English

## Detailed description

(Complies with CWS Listing Requirements: no keyword repeated more than 5
times, no brand/keyword lists without purpose, no testimonials, sentence-case
headers. Recheck counts after any edit.)

Autofill job applications in one click. ApplyOnce reads your resume or CV once (PDF, DOCX, or even a scan or photo), then completes forms on Greenhouse, Lever, Ashby, and thousands of company career sites: name, contact details, links, work history, education, authorization status, and your saved answers to repeated questions. Your resume file attaches itself too.

You stay in control
• It never submits for you. You review every application and press submit yourself; there is no auto-apply mode to get wrong.
• It never guesses. An uncertain field is flagged for you instead of answered wrong. Green means verified, amber means check me. When a question is new, an on-device classifier may suggest an answer, always in amber, never filled silently.
• One-click undo restores any form to exactly how it was.

Your data never leaves your device
• No account, no signup, no cloud. Your profile, documents, and history live in your browser's local storage. Resume parsing, text recognition of scans, and the question classifier all run on your device; the classifier's model files are downloaded once from our GitHub release, and that download carries nothing about you.
• Anonymous usage statistics only: the extension reports which features run and whether they succeed — never form values, resume content, or page addresses — and you can switch this off in Settings. The source code is public on GitHub.
• Optional passphrase encryption (AES-GCM) for your profile and documents.
• Sensitive questions (work authorization, sponsorship, EEO, salary) are answered only from responses you explicitly set, never inferred.

Every kind of field
• Autofill handles text boxes, dropdowns, radio buttons, checkboxes, multi-selects, dates, and searchable comboboxes.
• Country, state, and phone-code menus resolved intelligently ("South Africa" matches "South Africa (ZA)" or "+27").
• CV upload handled automatically, using your real file.
• Skills checkbox groups matched to your profile; salary ranges from your set bounds.

Reuse your best answers
Save a response once ("Why do you want to work here?") and it is reused whenever the question appears again, even reworded. Templates support {company} and {role}, personalized from the page you are on.

Built-in job application tracker
Every posting you scan is remembered: statuses (Saved, Applied, Interviewing, Offer, Rejected), follow-up reminders, a snapshot of the description that survives after the posting closes, search, and CSV export. Your whole job search, organized without a spreadsheet.

Getting started takes about three minutes
1. Drop in your resume (PDF, DOCX, or a scan or photo; LinkedIn's "Save to PDF" export works too). It is parsed on your device into a profile you review and correct; anything read with lower confidence is marked "check this". Got a newer version later? Import it from the Profile tab.
2. Set your explicit answers: work authorization, sponsorship, salary, optional EEO responses.
3. Open any job posting. ApplyOnce detects the form and shows a small badge. Click Fill, review, submit.

Honest limits
Multi-page enterprise portals like Workday are not fully supported yet. Unrecognized questions are flagged for you rather than answered; that is by design.

Free, open source, local-first job application autofill. If a form does not fill right, report it on GitHub and it becomes a test case.

## Screenshot captions (1280x800, this order)
1. One click fills the whole application. Green means verified, amber means check me.
2. It never submits. You review everything — and Undo restores the form instantly.
3. Your resume attaches itself. The real file, every time.
4. Track every application: statuses, follow-up reminders, CSV export.
5. No account. No cloud. Your profile lives on your device.
6. Scanned or photographed resume? Read on your device, with "check this" on anything uncertain. (new in 0.2)
7. New resume? Import it from the Profile tab; your answers and settings stay. (new in 0.2)

## Assets (media/out/ — dimensions in filenames, verified against CWS spec)
- screenshot-1-1280x800.png       (screenshot slot; 1280x800 required)
- small-promo-tile-440x280.png    (small promo tile; 440x280 required)
- marquee-promo-tile-1400x560.png (marquee; 1400x560 required — NOT 1440x680)
- social-square-1080x1080.png     (social, not for the store dashboard)
- social-og-card-1200x630.png     (OpenGraph/Twitter, not for the store dashboard)
All RGB PNG, no alpha. Store icon comes from the ZIP (icons/icon128.png).
Homepage: https://nyadzayo.github.io/ApplyOnce/
Support: https://github.com/Nyadzayo/ApplyOnce/issues

## Review fields
Single purpose: Fills job application forms with the user's locally stored profile.

Permission justifications:
- Host access (all sites): Detects and fills job application forms on any careers site the user visits. Detection runs entirely on-device; pages that are not job applications are ignored. No page content is ever transmitted.
- storage: Stores the user's profile, resume file, saved answers, and application history locally.
- scripting/activeTab: Injects the form-filling script when the user requests a fill.
- offscreen: Parses the user's resume file (PDF/DOCX/image) locally, including on-device text recognition of scans and the on-device question classifier; nothing is sent anywhere.
- alarms/notifications: User-scheduled follow-up reminders for applications.
- sidePanel: Hosts the review UI where the user approves every fill.

### Privacy tab — exact checkbox answers

Data types collected (check ONLY these four — updated 2026-07-24 for
telemetry):
[x] Personally identifiable information
    (user-entered profile: name, email, phone, address; resume file)
[x] Web history
    (job-page URLs, titles, and visit times stored in the LOCAL application
    tracker only)
[x] Website content
    (form structure read to fill; optional posting-text snapshot, local only)
[x] User activity
    (anonymous feature-usage and error events sent to Google Analytics:
    event counts, job-platform name, fill outcome counts, browser language
    and timezone under a random id. Never form values, resume content, page
    addresses, or keystrokes. Opt-out toggle in Settings)

Leave UNCHECKED: Health information; Financial and payment information
(salary expectation is user-entered profile data, not transactions/cards);
Authentication information (the optional vault passphrase is never stored or
transmitted); Personal communications; Location (city/country are typed by
the user, no IP/GPS collection).

Certifications (check all three — all true):
[x] I do not sell or transfer user data to third parties, outside of the
    approved use cases
[x] I do not use or transfer user data for purposes that are unrelated to my
    item's single purpose
[x] I do not use or transfer user data to determine creditworthiness or for
    lending purposes

Remote code: "No, I am not using remote code" (MV3; every script and wasm
runtime is bundled; the classifier fetches model data files only, from
https://github.com/Nyadzayo/ApplyOnce/releases).

Privacy policy URL (required because data types are declared):
https://nyadzayo.github.io/ApplyOnce/privacy.html
The policy enumerates exactly the four declared categories (including the
anonymous usage statistics with their allowlist and opt-out) and carries the
Limited Use compliance statement — keep it in lockstep with these checkboxes
on every future change.

## Don'ts (from the research)
- No Workday in keywords until the adapter is genuinely good (reviews enforce).
- No "auto apply"/"job bot" keywords — the 2.9-star trust graveyard.
- No keyword lists/stuffing — CWS spam policy.

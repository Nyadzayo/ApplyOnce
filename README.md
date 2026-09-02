# ApplyOnce: Job Application Autofill

> Formerly codename FastApply; renamed after ASO research (fastapply.co is an
> existing competitor — see docs/ASO-REPORT.md). Internal storage keys and the
> IndexedDB name keep the old identifier for data compatibility.

One-click job application autofill, deterministic-first, local-only. No LLM,
no network calls, no telemetry in v1. See `PLAN.md` for the full design and
`CLAUDE.md` for agent/contributor rules.

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # unit tests (vitest + jsdom)
npm run eval        # fixture eval: detection recall + mapping precision gates
npm run build       # production build (Chrome) → dist/
npm run build:firefox   # Firefox build → dist-firefox/
npm run e2e:firefox     # live Firefox e2e (Playwright Firefox + RDP sideload)
npm run release:firefox # dist-firefox + AMO upload zip + source zip → release/
```

## Load in Chrome

1. `npm run build`
2. `chrome://extensions` → enable Developer mode → **Load unpacked** → select `dist/`
3. Open the side panel (click the ApplyOnce toolbar icon), complete onboarding
   (drop your resume, review the extracted profile, set explicit answers).
4. Open a job posting (Greenhouse / Lever / Ashby / generic form) →
   **Scan this page** → review → **Fill**.

The extension never submits an application — you always click submit yourself.

## Load in Firefox

1. `npm run build:firefox`
2. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** →
   select `dist-firefox/manifest.json`.
3. Firefox treats MV3 site access as optional: open the ApplyOnce sidebar →
   **Settings** → **Allow ApplyOnce on all sites** (or grant it under
   `about:addons` → ApplyOnce → Permissions). Auto-detection is silent until
   then.
4. Toolbar icon opens the sidebar; the in-page widget's panel button opens
   the panel in a tab (Firefox only allows opening the sidebar from a direct
   user gesture).

Differences from Chrome are all runtime feature-detected in
`src/shared/platform.ts`: no offscreen document (resume parsing runs in the
background event page), `sidebar_action` instead of `side_panel`, and
Firefox's install-time data-collection consent gates telemetry. See
`docs/FIREFOX.md` for the AMO submission steps.

## Architecture (short version)

- `src/content/` — scanner (shadow-DOM aware, radio grouping, widget hints) +
  filler (native setters, DataTransfer file attach, widget playbook). Only
  code with page-DOM access; injected on demand via `activeTab`.
- `src/shared/` — pure logic: zod schemas, canonical field ontology, matching
  cascade (ATS adapter rules → autocomplete tokens → label lexicon → saved
  answers exact/fuzzy → abstain), confidence + hard risk gates, CV text parser.
- `src/storage/` — Dexie vault (profile, documents, saved answers, fill log),
  optional passphrase AES-GCM encryption, JSON export/import.
- `src/background/` — stateless MV3 service worker: routing, job ids in
  `chrome.storage.session`, offscreen lifecycle.
- `src/offscreen/` — PDF.js / Mammoth resume parsing.
- `src/sidepanel/` — React UI: onboarding, profile vault, review-and-fill
  loop, settings, diagnostics.
- `fixtures/` + `evals/` — the eval corpus is the product spec. Launch gates:
  detection recall > 0.95, mapping precision > 0.98, zero forbidden fills.

## Known v1 deviations

- OCR for scanned PDFs is stubbed (paste-text fallback instead) until
  Tesseract traineddata can be vendored into the package — no runtime
  downloads are permitted.
- Fixture corpus currently holds 4 synthetic pages modeled on real ATS DOM.
  Replace/extend with SingleFile captures of real postings (PLAN.md Phase 0
  target: 40 pages) before trusting the accuracy numbers.
- Live-browser e2e scripts live in `e2e/` (`verify-extension.mjs` for
  Chromium, `verify-firefox.mjs` for Firefox); they run against the
  synthetic fixtures. Filler behavior on real ATS widgets still needs the
  10-application live gate (PLAN.md Phase 4) before launch.

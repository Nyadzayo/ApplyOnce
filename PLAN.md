# One-Click Job Application Autofill — End-to-End Implementation Plan

**Product name:** ApplyOnce (was codename FastApply; renamed 2026-07-10 — fastapply.co is an active competitor, see docs/ASO-REPORT.md)
**Target:** Shippable v1 on Chrome Web Store in ~10 weeks (solo developer)
**Thesis:** Deterministic-first autofill with retrieval memory. No LLM in v1. The model is a v2 upgrade, not a launch dependency.

---

## Part 0 — What v1 is and is not

### v1 promise (the only promise)

> "Click once. Your job application form fills itself — name, contact, links, work history, education, EEO answers you've pre-set, your saved answers to repeated questions, **and your resume file attached**. You review, you submit."

### Locked v1 scope

| In | Out (v2+) |
|---|---|
| One-click fill of visible fields | Auto-submit |
| Greenhouse, Lever, Ashby, generic HTML forms | Workday, Taleo, SuccessFactors (login-gated, custom-widget heavy — separate project) |
| **Resume/cover-letter file attachment via DataTransfer** | Cover letter generation |
| Text, email, tel, url, date, select, radio, checkbox, textarea, ARIA combobox | Multi-page autonomous navigation |
| Custom widget filling (react-select, ARIA listbox) for the 3 target ATSes | Arbitrary custom widgets on unknown sites |
| Local profile vault (IndexedDB, optional passphrase encryption) | Cloud sync |
| CV import (PDF text-layer + DOCX; OCR fallback) | Multi-resume variants |
| Saved answers with exact + fuzzy retrieval | Embedding retrieval (v1.5), local LLM mapping (v2) |
| Review panel + fill highlighting | BYOK / gateway providers |
| Local diagnostics export | Telemetry backend |

### Why no LLM in v1

- Job forms are the *most* structured forms on the web. `autocomplete` tokens, label text, ATS-specific DOM patterns, and saved answers resolve ~90%+ of fields deterministically.
- WebLLM = 500MB–2GB download, WebGPU gating, multi-second warm loads. It kills your <2s latency target and doubles support burden.
- Every week spent on model plumbing is a week not spent on the four things that actually decide success: **file upload, shadow DOM, iframes, custom widgets.**

---

## Part 1 — Final architecture

```
┌─────────────────────────────────────────────────────────┐
│ MV3 Service Worker (stateless orchestrator)             │
│  - message router - job ids - permission requests       │
└───────┬───────────────┬────────────────┬────────────────┘
        │               │                │
┌───────▼─────┐  ┌──────▼──────┐  ┌──────▼───────────────┐
│ Content     │  │ Side Panel  │  │ Offscreen Document   │
│ Scripts     │  │ (React UI)  │  │  - PDF.js parsing    │
│ all_frames  │  │  - vault    │  │  - Mammoth DOCX      │
│  - scan     │  │  - review   │  │  - Tesseract worker  │
│  - fill     │  │  - settings │  │  - (v1.5: embeddings)│
│  - widgets  │  │  - onboard  │  └──────┬───────────────┘
│  - fileDrop │  └──────┬──────┘         │
└───────┬─────┘         │         ┌──────▼──────┐
        │               └────────►│ IndexedDB   │
        └────────────────────────►│ vault + log │
                                  └─────────────┘
```

**Component ownership rules (never violate):**

1. Service worker owns **zero** long-lived state. Every job has an id persisted to `chrome.storage.session`; any component can resume it.
2. Content script is the **only** thing that touches page DOM. It runs in **all frames** (`all_frames: true, match_about_blank: true`) on granted hosts.
3. Offscreen document is the **only** heavy-compute host. One per extension (Chrome limit) — declare `reasons: ["DOM_PARSER", "BLOBS", "WORKERS"]` and use them or CWS review will flag you.
4. Side panel owns all UI. It reads/writes IndexedDB directly (same origin as extension) — don't proxy vault reads through the worker.
5. Embedding vectors (v1.5) never cross a `chrome.runtime` message boundary. Rank inside offscreen, pass results only.

### Permission model (CWS-survivable)

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab", "scripting", "storage", "sidePanel", "offscreen"],
  "optional_host_permissions": [
    "https://boards.greenhouse.io/*",
    "https://job-boards.greenhouse.io/*",
    "https://jobs.lever.co/*",
    "https://jobs.ashbyhq.com/*",
    "https://*/*"
  ],
  "content_scripts": []
}
```

- **No default host permissions.** On first fill of a page, `activeTab` covers the top frame. If the scanner detects a cross-origin ATS iframe (`src` matches known ATS domains), prompt: *"This form is embedded from Greenhouse. Allow ApplyOnce on greenhouse.io to fill it?"* → `chrome.permissions.request` → programmatically inject with `chrome.scripting.executeScript({ target: { tabId, allFrames: true } })`.
- **Deviation (2026-07-10, product decision):** content scripts now run on ALL
  http(s) sites at install (the Simplify model). Live testing showed the
  grant-then-register flow was too fragile (activeTab grants die on
  navigation; dynamic registrations are wiped on extension reload; users get
  silent no-injection), and per-site allow prompts defeat the auto-detect
  promise. Mitigations for the broad grant: a scored form classifier gates
  any UI/scan-report (page must look like a job application), a cheap
  field-count pre-gate avoids full DOM scans on ordinary pages, all
  processing stays on-device, and there is still zero telemetry. The CWS
  listing must explain the "read data on all websites" warning accordingly.
- The broad `https://*/*` optional grant exists only for a user-toggled "work everywhere" setting. Never request it silently.
- **Deviation (2026-08-25, Firefox support):** the same code base ships to
  Firefox (AMO) from `manifest.firefox.json` via `npm run build:firefox`.
  Differences are runtime feature-detected in `src/shared/platform.ts`, never
  compile-time forks:
  - Firefox has no `offscreen` API. Its background is an event page with DOM
    and workers, so `PARSE_CV_REQUEST` runs `src/offscreen/parse.ts` inline
    in the background there. The Part 1 rule "only the offscreen document does
    heavy compute" therefore reads "…on Chrome; on Firefox the background
    event page hosts the parser". The Chrome path is unchanged.
  - `sidebar_action` replaces `side_panel`. Toolbar click → `action.onClicked`
    → `sidebarAction.open()`. Message handlers are not user gestures in
    Firefox, so the widget's OPEN_PANEL falls back to opening
    `sidepanel.html` in a tab.
  - Firefox MV3 treats `host_permissions` as optional and does not inject
    manifest content scripts until granted: Settings shows an "Allow ApplyOnce
    on all sites" button (hidden on Chrome where the grant is at install).
  - AMO's mandatory `data_collection_permissions` declares
    `required: ["none"], optional: ["technicalAndInteraction"]`; the GA4
    telemetry (rule 9) additionally requires that install-time consent on
    Firefox (`hasTelemetryConsent`), on top of the Settings opt-out.
  - Firefox background is built as a classic IIFE
    (`vite.background.firefox.config.ts`); dist is `dist-firefox/`.
  - E2E: `e2e/verify-firefox.mjs` sideloads the build over the Remote
    Debugging Protocol (`e2e/firefox-rdp.mjs`, no `web-ext` dependency) and
    checks widget → fill → undo → inline PDF parse.
- Single-purpose statement for CWS: *"Fills job application forms with the user's locally stored profile."* Everything you ship must serve that sentence.

---

## Part 2 — Phase-by-phase build plan

### Phase 0 (Week 1): Eval corpus before code

**You cannot claim accuracy numbers without fixtures. Build the exam before the student.**

1. Collect **40 real application pages**: 12 Greenhouse (mix of hosted boards + embedded iframes), 10 Lever, 8 Ashby, 10 generic/company-custom. Save each with a single-file capture (SingleFile extension or `wget --page-requisites`) so JS-rendered DOM is frozen.
2. For each fixture, hand-write a **golden labels file**:

```json
// fixtures/greenhouse-stripe-swe/golden.json
{
  "url": "https://boards.greenhouse.io/...",
  "fields": [
    { "selector": "#first_name", "canonical": "basics.firstName", "kind": "text", "required": true },
    { "selector": "#job_application_answers_attributes_0_boolean_value", "canonical": "preferences.requiresSponsorship", "kind": "radio_group" },
    { "selector": "input[type=file]#resume", "canonical": "attachments.resume", "kind": "file" }
  ]
}
```

3. Build the **eval runner** (Playwright, bundled Chromium — Chrome/Edge no longer support extension side-loading flags):

```
pnpm eval → loads each fixture → runs scanner → runs mapper →
  reports: detection recall, mapping precision, per-ATS breakdown
```

4. This runner is your regression suite forever. Every bug found in the wild becomes a fixture.

**Exit criteria:** eval harness runs end-to-end with a stub scanner, produces a scored report.

---

### Phase 1 (Week 2): Extension shell + messaging

Repo setup: TypeScript, Vite + CRXJS (or WXT — WXT is the better DX in 2026), pnpm, Zod for every message and record schema, Vitest for unit, Playwright for integration.

```
src/
  manifest.ts
  background/       service-worker.ts, jobs.ts, permissions.ts
  content/          index.ts, scan/, fill/, widgets/, frames.ts
  offscreen/        offscreen.html, main.ts, parsers/{pdf,docx,ocr}.ts
  sidepanel/        App.tsx, routes/{onboard,vault,review,settings,diagnostics}.tsx
  shared/           types.ts, messages.ts (Zod-validated), canonical-fields.ts, scoring.ts, normalize.ts
  storage/          db.ts (Dexie), vault.ts, crypto.ts, answers.ts, filllog.ts
  fixtures/  tests/  e2e/
```

**Messaging contract:** one discriminated union, Zod-parsed on receipt at every boundary. Reject-by-default. Job pattern:

```ts
type Job = { id: string; kind: "SCAN" | "FILL" | "PARSE_CV"; state: "pending" | "running" | "done" | "failed"; createdAt: number };
// persisted in chrome.storage.session; SW can die and any component resumes by id
```

**Exit criteria:** click action → SW → content script echoes field count → side panel displays it. Survives SW suspension (test by killing the worker mid-job).

---

### Phase 2 (Weeks 3–4): The scanner — where recall is won

This is the highest-skill module. It must handle **shadow DOM, iframes, custom widgets, and dynamic mutation.**

#### 2.1 Deep DOM traversal (shadow-root aware)

```ts
function* deepQueryFields(root: Document | ShadowRoot | Element): Generator<Element> {
  const walker = document.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as Element | null;
  while (node) {
    if (isFieldCandidate(node)) yield node;          // input/textarea/select/[role=combobox|listbox|radio|checkbox|textbox]/[contenteditable]
    if ((node as Element).shadowRoot) yield* deepQueryFields((node as Element).shadowRoot!);
    node = walker.nextNode() as Element | null;
  }
}
```

- Closed shadow roots: unreachable via script. For target ATSes this is rare; log occurrence, surface "1 field couldn't be read" in UI. (The MAIN-world `attachShadow` patch trick exists but is fragile and a CWS review risk — skip in v1.)

#### 2.2 Frame strategy

- Content script declared/injected with `all_frames: true`. Each frame instance scans its own document and reports `FieldSignal[]` tagged with `framePath` to the SW, which merges.
- Top-frame script additionally detects cross-origin ATS iframes it *can't* enter yet (by `src` pattern) → triggers the optional-permission prompt from Part 1.
- Never attempt cross-origin DOM reach-through; merge at the SW.

#### 2.3 Accessible-name extraction (label resolution priority)

1. `autocomplete` token (highest-precision signal on the web — `given-name`, `email`, `tel`, `address-level2`, `organization-title` map directly to canonical fields)
2. `el.labels` / `<label for>`
3. `aria-labelledby` (resolve text) → `aria-label`
4. `placeholder`
5. Geometric fallback: nearest preceding text node within the same form-row container (cap 120 chars, strip `*` and "(required)")
6. `sectionHeading`: nearest previous `h1–h4` or `[role=heading]` — disambiguates "Start date" under *Work Experience* vs *Availability*

#### 2.4 Visibility without layout thrash

One `IntersectionObserver` pass + batched `getComputedStyle` reads (all reads, then all writes). Never interleave per-field rect reads with DOM writes. Fields that are `display:none` inside collapsed sections: record with `visible:false`; do not fill in v1.

#### 2.5 Dynamic forms

- One `MutationObserver` **scoped to the detected form container**, not `document.body`.
- Debounce 300ms, coalesce, rescan only added subtrees.
- Disconnect during our own fill writes (flag), reconnect after — otherwise your filler triggers your own rescans in a loop.

#### 2.6 FieldSignal (final schema — additions over your draft in bold)

Keep your draft schema, plus:

| Field | Why |
|---|---|
| **`kind`** enum incl. `file`, `contenteditable`, `aria_combobox`, `aria_listbox`, `radio_group` | radio groups are one logical field, not N inputs |
| **`groupId`** | joins radios/checkbox clusters sharing `name`/fieldset |
| **`widgetHint`** enum `native / react_select / greenhouse_select / lever_native / ashby_combobox / unknown` | routes to the right fill strategy |
| **`inShadow`**, **`accept`** (for file inputs), **`maxLength`** | fill-time constraints |

**Exit criteria:** detection recall > 0.95 on the fixture corpus, measured by the Phase 0 runner. Radio groups collapse correctly. Shadow-DOM fixture passes.

---

### Phase 3 (Weeks 4–5): Deterministic mapper + confidence

#### 3.1 Canonical field ontology (~60 keys)

`basics.firstName/lastName/fullName/email/phone`, `location.*`, `links.linkedin/github/portfolio/other`, `work[i].company/title/start/end/current/description`, `education[i].school/degree/field/start/end/gpa`, `preferences.workAuth/sponsorship/salary/startDate/relocation/remote`, `eeo.gender/race/veteran/disability` (fill **only** from explicit user settings, never inferred), `attachments.resume/coverLetter`, `custom.*` (routed to saved answers).

#### 3.2 Matching cascade (per field, first hit wins)

1. **ATS adapter rule** — per-platform selector/name maps. Greenhouse: `#first_name`, `#job_application_answers_attributes_N_*`; Lever: `name="name"`, `name="urls[LinkedIn]"`, `name="cards[...]"`; Ashby: `_systemfield_name`-style ids + ARIA combobox patterns. ~50 rules per ATS covers most of their surface. **This is your precision moat — invest here.**
2. **`autocomplete` token map** — direct, near-zero false positives.
3. **Normalized label lexicon** — curated synonym table (`"mobile" → phone`, `"where are you based" → location.city`, `"are you legally authorized..." → preferences.workAuth`). Normalize: lowercase, strip punctuation/required-markers, collapse whitespace.
4. **Saved-answer exact match** — normalized question key equality.
5. **Saved-answer fuzzy match** — token-set Jaccard + trigram similarity ≥ 0.85 (v1); embeddings replace this in v1.5.
6. **Abstain** → review panel with best guesses listed.

#### 3.3 Option resolution (selects/radios/comboboxes)

Normalize both sides (case, punctuation, "United States" ↔ "USA" ↔ "US" via a country/degree/boolean alias table). Exact normalized match → fill; unique substring match → fill at reduced confidence; else review. **Never pick an option that isn't verbatim in the option list.**

#### 3.4 Confidence + risk gates

Keep your scoring shape, adjusted for no-model v1:

```
base = 0.45*rule_tier + 0.30*option_match + 0.25*retrieval_score
gates (hard, not score-based):
  eeo/legal/consent  → fill only from explicit settings, else always review
  file fields        → always show what will be attached before/while filling
  salary             → explicit setting or saved answer only
≥0.90 fill silently · 0.70–0.89 fill + amber highlight · 0.5–0.69 review · <0.5 abstain
```

**Exit criteria:** mapping precision > 0.98 on high-confidence fields across fixtures; zero EEO/legal fields filled without explicit source.

---### Phase 4 (Weeks 5–6): The filler — where trust is won

#### 4.1 Native inputs under React/Vue/Angular (the non-negotiable pattern)

```ts
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);                                  // bypass React's value trap
  el.dispatchEvent(new Event("input",  { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
// focus → setNativeValue → blur; then read back after 2 frames (rAF x2) to verify frameworks didn't revert
```

Selects: set `.value`, dispatch `change`, verify `selectedIndex`. Checkbox/radio: use `.click()` (fires the full framework event chain), verify `.checked`.

#### 4.2 File upload (your #1 differentiator — most competitors skip it)

```ts
async function attachFile(input: HTMLInputElement, blob: Blob, filename: string, mime: string) {
  const file = new File([blob], filename, { type: mime });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("input",  { bubbles: true }));
}
```

- Resume blob travels from IndexedDB → SW → content script as a transferred `ArrayBuffer` (structured clone handles it).
- **Dropzone variants** (Lever/Ashby drag-targets wrapping a hidden input): find the hidden `input[type=file]` inside the dropzone first; if truly absent, dispatch a synthetic `drop` event carrying the `DataTransfer` at the dropzone.
- Respect the `accept` attr (send PDF if `.pdf` required). Verify by watching for the ATS's filename-confirmation node within 3s; else flag for manual attach with the file offered as a download.

#### 4.3 Custom widget playbook (per `widgetHint`)

| Widget | Sequence |
|---|---|
| react-select / Greenhouse select2-style | click control → `setNativeValue` on inner search input → await filtered menu (MutationObserver on menu node, 1.5s timeout) → click exact-text option → verify chip/value rendered |
| ARIA combobox (Ashby) | focus → type via native setter → await `[role=option]` matching normalized text → `ArrowDown`+`Enter` keyboard events **and** option click (belt + suspenders) → verify `aria-activedescendant`/rendered value |
| ARIA listbox | click trigger → click `[role=option]` by exact text |
| Date pickers | prefer typing into the text input in the site's detected placeholder format (`MM/DD/YYYY` etc.); never drive calendar popups in v1 |
| Contenteditable | focus → `document.execCommand("insertText")` fallback to `textContent` + `InputEvent` |
| Unknown custom widget | abstain → review panel with copy-to-clipboard value |

Every widget action is a **retry-once, verify, else downgrade to review** state machine. Never loop.

#### 4.4 Fill orchestration

Fill top-to-bottom in DOM order (some forms reveal fields conditionally — e.g., sponsorship follow-ups after work-auth answers). After each fill batch, allow one debounced rescan to catch newly revealed fields (max 2 rounds, hard stop). Green outline = filled+verified; amber = filled, review suggested; red badge = needs you. Summary toast: "18 filled · 2 need review · resume attached."

**Exit criteria (the launch gate):** on live (not fixture) Greenhouse/Lever/Ashby postings — 10 real applications end-to-end — ≥ 90% of fields filled correctly including file attach, zero wrong silent fills.

---

### Phase 5 (Week 6): Vault, storage, crypto

- **Dexie over IndexedDB.** Tables: `profile` (singleton, versioned), `documents` (resume blobs + metadata), `savedAnswers`, `fillLog`, `settings`. Every record Zod-validated on read *and* write; schema `version` int + migration functions; keep last-good snapshot for rollback; JSON export/import from day one.
- **Honest encryption, two modes:**
  - *Standard (default):* data stored plaintext in IndexedDB, protected by OS profile isolation. Privacy copy says exactly that: "Your data never leaves your device."
  - *Passphrase (optional):* PBKDF2/Argon2-derived key → AES-GCM encrypt `savedAnswers` + profile + blobs. Key held in memory + `chrome.storage.session` (survives SW restarts within a browser session, cleared on browser exit). Unlock prompt in side panel per session.
  - Do **not** ship fake "encryption" with an extension-embedded key. Users and reviewers see through it.
- `chrome.storage.session` → set access level so content scripts can't read it. `storage.local` → nothing sensitive, ever.

---

### Phase 6 (Week 7): CV import + onboarding

Pipeline: PDF.js (`getDocument` with `Uint8Array`, worker enabled) → text items with transforms → line reconstruction (cluster by y, sort by x) → section segmentation (heading lexicon + font-size/weight jumps from PDF.js font data) → per-section extractors (contact regex block; work items via date-range regex + title/company line pairing; education; skills lists) → `CandidateProfilePatch` with evidence spans (page, char offsets, chunk id). DOCX via Mammoth `ArrayBuffer` → raw text (never render its HTML unsanitized). Image-only pages → rasterize via PDF.js canvas → Tesseract.js worker (reuse one worker; cap 5 pages; page-by-page to bound memory).

**Onboarding flow (this is your first impression — over-invest):**

1. Drop resume → parse → **side-by-side review screen**: extracted profile left, source document right, every field click-to-edit, evidence highlighted in the source on hover.
2. Explicit-settings step: work authorization, sponsorship, salary expectations, EEO self-identification (each with a "skip / prefer not to answer" that maps to the corresponding form options).
3. "Try it" step: link to a demo Greenhouse posting, watch it fill.

Users forgive imperfect parsing they can fix in 60 seconds. They uninstall over silent garbage. Target: < 3 minutes from install to first successful fill.

---

### Phase 7 (Week 8): Saved answers + review loop

- Any user edit or manual entry in the review panel → "Save this answer for next time?" (default on, per-answer toggle).
- `SavedAnswer` per your schema; add `normalizedKey` (the lexicon-normalized question) and `aliasKeys[]` (grown when the user confirms a fuzzy match — this is how the system gets *smarter without a model*).
- Dedup on save: if trigram similarity ≥ 0.92 with an existing answer, offer merge.
- Review panel = single side-panel list: question, proposed value, source badge (Profile / Saved / Rule), confidence, inline edit, Apply / Apply-all-safe.

---

### Phase 8 (Weeks 9–10): Hardening + Chrome Web Store

**Diagnostics (privacy-first observability):** local `fillLog` ring buffer (last 50 fills): domain, ATS, field count, per-field outcome, confidence, duration, errors — **structure only, no values**. Settings → "Export diagnostic report" produces a JSON the user can attach to a bug report. Opt-in anonymous counters (fills, success rate) only if you stand up a backend later; ship without.

**Security hardening checklist:**
- All page-derived text is data, never instructions (matters from v2 when a model exists, but structure the pipeline that way now: field metadata capped at 500 chars, sanitized).
- Zod-validate every message at every boundary; content script accepts only known message kinds from the extension origin.
- CSP: no remote code, no `eval`, all libs bundled (MV3 requires it; Tesseract/PDF.js worker files must ship in the package).
- Blobs to content scripts only on explicit fill action for the active tab.

**CWS submission pack:**
- Single-purpose statement (one sentence, matches everything visible in the extension).
- Privacy policy page (static site): what's stored (locally), what's transmitted (nothing in v1), retention (user-controlled), no sale of data.
- Data-use disclosures in the dashboard: personal info **collected: yes, stored locally, not transmitted** — be precise, this is audited.
- Per-permission justification text drafted in advance (`offscreen`: "parses resume files"; optional hosts: "fills embedded application forms on ATS domains the user approves").
- Expect **human review** (forms + personal data). Budget 1–2 weeks and one rejection round; common flag is over-broad hosts — your optional-permission design is the defense.
- Demo video in the listing showing the exact flow.

**Launch gates (all must pass):**

| Gate | Bar |
|---|---|
| Fixture detection recall | > 0.95 |
| Fixture mapping precision (high-conf) | > 0.98 |
| Live end-to-end applications (10 real postings across 3 ATSes) | ≥ 90% fields correct, file attached, 0 wrong silent fills |
| p50 click→filled (no CV parse) | < 2.0s |
| Crash-free fill sessions | > 99.5% |
| Vault export/import round-trip | lossless |
| SW-suspension mid-fill | job resumes or fails cleanly, never half-corrupts |

---

## Part 3 — Post-launch roadmap (only after v1 metrics hold)

| Version | Feature | Trigger to build |
|---|---|---|
| v1.1 | Per-domain learned templates (cache field→canonical maps per hostname; skip mapping on revisit → sub-second fills) | ≥ 1 week of real usage data |
| v1.2 | More adapters: iCIMS, SmartRecruiters, Workable, BambooHR | user domain requests, ranked by fillLog abstain rates |
| v1.5 | Transformers.js + MiniLM-L6-v2 embeddings in offscreen worker replacing trigram fuzzy match (vectors cached in IndexedDB by content hash, ranked in-offscreen) | fuzzy-match miss rate > ~15% on long-tail questions |
| v2.0 | Local LLM mapper (WebLLM, Qwen-class 1.5–3B, strict JSON schema, abstain-allowed, temperature 0) **behind an experimental flag**, only for fields the cascade abstained on | review rate stuck > 20% after adapters + embeddings |
| v2.1 | BYOK fallback (OpenRouter `response_format`) + optional Ollama native-messaging bridge | users without WebGPU asking for the mapper |
| v2.5 | Workday adapter (its own milestone: auth-gated multi-page flows, full custom-widget playbook) | revenue justifies it |
| v3 | Multi-resume variants, team/enterprise policies, audit trail UI | product-market fit |

---

## Part 4 — Week-by-week summary

| Week | Deliverable |
|---|---|
| 1 | Fixture corpus (40 pages, golden labels) + Playwright eval runner |
| 2 | Extension shell, Zod messaging, job/resume-by-id pattern, side panel skeleton |
| 3 | Scanner: deep traversal (shadow DOM), accessible names, radio grouping, visibility |
| 4 | Scanner: iframes + optional-permission flow, MutationObserver, widget hints → recall gate |
| 4–5 | Mapper: ATS adapters (GH/Lever/Ashby), autocomplete map, label lexicon, option resolver, confidence + risk gates |
| 5–6 | Filler: native setters, verification readback, **file upload**, widget playbook, fill orchestration + highlights |
| 6 | Vault: Dexie, migrations, export/import, optional passphrase crypto |
| 7 | CV import (PDF.js/Mammoth/Tesseract) + onboarding review screen + explicit-settings step |
| 8 | Saved answers, fuzzy retrieval, alias learning, review panel polish |
| 9 | Hardening, diagnostics export, 10 live end-to-end applications, bug-fix loop |
| 10 | CWS pack, listing, video, submit; buffer for review round |

---

## Part 5 — The three rules that keep this shippable

1. **Every wrong silent fill costs 100× a review prompt.** When precision and recall fight, precision wins. Abstain is a feature.
2. **The eval corpus is the product spec.** No feature merges without a fixture proving it; no bug closes without a fixture reproducing it.
3. **The model earns its way in.** Ship deterministic. Measure the abstain rate. Add embeddings when fuzzy matching demonstrably misses. Add the LLM when embeddings demonstrably miss. Each layer must pay for its complexity with measured review-rate reduction.

---

## Part 9 — v0.2 upgrade (owner decision, 2026-09-01)

The v1 deterministic-only constraint was ship-first pragmatism; v0.2 relaxes
it for UX and accuracy, measured first (2,078-question corpus run through
`mapField`: 57.6% traffic mapped correct, 3.2% wrong, 16.8% abstained on
mappable keys, 22.4% abstained with no key).

Scope, in order:
1. **Lexicon expansion + seam fixes** (deterministic, this Part's first
   commit): close the measured abstain-on-mappable gap and the
   sponsorship→workAuth / preferred-name→firstName wrong-mappings.
   *Shipped 2026-09-01:* corpus re-measure 69.9% correct / 0.4% wrong /
   5.1% abstain-on-mappable / 24.5% no-key (from 57.1 / 3.7 / 16.2 / 23.0);
   `evals/lexicon-corpus-eval.test.ts` holds the floors (skips when the
   corpus is not on the machine). New matcher primitives: whole-word hits
   on question-length labels only, `all` (sponsor + require/need),
   `excludeContains`, camelCase label splitting.
2. **Parse P0 fixes** (education fallback, decoration-tolerant headings,
   capture work location) + a `fixtures/cv/` golden-profile eval corpus.
3. **Parse-quality telemetry**: field-coverage params on `resume_imported`;
   new `resume_reviewed` event counting edited field groups (structure
   only, rule 9 unchanged). *Shipped 2026-09-01* (counts only:
   work/education/skills/contact/link/flagged fields; edited-field counts
   per group and how many flagged fields the user changed).
4. **Classifier tier**: ettin-encoder-32m int8 ONNX (32 MB, trained
   2026-09-01; abstain@0.8 = 0.998 kept-accuracy) via onnxruntime-web in
   the offscreen document, cascade position after saved-answer fuzzy,
   threshold 0.8, proposes canonical key only — risk gates and option
   safety unchanged; model download cached, versioned, from a
   project-controlled host.
   *Shipped 2026-09-02:* `src/shared/bpe-tokenizer.ts` (byte-level BPE,
   ids verified identical to the training tokenizer), `intent-map.ts`
   (training-time serialization `label [TYPE=..] [OPTIONS=..]`, intent to
   key map, threshold 0.8), `src/offscreen/classifier.ts` (onnxruntime-web
   wasm, single thread, Cache-storage assets), mapper tier 5.5 with rule
   tier 0.75 so model fills are always amber, SW/panel wiring only for
   fields the cascade abstained on, Settings opt-in with download note.
   **Finding:** the Kaggle `quantize_dynamic` int8 export destroys
   calibration (coverage at 0.8 falls from 25% to 1%); the shipped bundle
   is weight-only int8 (per-channel `DequantizeLinear`, fp32 activations)
   from `finetune/06_export_web.py`, 32.8 MB, measured under
   onnxruntime-web on the held-out split: coverage 0.254 (traffic 0.687),
   kept accuracy 0.980 (traffic 0.999), 0 wrong keys.
   `evals/classifier-eval.test.ts` holds these floors (skips without the
   bundle). Asset host (decided 2026-09-02): a GitHub Release of this
   repository, tag `models-<version>` (currently
   `models-v8-ettin-encoder-32m`), so model and code live in one repo and
   each file's sha256 is in the release's manifest.json; verified live with
   `E2E_CLASSIFIER=1 npm run e2e:chrome` (download + load 4 s). Open:
   Firefox (no offscreen document; tier is Chrome-only for now).
5. **Parse redesign — staged and measurement-gated** (design review
   2026-09-01; revised the same day after the parse research pass, §5.0).
   Parsing is three layers; fix in order, each gated on the `fixtures/cv/`
   eval corpus.
   5.0 *Research findings that reshape the stages.* Running the shipped
       extractor over real PDFs (LaTeX resumes, a Harvard sample) showed the
       text-only eval (0.981) does not predict real accuracy:
       (a) items are joined with one space, so fake small-caps headings
       ("E"+"XPERIENCE" → "E XPERIENCE") defeat section detection and whole
       sections vanish (skills 0, projects parsed as jobs); (b) column gaps
       are discarded, so "Company<gap>City, CC" and "Title<gap>Dates"
       collapse into one string and the location leaks into every company
       and school name; (c) entries without a role word ("AI: Deep Learning
       Tutor", "Recruiter") get title/company swapped because TITLE_WORDS is
       the only tiebreak; (d) boldness IS recoverable: `page.getOperatorList()`
       (~50 ms/page) loads fonts into `page.commonObjs`, whose `.name` holds
       the real face ("Arial-BoldMT", LaTeX "CMBX10"); (e) Mammoth raw text
       flattens Word tables cell-per-line, but `convertToHtml` keeps h1-h6,
       <strong>, table rows and <a href>; parsed with DOMParser (never
       rendered) it yields the same line model as the PDF path; (f) Gemini
       Nano needs ≥22 GB free disk, a ≥4 GB-VRAM GPU, desktop Chrome only and
       a 4 GB download: too little reach to sit on the accuracy path.
       Consequences: the corpus must be binary (PDF/DOCX through the real
       extractors), scoring must be strict, and "100% accuracy" is defined
       as **precision 1.000 on every field the parser fills at review, recall
       ≥ 0.95, and every field below high confidence flagged for the user**.
       The review step, not a model, closes the last gap.
   Status (2026-09-01): Layer 0, 5a and 5b shipped. Corpus = 73 generated
   binaries (11 templates × 5 personas: 41 Chromium PDFs, 16 DOCX, 16
   LibreOffice PDFs) + 8 text fixtures; strict eval precision 1.000 / recall
   1.000 (1,241 fields), text corpus 1.000; verified on real LaTeX/Word
   resumes (all roles, degrees, links). Review form flags every field below
   high confidence ("check this"). Floors in evals/cvparse-eval.test.ts:
   binary P ≥ 0.99, R ≥ 0.95; text ≥ 0.98. 5c stays unbuilt: no measured
   error remains to justify a model.
   Layer 0, *Corpus* (ships before 5a): `scripts/gen-cv-fixtures.mjs`
       renders synthetic personas through layout templates (single column
       dates-right, dates on their own line, sidebar two-column, Word-table
       entries, LinkedIn export, Europass, ATS-plain, academic, DE/FR/ES) to
       PDF via Playwright Chromium and, where LibreOffice is installed, to
       DOCX and a second PDF producer; output `fixtures/cv/bin/*` plus golden
       labels the generator knows exactly. `evals/cvparse-eval.test.ts` runs
       the real extractors in Node and scores strictly (normalized exact
       match; precision and recall per field type). Gates: precision ≥ 0.99
       to merge 5a/5b, ratcheting to 1.000; recall ≥ 0.95; the text corpus
       keeps its floor. Real personal resumes are never committed.
   *OCR (shipped 2026-09-02):* a Kaggle scan corpus showed that many real
   resumes are image-only PDFs (0 text items, one image per page), which no
   parser fix can read. `src/offscreen/parsers/ocr.ts` renders such pages
   with PDF.js and runs tesseract.js from the package's own
   `public/tesseract/` (worker, SIMD core, eng traineddata; vendored by
   `scripts/fetch-ocr-assets.mjs`, no runtime download, no image leaves the
   device); image uploads (PNG/JPEG/WebP) go straight to OCR. Words become
   positioned items (`src/shared/ocr-items.ts`) and flow through the same
   line model; every OCR value is capped at medium confidence and the review
   form flags it. Reconstruction learned OCR's failure modes: line baselines
   per block, dashless date ranges, glyph bullets, rule lines, split rows,
   and column detection now needs an empty gutter, a wide gap on shared
   rows, line runs on the sparse side and a ragged left edge test against
   right-aligned cells. Scan corpus (`fixtures/cv/scan`, 8 page images at
   200 dpi): precision 0.986, recall 0.887; floors 0.95 / 0.80 in
   `evals/cvparse-ocr-eval.test.ts`. Real scans: 3 of 4 Kaggle samples
   recover every role with company, location and dates; low-resolution
   scans (~600 px wide) stay unreadable and get the low-quality warning.
   Two extension-only defects found by the new Chrome e2e
   (`npm run e2e:chrome`, loads dist/ in Playwright Chromium and imports
   files through the real side panel): PDF.js transfers the file buffer to
   its worker, so the OCR fallback must get a copy; and an offscreen
   document is never painted, so `requestAnimationFrame` never fires there
   and a display-intent `page.render` waits forever: OCR renders with
   `intent: "print"`. OCR failures now surface as a review warning instead
   of being swallowed, and the panel watchdog allows 120 s for scans.
   *Re-import (shipped 2026-09-02):* Profile tab → "Import a new resume"
   runs the onboarding drop/parse/review flow in re-import mode: the new
   parse replaces work, education and skills, keeps explicit answers and
   any contact/link field the parse left empty (`src/shared/profile-merge.ts`),
   and replaces the stored resume file (the filler attaches the first stored
   resume). Image uploads (PNG/JPEG/WebP) are accepted everywhere the
   resume is.
   5a. *Reconstruction* (deterministic): extractors emit a line model
       (`DocLine`: text, cells, size, bold, italic, caps, x0, page, gapAbove,
       urls), not a string. PDF: bold/italic from the resolved font name;
       line clustering tolerance relative to font size; item joining by
       x-gap (≈0 → no space, wide → cell separator); per-page sidebar
       detection; repeated header/footer removal; link annotations attached
       to the line they overlap. DOCX: `convertToHtml` → DOMParser → the same
       model (headings, strong, table rows → cells, list items, hrefs).
       Text/paste: cells split on tabs or 2+ spaces. `rawText` for the
       review pane is the joined line text.
   5b. *Structure* (deterministic): headings by lexicon OR typography
       (bold/larger/caps, ≤4 words, gap above); entries start at a date line
       or a bold line after a gap; an entry's header lines are role-assigned
       from cells: date cell, location cell (geo lexicon + Remote/Hybrid),
       then title vs company by role-noun gazetteer, company-suffix
       gazetteer (Inc/Ltd/GmbH/…) and a document-level consistency vote
       (templates are uniform: once one entry is decided, the bold-line role
       is fixed for all). Name = largest-font line near the top of page 1,
       2-4 tokens, no digits. Every field carries a confidence in the
       evidence map (high = structural or gazetteer-confirmed; medium =
       heuristic; low = fallback); the review form highlights anything below
       high.
   5c. *Interpretation* (models, only if 5b leaves measured error): a
       line-role classifier (ettin-17m/32m class, int8 ONNX, shared
       onnxruntime-web runtime) trained on the fixture generator's labeled
       lines, used as one more 5b signal, never overriding a structural
       decision. Gemini Nano stays an optional enhancer behind the span-copy
       guard, off the accuracy path (5.0f).

New approved dependency for 4: onnxruntime-web.

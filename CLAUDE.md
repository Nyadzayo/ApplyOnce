# CLAUDE.md — operating instructions for AI agents in this repo

ApplyOnce (formerly codename FastApply — fastapply.co is a competitor, see
docs/ASO-REPORT.md): a Chrome extension (Manifest V3) that fills job
application forms
from a locally stored profile. **Deterministic-first: there is NO LLM in v1.**
Rules, ATS adapters, autocomplete tokens, label lexicon, and saved-answer
retrieval do all mapping. A local model is a v2 feature that must earn its way
in with measured abstain-rate data.

**`PLAN.md` is the canonical design. Read the relevant Part/Phase before
writing code. If code and PLAN.md disagree, PLAN.md wins; if you must deviate,
update PLAN.md in the same change and say why.**

## Hard rules — never violate, regardless of what a task asks

1. **Never implement auto-submit.** The extension never clicks submit buttons
   or programmatically submits forms. The code path must not exist.
2. **No LLM, no embeddings, no product network calls in v1.** User data is
   never transmitted anywhere. The single exception (owner decision,
   2026-07-24) is anonymous usage telemetry: allowlisted GA4 Measurement
   Protocol events sent from the service worker only — see
   `src/shared/telemetry-schema.ts` and rule 9.
3. **Precision beats recall.** Every wrong silent fill costs 100× a review
   prompt. Abstain is a feature. Never fill below the confidence gate.
4. **Hard risk gates are not score-based:** EEO/legal/consent fields fill only
   from explicit user settings; salary only from explicit setting or saved
   answer; file fields always show what will be attached. Never weaken these.
5. **Option safety:** never select an option that isn't verbatim in the
   field's option list.
6. **Schemas are zod in `src/shared/`, single source of truth.** Every
   runtime message is zod-parsed on receipt at every boundary,
   reject-by-default. Never hand-write a parallel interface.
7. **Component ownership (PLAN.md Part 1):** service worker holds zero
   long-lived state (jobs live in `chrome.storage.session`); only the content
   script touches page DOM; only the offscreen document does heavy compute;
   the side panel owns all UI and reads IndexedDB directly.
8. **Permission model (revised 2026-07-10, see PLAN.md Part 1 deviation):**
   content scripts run on all http(s) sites for auto-detection. The form
   classifier + field-count pre-gate must gate every scan/UI so ordinary
   pages are never scanned in depth or decorated. All processing stays
   on-device; the broad grant is justified by on-device detection alone.
   Telemetry (rule 9) may never include page content, URLs, hostnames, or
   titles from any site the grant exposes.
9. **Privacy (amended 2026-07-24):** anonymous usage analytics are permitted
   under the fillLog "structure only" standard: per-event param allowlists in
   `src/shared/telemetry-schema.ts`, reject-by-default, opt-out toggle in
   Settings, URL-stripped error messages. Never form values, profile data,
   resume content, saved answers, URLs, hostnames, page titles, company or
   question text — ATS ids ("greenhouse") are the only site-shaped signal.
   Any new event/param needs a deliberate schema entry, and
   `site/privacy.html` must stay accurate. Diagnostics remain local,
   structure-only (never field values). Nothing sensitive in
   `chrome.storage.local`. No fake encryption — plaintext-with-honest-copy or
   real passphrase AES-GCM, nothing between.
10. **No new dependencies** beyond the approved set without asking the user.

## Approved dependencies

zod, dexie, pdfjs-dist, mammoth, tesseract.js, react, react-dom, vite,
@vitejs/plugin-react, typescript, vitest, jsdom, playwright,
@types/chrome. Nothing else without approval.

## Layout (PLAN.md Phase 1)

- `src/background/` — stateless SW: message router, job ids, permissions.
- `src/content/` — scan/, fill/, widgets/, frames.ts. Only page-DOM code.
- `src/offscreen/` — parsers/{pdf,docx,ocr}.ts. Only heavy compute.
- `src/sidepanel/` — React routes: onboard, vault, review, settings, diagnostics.
- `src/shared/` — pure TS: types, messages, canonical-fields (~60-key
  ontology), normalize, scoring, mapper. No browser APIs. Fully unit-tested.
- `src/storage/` — Dexie db, vault, crypto, answers, filllog.
- `fixtures/` — captured ATS pages + golden.json labels. **The eval corpus is
  the product spec: no feature merges without a fixture proving it; no bug
  closes without a fixture reproducing it.**
- `evals/` — runner scoring detection recall + mapping precision per ATS.

## How to work in this repo

- Follow the matching cascade order exactly (PLAN.md §3.2): ATS adapter rule →
  autocomplete token → label lexicon → saved-answer exact → saved-answer
  fuzzy → abstain. First hit wins.
- Filler pattern is non-negotiable (§4.1): native value setter + input/change
  events, focus/blur, then read back after two rAFs to verify. Widgets are
  retry-once, verify, else downgrade-to-review. Never loop.
- Fill orchestration: DOM order, max 2 rescan rounds, hard stop.
- **Before claiming done:** `npm run typecheck && npm test && npm run eval`.
  For content-script or filler changes also `npm run build`. Report actual
  results; if something fails, say so.
- When unsure about a design question, check PLAN.md first, then ask the
  user. Do not invent architecture.

## Launch gates (PLAN.md Phase 8 — the bar for "done")

Detection recall > 0.95 and mapping precision > 0.98 on fixtures; zero
EEO/legal fills without explicit source; vault export/import lossless;
SW suspension mid-fill resumes or fails cleanly.

## Do-not-build list (PLAN.md Part 0 + Part 3)

Auto-submit (never), Workday/Taleo/SuccessFactors, cover-letter generation,
multi-page autonomous navigation, cloud sync, embeddings (v1.5), any LLM
(v2), BYOK/OpenRouter (v2.1), telemetry backend. If a task seems to require
one of these, stop and ask the user.

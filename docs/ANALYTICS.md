# Feedback, bug reports & analytics — compliance-first plan

How FastApply can learn from failures without violating Chrome Web Store
policy or its own "your data never leaves your device" promise.

## The policy reality (as of the Aug 1, 2026 enforcement wave)

- **Limited Use got stricter:** any user data an extension collects must be
  *strictly necessary to the disclosed single purpose*. Collecting extra data
  "for analytics, advertising, or an unreleased future feature" is explicitly
  prohibited. (developer.chrome.com/docs/webstore/program-policies/limited-use,
  developer.chrome.com/blog/cws-policy-updates-2026)
- **Prominent disclosure + affirmative consent** must happen *inside the
  extension's own UI* — the store listing or install page does not count.
  Practice changes after install require proactive re-disclosure.
  (developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- A **privacy policy** URL is mandatory in the dashboard, and the data-use
  disclosures there are audited against actual behavior.
- Consequence for us: "quietly add Google Analytics" is not an option, and
  even opt-in telemetry must be defensibly tied to the single purpose
  ("fills job application forms") — e.g., fill-failure telemetry qualifies;
  engagement/retention tracking is on thin ice.

## What we do, in phases

### Phase 0 — ship now (implemented)

Everything local, nothing transmitted, zero policy exposure:

- **fillLog** (exists): last 50 fills, structure only — per-field canonical,
  source, confidence, outcome. Never values.
- **"Report a bug"** (Diagnostics tab): copies the structure-only diagnostics
  JSON to the clipboard and opens a prefilled GitHub issue. The user sees
  exactly what they're sharing and does the sharing themselves. No consent
  machinery needed because nothing is auto-transmitted.
- **User-driven exports** (CSV/JSON of applications, diagnostics JSON).

This already gives a real feedback loop: bug reports arrive with the exact
per-field outcome trail (which cascade tier fired, what confidence, what
failed), which is what's needed to turn a report into a fixture.

### Phase 1 — opt-in error reporting (build when there are real users)

- **What:** runtime exceptions + fill *failures* (outcome=failed with error
  string, ATS id, extension version). Still never form values, never profile
  data, never URLs beyond the registrable domain.
- **How:** self-hosted Sentry (or GlitchTip) — self-hosting keeps third
  parties out of the data path entirely (the Mozilla model:
  firefox-source-docs.mozilla.org crash-reporting docs). Scrub everything by
  default; use a random install id, never an account or fingerprint.
- **Consent:** OFF by default. A dedicated toggle in Settings with plain
  copy ("Send anonymous error reports: includes the error message, the job
  board name, and the extension version. Never your answers or profile."),
  plus the privacy policy updated to match. Opt-in (the Firefox Klar model),
  not opt-out.
- **Justification under Limited Use:** error reporting directly serves the
  single purpose (making form-filling work). Keep the payload provably
  minimal so the audit story is trivial.

### Phase 2 — opt-in aggregate quality metrics (only if error reports prove insufficient)

- **What:** the calibration numbers the plan already wants: abstain rate,
  review rate, fill success per ATS *domain* (not full URL), per source tier.
  Counts only — no timestamps finer than day, no session traces.
- **How:** self-hosted Plausible/Umami-style counter endpoint or the same
  Sentry instance's metrics. Batched daily, dropped if the user is offline.
- **Same consent bar as Phase 1** — a separate toggle; don't bundle the two.
- This is the one Google scrutinizes most. If review rate data can be gotten
  from voluntary bug reports + the user's own exported diagnostics, skip
  this phase entirely.

### Never

- Third-party ad/analytics SDKs (GA, Mixpanel, etc.) — instant Limited Use
  problem and destroys the privacy positioning.
- Auto-transmitting anything before an explicit in-UI opt-in.
- Collecting page content, profile fields, answers, or full URLs.
- Selling/sharing data (prohibited outright by CWS for user data).

## Pre-submission checklist (store listing)

- [ ] Privacy policy page (static site) stating: what is stored (locally),
      what is transmitted (nothing by default; error reports only with
      opt-in), retention (user-controlled), Limited Use compliance statement.
- [ ] Dashboard data-use disclosures matching the above exactly.
- [ ] In-UI disclosure screen for any toggle that transmits anything.
- [ ] Replace the ISSUES_URL constant in DiagnosticsView with the real
      public tracker.

## Effort directions (recommended order)

1. **Now:** rely on Phase 0 + the eval corpus. Every bug report → fixture →
   regression test. Cost: zero infra, zero policy risk.
2. **At ~100 users:** stand up self-hosted GlitchTip/Sentry (one small VPS),
   add the opt-in error toggle. ~1-2 days of work including consent UI and
   privacy policy update.
3. **Only if blind spots persist:** Phase 2 aggregate counters, separate
   toggle, same infrastructure. ~1 day.
4. **Continuously:** the fillLog schema is the analytics schema — anything
   worth measuring later should be recorded (locally) in fillLog now, so
   opt-in telemetry, if it ever ships, is just "send what we already show
   the user in Diagnostics."

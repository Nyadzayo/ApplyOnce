# AGENTS.md

**Read `CLAUDE.md` before doing anything — it applies verbatim to every AI
agent working in this repo, not just Claude.** The full design is in `PLAN.md`.

Non-negotiables (duplicated here in case you skip the above):

1. Never implement auto-submit — the extension never clicks submit buttons.
2. No LLM, no embeddings, no network calls in v1. Deterministic mapping only:
   ATS adapter rules → autocomplete tokens → label lexicon → saved answers
   (exact, then fuzzy) → abstain.
3. Precision beats recall. Abstain is a feature; never fill below the gate.
4. Hard gates: EEO/legal/consent and salary fields fill only from explicit
   user settings or saved answers. Never select an option not verbatim in the
   option list.
5. Schemas are zod in `src/shared/`; every runtime message is zod-parsed at
   every boundary, reject-by-default.
6. Ownership: SW is stateless; only content scripts touch page DOM; only the
   offscreen document does heavy compute; the side panel owns UI + IndexedDB.
7. No telemetry; diagnostics are local and structure-only (never values).
8. No dependencies beyond the approved list in `CLAUDE.md` without asking.

Verification before claiming done: `npm run typecheck && npm test && npm run
eval` (plus `npm run build` for content-script/filler changes). Report real
results.

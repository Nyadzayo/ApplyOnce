# Firefox (AMO) build and submission

ApplyOnce ships to Firefox from the same source as Chrome. There is no
compile-time fork: `src/shared/platform.ts` feature-detects the few MV3
surfaces that differ, and `manifest.firefox.json` replaces
`public/manifest.json` in the Firefox build.

## Build

```bash
npm run build:firefox      # → dist-firefox/
npm run e2e:firefox        # live Firefox: widget → fill → undo → PDF parse
npm run release:firefox    # → release/applyonce-firefox-v<version>.zip
                           #   + release/applyonce-firefox-v<version>-source.zip
```

`scripts/build-firefox.mjs` fails if the Chrome and Firefox manifest versions
differ — bump both together.

## What differs from Chrome

| Chrome | Firefox | Where |
|---|---|---|
| `side_panel` + `chrome.sidePanel` | `sidebar_action`; `action.onClicked` → `sidebarAction.open()`; widget's OPEN_PANEL opens a tab (no gesture in message handlers) | `platform.ts#openPanel`, `service-worker.ts` |
| `offscreen` document parses the resume | background event page runs `src/offscreen/parse.ts` inline | `service-worker.ts` `PARSE_CV_REQUEST` |
| `host_permissions` granted at install | optional until the user grants; content scripts silent until then | Settings → "Allow ApplyOnce on all sites" |
| no data-collection consent API | `data_collection_permissions` install checkbox gates telemetry | `platform.ts#hasTelemetryConsent`, both `telemetry.ts` |
| ESM service worker | classic IIFE event-page script | `vite.background.firefox.config.ts` |

## Submitting to addons.mozilla.org

1. `npm run release:firefox`.
2. https://addons.mozilla.org/developers/ → **Submit a New Add-on** → *On this
   site* → upload `release/applyonce-firefox-v<version>.zip`.
3. The validator will flag the bundled/minified code: upload
   `release/applyonce-firefox-v<version>-source.zip` on the **source code**
   step and paste these build instructions:

   ```
   Node 24 (any >= 20). npm ci && npm run build:firefox
   Output: dist-firefox/ (identical to the uploaded package).
   ```

4. Listing copy: reuse `docs/STORE-LISTING.md`; privacy policy URL is the
   same `site/privacy.html`. The `data_collection_permissions` declaration
   (`required: none`, `optional: technicalAndInteraction`) must match what
   the privacy policy says — anonymous, allowlisted usage analytics only.
5. The add-on id is fixed to `applyonce@kelvin.nyadzayo16.gmail.com` in
   `manifest.firefox.json`; AMO binds updates to it, so never change it.

## Expected validator warnings (not errors)

AMO's linter reports these on every build; none block submission and none
are runtime issues. Mention them in the reviewer notes:

| Warning | Source | Why it's fine |
|---|---|---|
| `The Function constructor is eval` ×8 in `background.js` | bluebird (mammoth's promise lib) + a `setImmediate` polyfill | bluebird's codegen only runs when `canEvaluate` is true, which is never in a browser; extension CSP forbids eval regardless |
| `Unsafe call to import` in `background.js` / `pdf.worker` | PDF.js internal dynamic imports | static module paths inside PDF.js; nothing user-controlled (PDF.js 5 has no eval path at all) |
| `Unsafe assignment to innerHTML` ×2 in `sidepanel.js` | React-DOM internals (`dangerouslySetInnerHTML` plumbing) | ApplyOnce never uses `dangerouslySetInnerHTML`; our own code has zero `innerHTML` |
| `sidePanel.* / offscreen.* is not supported` | guarded Chrome branches in `platform.ts` | every call sits behind `hasSidePanel()` / `hasOffscreen()` and is never reached on Firefox (verified by `e2e:firefox`) |

`strict_min_version` is 140 (desktop) / 142 (Android) because that is when
`data_collection_permissions` landed; older versions would ignore the key.

## Manual smoke test before upload

1. `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
   `dist-firefox/manifest.json`.
2. Sidebar opens (`open_at_install`). Complete onboarding with a PDF resume —
   parsing runs in the background page; check `about:debugging` → Inspect for
   errors.
3. Settings → **Allow ApplyOnce on all sites** → accept the prompt.
4. Open `fixtures/generic-basic/page.html` over http (any static server);
   widget appears; Fill; Undo.
5. Settings → toggle telemetry off/on: turning it on triggers Firefox's
   data-collection consent prompt.

## Automated e2e internals

Playwright's Firefox cannot load extensions or drive `moz-extension://`
pages. `e2e/verify-firefox.mjs` therefore starts Firefox with
`-start-debugger-server`, sideloads `dist-firefox/` over the Remote Debugging
Protocol (`e2e/firefox-rdp.mjs`, ~150 lines, the same call `web-ext run`
makes), seeds the vault by evaluating inside the add-on's background context,
and drives the fixture page with normal Playwright. The pref
`extensions.originControls.grantByDefault` grants host permissions in the
test the way a user would from Settings.

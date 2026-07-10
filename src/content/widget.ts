import type { AtsId, FieldDecision, FieldSignal } from "@shared/types";
import {
  AutoDecisionsResponse,
  FilePrepResponse,
  type Msg,
} from "@shared/messages";
import { detectApplicationForm } from "@shared/form-detect";
import { decisionToInstruction, type FilePayload } from "@shared/instructions";
import { scanDocument } from "./scan/scanner";
import { executeInstructions, undoLastFill, type FillerDeps } from "./fill/filler";

// The floating widget. Design follows the Grammarly/Honey playbook —
// progressive disclosure with three states so it never eats page space:
//
//   badge (44px dot + count)  ←→  pill (one row: counts · Fill · collapse)
//                                   ←→  list (details + rare actions)
//
// On first detection it "peeks" as a pill for a few seconds, then collapses
// to the badge (skipped entirely on later SPA navigations in the session).
// Draggable with edge snapping; position remembered per site. It never
// auto-fills and never submits — every state is an offer, not an action.

// "fa.hide." namespace: renamed from "fa.dismiss." so accidental dismissals
// stored by earlier builds are ignored (hide now lives in the side panel only)
const DISMISS_KEY = (host: string) => `fa.hide.${host}`;
const POS_KEY = (host: string) => `fa.pos.${host}`;
const DISMISS_MS = 7 * 24 * 3600 * 1000;
const MAX_REDETECTS = 5;
const PEEK_MS = 4500;
const PEEK_SESSION_FLAG = "fa.peeked";

type WidgetState = "badge" | "pill" | "list";

interface WidgetCtx {
  ats: AtsId;
  framePath: string;
  fillerDeps: FillerDeps;
  setRegistry: (r: Map<string, Element>) => void;
}

interface Position {
  side: "left" | "right";
  y: number; // px from top
}

let signalsByRef = new Map<string, FieldSignal>();
let decisionsByRef = new Map<string, FieldDecision>();
let host: HTMLDivElement | null = null;
let shadow: ShadowRoot | null = null;
let redetects = 0;
let detectedOnce = false;
let redetectTimer: ReturnType<typeof setTimeout> | null = null;
let shortcutFill: (() => void) | null = null;

/** Keyboard shortcut (Alt+Shift+F) → same as clicking Fill on the pill. */
export function triggerShortcutFill(): void {
  shortcutFill?.();
}

// structure-only debug trail (no values) — filter the page console by "ApplyOnce"
function dbg(...args: unknown[]): void {
  console.debug("[ApplyOnce]", ...args);
}

export async function initAutoDetect(ctx: WidgetCtx): Promise<void> {
  if (await isDismissed()) {
    dbg("widget hidden on this site (dismissed). Settings > Reset hidden sites to undo");
    return;
  }
  dbg("auto-detect armed", { frame: ctx.framePath, ats: ctx.ats });
  const run = () => void detectAndOffer(ctx);
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(run, 900); // let SPAs render their form
  } else {
    document.addEventListener("DOMContentLoaded", () => setTimeout(run, 900), { once: true });
  }

  const observer = new MutationObserver(() => {
    if (detectedOnce || redetects >= MAX_REDETECTS) {
      observer.disconnect();
      return;
    }
    if (redetectTimer) return;
    redetectTimer = setTimeout(() => {
      redetectTimer = null;
      redetects++;
      void detectAndOffer(ctx);
    }, 1500);
  });
  observer.observe(document.body ?? document.documentElement, {
    childList: true,
    subtree: true,
  });
}

async function detectAndOffer(ctx: WidgetCtx): Promise<void> {
  if (detectedOnce) return;
  // the script runs on every page now — bail before the full DOM scan unless
  // the page has at least a couple of form fields (ad iframes, articles, …)
  const quickCount = document.querySelectorAll(
    "input, select, textarea, [role=combobox]",
  ).length;
  if (quickCount < 2) return;
  const { signals, registry } = scanDocument(document, {
    ats: ctx.ats,
    framePath: ctx.framePath,
  });
  const detect = detectApplicationForm({
    url: location.href,
    title: document.title,
    signals,
  });
  dbg("detection", {
    fields: signals.length,
    score: detect.score,
    isApplication: detect.isApplication,
    reasons: detect.reasons,
  });
  if (!detect.isApplication) return;

  const msg: Msg = {
    kind: "AUTO_DETECTED",
    framePath: ctx.framePath,
    url: location.href,
    title: document.title,
    ats: ctx.ats,
    score: detect.score,
    isApplication: true,
    signals,
    jdText: extractJobDescription(),
  };
  let response: AutoDecisionsResponse;
  try {
    response = AutoDecisionsResponse.parse(await chrome.runtime.sendMessage(msg));
  } catch (e) {
    dbg("no usable reply from the service worker. Freshly reloaded extension but page not refreshed?", e);
    return;
  }
  dbg("decisions", {
    enabled: response.enabled,
    locked: response.locked,
    count: response.decisions.length,
  });
  if (!response.enabled) {
    dbg("widget disabled: auto-detect is off in Settings, or the profile is empty");
    return;
  }

  detectedOnce = true;
  ctx.setRegistry(registry);
  signalsByRef = new Map(signals.map((s) => [s.ref, s]));
  decisionsByRef = new Map(response.decisions.map((d) => [d.ref, d]));
  const peekedBefore = sessionStorage.getItem(PEEK_SESSION_FLAG) === "1";
  await renderWidget(ctx, response.locked);
  installSuggestions(ctx);
  dbg("widget rendered", {
    state: peekedBefore
      ? "small badge bottom-right (already peeked this session)"
      : "pill (peeks ~4s, then collapses to a small badge)",
  });
}

/** Snapshot the job description text — postings vanish once roles close. */
function extractJobDescription(): string | undefined {
  const candidates = document.querySelectorAll(
    "main, article, [class*='description' i], [id*='description' i], [class*='job-detail' i]",
  );
  let best = "";
  for (const el of Array.from(candidates)) {
    if (el.closest("[data-fastapply-ui]") || el.querySelector("input,select,textarea")) continue;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length > best.length) best = text;
  }
  if (best.length < 200) return undefined;
  return best.slice(0, 6000);
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

// ApplyOnce "ink & stamp" system, mirrored from the side panel. Colors come
// from the graded OKLCH ramp (hue 245° marine blue, accent-600 #0065AD) —
// see sidepanel.css header + e2e/resolve-colors.mjs. Semantic colors
// (verified/check/failed) stay a separate graded axis.
const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: "Avenir Next", "Seravek", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; }
  .fa {
    --paper: #ffffff; --ink: #1b252e; --muted: #59656f; --line: #dfe3e7;
    --stamp: #0065ad; --stamp-deep: #00508f;
    --good: #267b4c; --warn: #9a6418; --bad: #ab413a;
    position: fixed; z-index: 2147483646;
    background: var(--paper); color: var(--ink); border-radius: 22px;
    border: 1px solid var(--line);
    box-shadow: 0 6px 24px rgba(28,39,51,.14), 0 1px 2px rgba(28,39,51,.08);
    font-size: 13px; line-height: 1.4;
    user-select: none; touch-action: none;
    display: flex; flex-direction: column;
  }
  @media (prefers-color-scheme: dark) {
    .fa {
      --paper: #161d22; --ink: #e5e8ec; --muted: #88949e; --line: #272f35;
      --stamp: #4e9cda; --stamp-deep: #86beee;
      --good: #68b986; --warn: #d7a459; --bad: #e47c72;
      box-shadow: 0 6px 24px rgba(0,0,0,.45);
    }
  }
  /* anchored to the lower half of the viewport → open upward (drop-up).
     Reorder ONLY the panels (list above, foot just above the pill) instead of
     reversing the whole column — reversing put the footer at the very top. */
  .fa[data-anchor="bottom"] .list { order: -2; border-top: none; }
  .fa[data-anchor="bottom"] .foot { order: -1; }
  .fa[data-state="list"][data-anchor="bottom"] .pill { border-top: 1px solid var(--line); }
  @media (prefers-reduced-motion: no-preference) {
    .fa { transition: border-radius .16s ease; }
  }
  .fa:focus-visible { outline: 2px solid var(--stamp); outline-offset: 2px; }

  .mark { display: block; flex: none; }

  /* badge state: the stamp mark with a count bubble */
  .badge {
    width: 44px; height: 44px; border-radius: 50%;
    display: none; align-items: center; justify-content: center; cursor: pointer;
    position: relative;
  }
  .badge .bub {
    position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px;
    border-radius: 9px; background: var(--stamp); color: #fff; font-size: 11px;
    font-weight: 700; display: flex; align-items: center; justify-content: center;
    padding: 0 4px; border: 2px solid var(--paper);
    font-variant-numeric: tabular-nums;
  }
  .badge .bub.done { background: var(--good); }

  /* pill state: one row, nothing else */
  .pill { display: none; align-items: center; gap: 9px; padding: 8px 10px; max-width: 320px; }
  .pill .mark { cursor: grab; }
  .pill .mark:active { cursor: grabbing; }
  .counts { cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .counts b { font-weight: 650; font-variant-numeric: tabular-nums; }
  .muted { color: var(--muted); font-size: 12px; }
  button { font: inherit; border: 0; border-radius: 8px; padding: 6px 12px; cursor: pointer; min-height: 28px; }
  button:focus-visible { outline: 2px solid var(--stamp); outline-offset: 1px; }
  .fill { background: var(--stamp); color: #fff; font-weight: 600; }
  .fill:hover { background: var(--stamp-deep); }
  .fill:disabled { opacity: .45; cursor: default; }
  .icon { background: transparent; color: var(--muted); padding: 4px 8px; min-width: 28px; min-height: 28px; font-size: 12px; }
  .icon:hover { color: var(--ink); }

  /* list state: details + rare actions live here, not on the pill */
  .list { display: none; border-top: 1px solid var(--line); max-height: 250px; overflow: auto; padding: 4px 0; }
  .item { display: flex; gap: 8px; padding: 4px 12px; align-items: baseline; }
  .item .st { width: 7px; height: 7px; border-radius: 50%; flex: none; align-self: center; }
  .g { background: var(--good); } .a { background: var(--warn); } .n { background: var(--muted); }
  .item .lb { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .item .vl { max-width: 105px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .foot { display: none; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--line); }
  .lnk { background: none; color: var(--stamp); padding: 4px 0; min-height: 24px; font-size: 12px; font-weight: 500; }
  .lnk:hover { color: var(--stamp-deep); text-decoration: underline; }
  .lnk.quiet { color: var(--muted); }
  .lnk.quiet:hover { color: var(--ink); }

  .fa[data-state="badge"] { border-radius: 50%; }
  .fa[data-state="badge"] .badge { display: flex; }
  .fa[data-state="pill"] .pill { display: flex; }
  .fa[data-state="list"] { border-radius: 12px; }
  .fa[data-state="list"] .pill { display: flex; }
  .fa[data-state="list"] .list { display: block; }
  .fa[data-state="list"] .foot { display: flex; }

  .sug {
    position: fixed; z-index: 2147483647; background: var(--paper); color: var(--ink);
    border: 1px solid var(--line); border-radius: 9px;
    box-shadow: 0 4px 16px rgba(28,39,51,.16); padding: 6px 8px;
    display: flex; gap: 8px; align-items: center; font-size: 12.5px; max-width: 340px;
    --paper: #ffffff; --ink: #1b252e; --line: #dfe3e7; --stamp: #0065ad;
  }
  @media (prefers-color-scheme: dark) {
    .sug { --paper: #161d22; --ink: #e5e8ec; --line: #272f35; --stamp: #4e9cda; box-shadow: 0 4px 16px rgba(0,0,0,.45); }
  }
  .sug .v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
  .sug button { background: var(--stamp); color: #fff; padding: 4px 10px; border-radius: 6px; font-weight: 600; min-height: 24px; }
`;

/** The stamp mark, sized for the widget. */
function makeMark(size: number): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 128 128");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", "mark");
  svg.setAttribute("aria-hidden", "true");
  const rect = document.createElementNS(NS, "rect");
  for (const [k, v] of Object.entries({ x: "6", y: "6", width: "116", height: "116", rx: "30", fill: "#0065AD" })) {
    rect.setAttribute(k, v);
  }
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "M 38 66 L 57 86 L 92 42");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#FFFFFF");
  path.setAttribute("stroke-width", "14");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(rect, path);
  return svg;
}

function counts() {
  const ds = [...decisionsByRef.values()];
  return {
    ready: ds.filter((d) => d.action === "fill" || d.action === "fill-amber").length,
    review: ds.filter((d) => d.action === "review").length,
  };
}

async function renderWidget(ctx: WidgetCtx, locked: boolean): Promise<void> {
  if (host) host.remove();
  host = document.createElement("div");
  host.setAttribute("data-fastapply-ui", "");
  // open shadow: closed mode adds no real protection (the page can remove the
  // host regardless) and it blocks e2e automation from exercising the buttons
  shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.append(style);

  const root = document.createElement("div");
  root.className = "fa";
  root.setAttribute("role", "complementary");
  root.setAttribute("aria-label", "ApplyOnce autofill");
  root.tabIndex = 0;
  shadow.append(root);
  document.documentElement.append(host);

  const pos = await loadPosition();
  applyPosition(root, pos);

  const { ready, review } = counts();

  // --- badge -----------------------------------------------------------------
  const badge = document.createElement("div");
  badge.className = "badge";
  badge.title = `ApplyOnce: ${ready} fields ready`;
  const bub = document.createElement("div");
  bub.className = "bub";
  bub.textContent = String(ready);
  badge.append(makeMark(24), bub);

  // --- pill (single row, no footer) -------------------------------------------
  const pill = document.createElement("div");
  pill.className = "pill";
  const pillLogo = makeMark(16);
  pillLogo.setAttribute("title", "Drag to move");
  const label = document.createElement("div");
  label.className = "counts";
  label.setAttribute("role", "button");
  label.title = "Show details";
  const fillBtn = document.createElement("button");
  fillBtn.className = "fill";
  fillBtn.textContent = "Fill";
  fillBtn.disabled = locked || ready === 0;
  const collapseBtn = document.createElement("button");
  collapseBtn.className = "icon";
  collapseBtn.textContent = "⌄";
  collapseBtn.title = "Minimize";
  collapseBtn.setAttribute("aria-label", "Minimize");
  pill.append(pillLogo, label, fillBtn, collapseBtn);

  const setLabel = (html: string) => {
    label.innerHTML = html;
  };
  setLabel(
    locked
      ? `<b>ApplyOnce</b> <span class="muted">vault locked</span>`
      : `<b>${ready} ready</b>${review ? ` <span class="muted">· ${review} need you</span>` : ""}`,
  );

  // --- list + rare actions ------------------------------------------------------
  const list = document.createElement("div");
  list.className = "list";
  for (const d of [...decisionsByRef.values()].slice(0, 30)) {
    const sig = signalsByRef.get(d.ref);
    if (!sig || d.action === "abstain") continue;
    const item = document.createElement("div");
    item.className = "item";
    const st = document.createElement("span");
    st.className = `st ${d.action === "fill" ? "g" : d.action === "fill-amber" ? "a" : "n"}`;
    const lb = document.createElement("span");
    lb.className = "lb";
    lb.textContent = sig.label || sig.nameAttr || "";
    const vl = document.createElement("span");
    vl.className = "vl";
    vl.textContent = d.documentId
      ? `📎 ${d.value ?? ""}`
      : d.optionsMulti
        ? d.optionsMulti.map((o) => o.text).join(", ")
        : (d.option?.text ?? d.value ?? "");
    item.append(st, lb, vl);
    list.append(item);
  }
  const foot = document.createElement("div");
  foot.className = "foot";
  const panelBtn = document.createElement("button");
  panelBtn.className = "lnk";
  panelBtn.textContent = "Review in side panel";
  const undoBtn = document.createElement("button");
  undoBtn.className = "lnk";
  undoBtn.textContent = "Undo fill";
  undoBtn.style.display = "none";
  const appliedBtn = document.createElement("button");
  appliedBtn.className = "lnk";
  appliedBtn.textContent = "Mark applied";
  appliedBtn.style.display = "none";
  // deliberately NO hide/dismiss control here — it was too easy to hit by
  // mistake; hiding the widget per-site lives in the side panel Settings
  foot.append(panelBtn, undoBtn, appliedBtn);

  root.append(badge, pill, list, foot);

  // --- state machine -------------------------------------------------------------
  let state: WidgetState = "pill";
  const setState = (s: WidgetState) => {
    state = s;
    root.setAttribute("data-state", s);
  };

  // peek once per session, then rest as a badge
  let peekTimer: ReturnType<typeof setTimeout> | null = null;
  const peekedAlready = sessionStorage.getItem(PEEK_SESSION_FLAG) === "1";
  if (peekedAlready) {
    setState("badge");
  } else {
    setState("pill");
    sessionStorage.setItem(PEEK_SESSION_FLAG, "1");
    peekTimer = setTimeout(() => {
      if (state === "pill") setState("badge");
    }, PEEK_MS);
    root.addEventListener("pointerenter", () => {
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = null;
    });
  }

  badge.addEventListener("click", () => {
    if (dragMoved) return;
    setState("pill");
  });
  label.addEventListener("click", () => setState(state === "list" ? "pill" : "list"));
  collapseBtn.addEventListener("click", () => setState("badge"));
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setState(state === "list" ? "pill" : "badge");
  });

  panelBtn.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ kind: "OPEN_PANEL" } satisfies Msg);
  });
  undoBtn.addEventListener("click", () => {
    void undoLastFill(ctx.fillerDeps).then((n) => {
      setLabel(`<b>↩ ${n} restored</b>`);
      undoBtn.style.display = "none";
      appliedBtn.style.display = "none";
      bub.textContent = String(counts().ready);
      bub.classList.remove("done");
      fillBtn.textContent = "Fill";
    });
  });
  appliedBtn.addEventListener("click", () => {
    void chrome.runtime.sendMessage({
      kind: "MARK_APPLIED",
      url: location.href,
      title: document.title,
      ats: ctx.ats,
    } satisfies Msg);
    appliedBtn.textContent = "Applied ✓";
    appliedBtn.disabled = true;
  });

  const doFill = () => {
    fillBtn.disabled = true;
    fillBtn.textContent = "Filling…";
    void runFill(ctx).then((summary) => {
      setLabel(
        `<b>✓ ${summary.filled} filled</b>${
          summary.review ? ` <span class="muted">· ${summary.review} need you</span>` : ""
        }${summary.failed ? ` <span style="color:#dc2626">· ${summary.failed} failed</span>` : ""}`,
      );
      bub.textContent = "✓";
      bub.classList.add("done");
      badge.title = `ApplyOnce: ${summary.filled} filled`;
      fillBtn.textContent = "Fill again";
      fillBtn.disabled = false;
      undoBtn.style.display = "";
      appliedBtn.style.display = "";
      setState("list"); // reveal undo/mark-applied without hunting for them
    });
  };
  fillBtn.addEventListener("click", doFill);
  shortcutFill = () => {
    if (!fillBtn.disabled) {
      setState("pill");
      doFill();
    }
  };

  installDrag(root, badge, pillLogo, pos);
}

// --- drag with edge snapping (pointer events; position saved per host) --------

let dragMoved = false;

function installDrag(root: HTMLElement, ...handles: [Element, Element, Position]): void {
  const pos = handles.pop() as Position;
  let startX = 0;
  let startY = 0;
  let originY = 0;
  let dragging = false;

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragMoved = true;
    root.style.left = `${e.clientX - 22}px`;
    root.style.right = "auto";
    root.style.top = `${Math.max(8, Math.min(originY + dy, innerHeight - 60))}px`;
    root.style.bottom = "auto";
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    removeEventListener("pointermove", onMove, true);
    removeEventListener("pointerup", onUp, true);
    if (!dragMoved) return;
    // snap to the nearest edge, remember per site
    pos.side = e.clientX < innerWidth / 2 ? "left" : "right";
    pos.y = Math.max(8, Math.min(root.getBoundingClientRect().top, innerHeight - 60));
    applyPosition(root, pos);
    void savePosition(pos);
    setTimeout(() => {
      dragMoved = false;
    }, 0);
  };

  for (const h of handles as unknown as Element[]) {
    h.addEventListener("pointerdown", (e) => {
      const pe = e as PointerEvent;
      dragging = true;
      dragMoved = false;
      startX = pe.clientX;
      startY = pe.clientY;
      originY = root.getBoundingClientRect().top;
      addEventListener("pointermove", onMove, true);
      addEventListener("pointerup", onUp, true);
    });
  }
}

function applyPosition(root: HTMLElement, pos: Position): void {
  // pos.y is the top coordinate of the collapsed widget. In the lower half
  // of the viewport we anchor by the BOTTOM edge so expansion grows upward
  // instead of running off-screen.
  const anchorBottom = pos.y > innerHeight / 2;
  root.setAttribute("data-anchor", anchorBottom ? "bottom" : "top");
  if (anchorBottom) {
    root.style.bottom = `${Math.max(8, innerHeight - pos.y - 44)}px`;
    root.style.top = "auto";
  } else {
    root.style.top = `${pos.y}px`;
    root.style.bottom = "auto";
  }
  if (pos.side === "left") {
    root.style.left = "16px";
    root.style.right = "auto";
  } else {
    root.style.right = "16px";
    root.style.left = "auto";
  }
}

async function loadPosition(): Promise<Position> {
  const fallback: Position = {
    side: "right",
    y: Math.max(8, innerHeight - 60), // 16px off the bottom edge
  };
  try {
    const key = POS_KEY(location.hostname);
    const got = await chrome.storage.local.get(key);
    const p = got?.[key] as Position | undefined;
    if (p && (p.side === "left" || p.side === "right") && typeof p.y === "number") {
      return { side: p.side, y: Math.max(8, Math.min(p.y, innerHeight - 60)) };
    }
  } catch {
    // fall through
  }
  return fallback;
}

async function savePosition(pos: Position): Promise<void> {
  try {
    await chrome.storage.local.set({ [POS_KEY(location.hostname)]: pos });
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------------------
// fill + suggestions (unchanged behavior)
// ---------------------------------------------------------------------------

async function runFill(ctx: WidgetCtx): Promise<{ filled: number; review: number; failed: number }> {
  const started = Date.now();
  const fillable = [...decisionsByRef.values()].filter(
    (d) => d.action === "fill" || d.action === "fill-amber",
  );
  const fileReqs = fillable
    .filter((d) => d.documentId)
    .map((d) => ({ ref: d.ref, documentId: d.documentId! }));
  const fileByRef = new Map<string, FilePayload>();
  if (fileReqs.length > 0) {
    try {
      const resp = FilePrepResponse.parse(
        await chrome.runtime.sendMessage({
          kind: "WIDGET_FILL_PREP",
          requests: fileReqs,
        } satisfies Msg),
      );
      for (const f of resp.files) fileByRef.set(f.ref, f);
    } catch {
      // attachments will report as failed
    }
  }
  const instructions = fillable
    .map((d) => {
      const sig = signalsByRef.get(d.ref);
      if (!sig) return null;
      return decisionToInstruction(d, sig, fileByRef.get(d.ref));
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const outcomes = await executeInstructions(instructions, ctx.fillerDeps);
  const filled = outcomes.filter((o) => o.ok && o.verified).length;
  const failed = outcomes.filter((o) => !o.ok).length;
  const { review } = counts();

  void chrome.runtime.sendMessage({
    kind: "WIDGET_FILLED",
    url: location.href,
    title: document.title,
    ats: ctx.ats,
    fieldCount: decisionsByRef.size,
    filled,
    reviewed: review,
    abstained: [...decisionsByRef.values()].filter((d) => d.action === "abstain").length,
    failed,
    durationMs: Date.now() - started,
  } satisfies Msg);

  return { filled, review, failed };
}

let sugEl: HTMLDivElement | null = null;

function installSuggestions(ctx: WidgetCtx): void {
  document.addEventListener("focusin", (e) => {
    hideSuggestion();
    const target = e.target;
    if (!(target instanceof Element) || target.closest("[data-fastapply-ui]")) return;
    for (const [ref, d] of decisionsByRef) {
      if (d.action !== "review" || (!d.value && !d.option)) continue;
      const sig = signalsByRef.get(ref);
      if (!sig || sig.kind === "file") continue;
      const el = ctx.fillerDeps.registry.get(ref);
      if (el === target || (el?.contains(target) ?? false)) {
        showSuggestion(ctx, d, target);
        return;
      }
    }
  });
  document.addEventListener("scroll", hideSuggestion, { passive: true, capture: true });
}

function showSuggestion(ctx: WidgetCtx, d: FieldDecision, near: Element): void {
  if (!shadow) return;
  const rect = near.getBoundingClientRect();
  sugEl = document.createElement("div");
  sugEl.className = "sug";
  const v = document.createElement("span");
  v.className = "v";
  v.textContent = d.option?.text ?? d.value ?? "";
  const btn = document.createElement("button");
  btn.textContent = "Insert";
  btn.addEventListener("click", () => {
    const sig = signalsByRef.get(d.ref);
    if (sig) {
      const inst = decisionToInstruction(d, sig);
      if (inst) void executeInstructions([inst], ctx.fillerDeps);
    }
    hideSuggestion();
  });
  sugEl.append(v, btn);
  shadow.append(sugEl);
  const top = Math.max(8, rect.top - 40);
  sugEl.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 360))}px`;
  sugEl.style.top = `${top}px`;
}

function hideSuggestion(): void {
  sugEl?.remove();
  sugEl = null;
}

// ---------------------------------------------------------------------------

async function isDismissed(): Promise<boolean> {
  try {
    const key = DISMISS_KEY(location.hostname);
    const got = await chrome.storage.local.get(key);
    const ts = got?.[key];
    return typeof ts === "number" && Date.now() - ts < DISMISS_MS;
  } catch {
    return false;
  }
}


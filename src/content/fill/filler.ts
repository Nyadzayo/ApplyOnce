import type { FillInstruction, FillOutcome } from "@shared/types";
import { b64decode } from "@shared/messages";
import { normalizeLabel } from "@shared/normalize";
import { querySelectorDeep } from "../scan/traverse";
import {
  afterTwoFrames,
  attachFile,
  dropFileOn,
  fillContentEditable,
  fillSelect,
  fillTextLike,
  setChecked,
} from "./native";
import { fillAriaCombobox, fillAriaListbox, fillReactSelect } from "./widgets";
import { clearMarks, markField } from "../highlighter";

// Fill execution (PLAN.md §4.4): top-to-bottom DOM order, verify every write,
// green = filled+verified, amber = filled + review suggested, red = failed.

export interface FillerDeps {
  /** ref → element registry from the most recent scan in this frame */
  registry: Map<string, Element>;
  /** pause the rescan observer during our own writes */
  pauseObserver: () => void;
  resumeObserver: () => void;
}

// Prior state of every field we touched in the most recent fill — the
// "receipt" that makes one-click undo possible. Per frame, in memory.
interface PriorState {
  inst: FillInstruction;
  prior:
    | { type: "text"; value: string }
    | { type: "select"; value: string }
    | { type: "multiselect"; values: string[] }
    | { type: "checkgroup"; checkedSelectors: string[] }
    | { type: "check"; checked: boolean }
    | { type: "radio"; checkedSelector: string | null }
    | { type: "file" }
    | { type: "contenteditable"; text: string };
}

let lastFill: PriorState[] = [];

function capturePrior(inst: FillInstruction, el: Element): PriorState | null {
  if (el instanceof HTMLSelectElement) {
    if (el.multiple) {
      return {
        inst,
        prior: { type: "multiselect", values: [...el.selectedOptions].map((o) => o.value) },
      };
    }
    return { inst, prior: { type: "select", value: el.value } };
  }
  if (inst.kind === "multiselect" && inst.memberSelectors) {
    const members = inst.memberSelectors
      .map((s) => querySelectorDeep(document, s))
      .filter((x): x is HTMLInputElement => x instanceof HTMLInputElement);
    return {
      inst,
      prior: {
        type: "checkgroup",
        checkedSelectors: inst.memberSelectors.filter((_, i) => members[i]?.checked),
      },
    };
  }
  if (inst.kind === "radio_group") {
    const members = (inst.memberSelectors ?? [inst.selector])
      .map((s) => querySelectorDeep(document, s))
      .filter((x): x is HTMLInputElement => x instanceof HTMLInputElement);
    const checked = members.find((m) => m.checked);
    const idx = checked ? members.indexOf(checked) : -1;
    return {
      inst,
      prior: {
        type: "radio",
        checkedSelector: idx >= 0 ? (inst.memberSelectors?.[idx] ?? null) : null,
      },
    };
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") return { inst, prior: { type: "check", checked: el.checked } };
    if (el.type === "file") return { inst, prior: { type: "file" } };
    return { inst, prior: { type: "text", value: el.value } };
  }
  if (el instanceof HTMLTextAreaElement) {
    return { inst, prior: { type: "text", value: el.value } };
  }
  if (inst.kind === "contenteditable") {
    return { inst, prior: { type: "contenteditable", text: el.textContent ?? "" } };
  }
  return null;
}

export async function executeInstructions(
  instructions: FillInstruction[],
  deps: FillerDeps,
): Promise<FillOutcome[]> {
  const outcomes: FillOutcome[] = [];
  deps.pauseObserver();
  lastFill = [];
  try {
    for (const inst of instructions) {
      const target = locate(inst, deps);
      if (target) {
        const prior = capturePrior(inst, target);
        if (prior) lastFill.push(prior);
      }
      const outcome = await executeOne(inst, deps);
      outcomes.push(outcome);
      const el = locate(inst, deps);
      if (el) {
        markField(
          el,
          outcome.ok && outcome.verified ? (inst.amber ? "amber" : "green") : "red",
          outcome.error,
        );
      }
    }
  } finally {
    deps.resumeObserver();
  }
  return outcomes;
}

/** Restore every field touched by the most recent fill in this frame. */
export async function undoLastFill(deps: FillerDeps): Promise<number> {
  let restored = 0;
  deps.pauseObserver();
  try {
    for (const { inst, prior } of lastFill) {
      const el = locate(inst, deps);
      if (!el) continue;
      switch (prior.type) {
        case "text":
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            fillTextLike(el, prior.value);
            restored++;
          }
          break;
        case "select":
          if (el instanceof HTMLSelectElement) {
            el.value = prior.value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            restored++;
          }
          break;
        case "multiselect":
          if (el instanceof HTMLSelectElement) {
            for (const o of Array.from(el.options)) o.selected = prior.values.includes(o.value);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            restored++;
          }
          break;
        case "checkgroup": {
          for (const sel of inst.memberSelectors ?? []) {
            const m = querySelectorDeep(document, sel);
            if (m instanceof HTMLInputElement) {
              setChecked(m, prior.checkedSelectors.includes(sel));
            }
          }
          restored++;
          break;
        }
        case "check":
          if (el instanceof HTMLInputElement) {
            setChecked(el, prior.checked);
            restored++;
          }
          break;
        case "radio": {
          const members = (inst.memberSelectors ?? [])
            .map((s) => querySelectorDeep(document, s))
            .filter((x): x is HTMLInputElement => x instanceof HTMLInputElement);
          if (prior.checkedSelector) {
            const target = querySelectorDeep(document, prior.checkedSelector);
            if (target instanceof HTMLInputElement) {
              setChecked(target, true);
              restored++;
            }
          } else {
            // nothing was selected before — uncheck without click (a click
            // would re-select); frameworks get a change event
            for (const m of members) {
              if (m.checked) {
                m.checked = false;
                m.dispatchEvent(new Event("change", { bubbles: true }));
              }
            }
            restored++;
          }
          break;
        }
        case "file":
          if (el instanceof HTMLInputElement && el.type === "file") {
            try {
              el.files = new DataTransfer().files;
            } catch {
              Object.defineProperty(el, "files", {
                value: new DataTransfer().files,
                configurable: true,
              });
            }
            el.dispatchEvent(new Event("change", { bubbles: true }));
            restored++;
          }
          break;
        case "contenteditable":
          if (el instanceof HTMLElement) {
            el.textContent = prior.text;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            restored++;
          }
          break;
      }
    }
  } finally {
    deps.resumeObserver();
  }
  lastFill = [];
  clearMarks();
  return restored;
}

function locate(inst: FillInstruction, deps: FillerDeps): Element | null {
  const fromRegistry = deps.registry.get(inst.ref);
  if (fromRegistry && fromRegistry.isConnected) return fromRegistry;
  return querySelectorDeep(document, inst.selector);
}

async function executeOne(
  inst: FillInstruction,
  deps: FillerDeps,
): Promise<FillOutcome> {
  const el = locate(inst, deps);
  if (!el) {
    return { ref: inst.ref, ok: false, verified: false, error: "field not found" };
  }
  try {
    switch (inst.payload.type) {
      case "text":
        return await fillText(inst, el, inst.payload.value);
      case "option":
        return await fillOption(inst, el, inst.payload.optionText, inst.payload.optionValue, deps);
      case "multi":
        return await fillMulti(inst, el, inst.payload.options);
      case "check":
        return await fillCheck(inst, el, inst.payload.checked);
      case "file":
        return await fillFile(
          inst,
          el,
          b64decode(inst.payload.dataB64),
          inst.payload.fileName,
          inst.payload.mime,
        );
    }
  } catch (e) {
    return {
      ref: inst.ref,
      ok: false,
      verified: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function fillText(
  inst: FillInstruction,
  el: Element,
  value: string,
): Promise<FillOutcome> {
  if (inst.kind === "contenteditable") {
    fillContentEditable(el as HTMLElement, value);
    await afterTwoFrames();
    const got = (el.textContent ?? "").trim();
    return { ref: inst.ref, ok: true, verified: got === value.trim() };
  }
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    return { ref: inst.ref, ok: false, verified: false, error: "not a text input" };
  }
  fillTextLike(el, value);
  await afterTwoFrames();
  if (el.value !== value) {
    // one retry (framework may have reverted the first write)
    fillTextLike(el, value);
    await afterTwoFrames();
  }
  return { ref: inst.ref, ok: true, verified: el.value === value };
}

async function fillOption(
  inst: FillInstruction,
  el: Element,
  optionText: string,
  optionValue: string,
  deps: FillerDeps,
): Promise<FillOutcome> {
  if (el instanceof HTMLSelectElement) {
    const ok = fillSelect(el, optionValue, optionText);
    if (!ok) {
      return { ref: inst.ref, ok: false, verified: false, error: "option not in select" };
    }
    await afterTwoFrames();
    const sel = el.selectedOptions[0];
    return {
      ref: inst.ref,
      ok: true,
      verified: sel?.value === optionValue || sel?.text.trim() === optionText,
    };
  }

  if (inst.kind === "radio_group") {
    return fillRadioGroup(inst, deps, optionText, optionValue);
  }

  if (inst.kind === "aria_combobox") {
    const input = el instanceof HTMLInputElement
      ? el
      : (el.querySelector("input") as HTMLInputElement | null);
    if (!input) {
      return { ref: inst.ref, ok: false, verified: false, error: "combobox input not found" };
    }
    const r =
      inst.widgetHint === "react_select" || inst.widgetHint === "greenhouse_select"
        ? await fillReactSelect(input, optionText)
        : await fillAriaCombobox(input, optionText);
    return { ref: inst.ref, ok: r.ok, verified: r.verified, error: r.error };
  }

  if (inst.kind === "aria_listbox") {
    const r = await fillAriaListbox(el as HTMLElement, optionText);
    return { ref: inst.ref, ok: r.ok, verified: r.verified, error: r.error };
  }

  return { ref: inst.ref, ok: false, verified: false, error: `cannot pick option on ${inst.kind}` };
}

async function fillMulti(
  inst: FillInstruction,
  el: Element,
  targets: { value: string; text: string }[],
): Promise<FillOutcome> {
  const wantValues = new Set(targets.map((t) => t.value));
  const wantTexts = new Set(targets.map((t) => normalizeLabel(t.text)));

  if (el instanceof HTMLSelectElement && el.multiple) {
    for (const o of Array.from(el.options)) {
      // only ADD selections — never clear something the user picked
      if (wantValues.has(o.value) || wantTexts.has(normalizeLabel(o.text))) {
        o.selected = true;
      }
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await afterTwoFrames();
    const selected = new Set([...el.selectedOptions].map((o) => o.value));
    const verified = [...wantValues].every((v) => selected.has(v));
    return { ref: inst.ref, ok: true, verified };
  }

  // checkbox group
  const members = (inst.memberSelectors ?? [])
    .map((s) => querySelectorDeep(document, s))
    .filter((x): x is HTMLInputElement => x instanceof HTMLInputElement);
  if (members.length === 0) {
    return { ref: inst.ref, ok: false, verified: false, error: "group members not found" };
  }
  let touched = 0;
  for (const m of members) {
    const label = normalizeLabel(m.labels?.[0]?.textContent ?? "");
    if (wantValues.has(m.value) || wantTexts.has(label)) {
      setChecked(m, true); // add-only, same as above
      touched++;
    }
  }
  await afterTwoFrames();
  const verified =
    touched > 0 &&
    members.filter((m) => {
      const label = normalizeLabel(m.labels?.[0]?.textContent ?? "");
      return wantValues.has(m.value) || wantTexts.has(label);
    }).every((m) => m.checked);
  return { ref: inst.ref, ok: touched > 0, verified };
}

function fillRadioGroup(
  inst: FillInstruction,
  deps: FillerDeps,
  optionText: string,
  optionValue: string,
): FillOutcome {
  const members = (inst.memberSelectors ?? [inst.selector])
    .map((s) => querySelectorDeep(document, s))
    .filter((x): x is HTMLInputElement => x instanceof HTMLInputElement);
  let target = members.find((m) => m.value === optionValue);
  if (!target) {
    target = members.find((m) => {
      const lbl = m.labels?.[0]?.textContent ?? "";
      return normalizeLabel(lbl) === normalizeLabel(optionText);
    });
  }
  if (!target) {
    return { ref: inst.ref, ok: false, verified: false, error: "radio option not found" };
  }
  setChecked(target, true);
  return { ref: inst.ref, ok: true, verified: target.checked };
}

async function fillCheck(
  inst: FillInstruction,
  el: Element,
  desired: boolean,
): Promise<FillOutcome> {
  if (!(el instanceof HTMLInputElement) || el.type !== "checkbox") {
    return { ref: inst.ref, ok: false, verified: false, error: "not a checkbox" };
  }
  setChecked(el, desired);
  await afterTwoFrames();
  return { ref: inst.ref, ok: true, verified: el.checked === desired };
}

const FILE_CONFIRM_TIMEOUT_MS = 3000;

async function fillFile(
  inst: FillInstruction,
  el: Element,
  data: ArrayBuffer,
  fileName: string,
  mime: string,
): Promise<FillOutcome> {
  let input: HTMLInputElement | null =
    el instanceof HTMLInputElement && el.type === "file"
      ? el
      : (el.querySelector('input[type="file"]') as HTMLInputElement | null);

  if (input) {
    attachFile(input, data, fileName, mime);
  } else {
    // dropzone without a reachable input
    dropFileOn(el, data, fileName, mime);
  }

  // verify: input.files, else watch for a filename-confirmation node (§4.2)
  await afterTwoFrames();
  if (input && input.files && input.files.length > 0) {
    return { ref: inst.ref, ok: true, verified: true };
  }
  const confirmed = await waitForFilenameNode(fileName, FILE_CONFIRM_TIMEOUT_MS);
  return {
    ref: inst.ref,
    ok: confirmed,
    verified: confirmed,
    error: confirmed ? undefined : "attach not confirmed. Add the file manually",
  };
}

function waitForFilenameNode(fileName: string, timeoutMs: number): Promise<boolean> {
  const base = fileName.replace(/\.[^.]+$/, "");
  const probe = () => (document.body?.textContent ?? "").includes(base);
  if (probe()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        obs.disconnect();
        resolve(probe());
      }
    }, timeoutMs);
    const obs = new MutationObserver(() => {
      if (probe() && !done) {
        done = true;
        clearTimeout(timer);
        obs.disconnect();
        resolve(true);
      }
    });
    obs.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

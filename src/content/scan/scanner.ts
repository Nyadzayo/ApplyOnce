import type { AtsId, FieldKind, FieldOption, FieldSignal, WidgetHint } from "@shared/types";
import { collectFields, querySelectorDeep } from "./traverse";
import { collectHeadings, extractLabel, isRequired, sectionHeadingFor } from "./labels";
import { cssEscape } from "../dom-utils";

// The scanner (PLAN.md Phase 2): DOM in, FieldSignal[] out. Also maintains a
// ref → element registry so the filler doesn't depend on selector stability
// within the same page session.

export interface ScanOptions {
  ats: AtsId;
  framePath: string;
  /** eval runner (jsdom) has no layout — skip rect-based visibility checks */
  assumeLayout?: boolean;
}

export interface ScanOutput {
  signals: FieldSignal[];
  closedShadowRoots: number;
  registry: Map<string, Element>;
}

let scanCounter = 0;

export function scanDocument(doc: Document, opts: ScanOptions): ScanOutput {
  const { fields, closedShadowHosts } = collectFields(doc);
  const headings = collectHeadings(doc);
  const registry = new Map<string, Element>();
  const signals: FieldSignal[] = [];
  const scanId = ++scanCounter;

  // group radios by (form, name): one logical field per group (PLAN.md §2.6).
  // checkboxes sharing a name are a pick-many group (multiselect); a checkbox
  // with a unique name stays an individual field (consent boxes etc.)
  const radioGroups = new Map<string, HTMLInputElement[]>();
  const checkGroups = new Map<string, HTMLInputElement[]>();
  const singles: Element[] = [];
  for (const el of fields) {
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      const key = `${formKeyOf(el)}::${el.name}`;
      radioGroups.set(key, [...(radioGroups.get(key) ?? []), el]);
    } else if (el instanceof HTMLInputElement && el.type === "checkbox" && el.name) {
      const key = `${formKeyOf(el)}::cb::${el.name}`;
      checkGroups.set(key, [...(checkGroups.get(key) ?? []), el]);
    } else {
      singles.push(el);
    }
  }
  for (const [key, boxes] of [...checkGroups]) {
    if (boxes.length < 2) {
      singles.push(...boxes); // lone checkbox: not a group
      checkGroups.delete(key);
    }
  }

  let n = 0;
  const nextRef = () => `${opts.framePath}:s${scanId}f${n++}`;

  for (const el of singles) {
    const sig = signalForElement(el, opts, headings, nextRef());
    if (!sig) continue;
    registry.set(sig.ref, el);
    signals.push(sig);
  }

  for (const [key, radios] of radioGroups) {
    const first = radios[0];
    if (!first) continue;
    const ref = nextRef();
    const sig = signalForGroup(radios, key, "radio_group", opts, headings, ref);
    registry.set(ref, first);
    signals.push(sig);
  }

  for (const [key, boxes] of checkGroups) {
    const first = boxes[0];
    if (!first) continue;
    const ref = nextRef();
    const sig = signalForGroup(boxes, key, "multiselect", opts, headings, ref);
    registry.set(ref, first);
    signals.push(sig);
  }

  // stable order: by document position
  signals.sort((a, b) => {
    const ea = registry.get(a.ref);
    const eb = registry.get(b.ref);
    if (!ea || !eb) return 0;
    return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  return { signals, closedShadowRoots: closedShadowHosts, registry };
}

// ---------------------------------------------------------------------------

function signalForElement(
  el: Element,
  opts: ScanOptions,
  headings: { el: Element; text: string }[],
  ref: string,
): FieldSignal | null {
  const kind = kindOf(el);
  if (!kind) return null;
  const { label, source } = extractLabel(el);
  const input = el as HTMLInputElement;

  return {
    ref,
    framePath: opts.framePath,
    selector: buildSelector(el),
    kind,
    label,
    labelSource: source,
    placeholder: el.getAttribute("placeholder") ?? undefined,
    nameAttr: el.getAttribute("name") ?? undefined,
    idAttr: el.getAttribute("id") ?? undefined,
    autocomplete: el.getAttribute("autocomplete") ?? undefined,
    required: isRequired(el, label),
    options: optionsOf(el, kind),
    currentValue: currentValueOf(el, kind),
    sectionHeading: sectionHeadingFor(el, headings),
    visible: isVisible(el, opts.assumeLayout ?? false),
    inShadow: el.getRootNode() instanceof ShadowRoot,
    widgetHint: widgetHintOf(el, kind, opts.ats),
    accept: kind === "file" ? (input.getAttribute("accept") ?? undefined) : undefined,
    maxLength:
      "maxLength" in input && typeof input.maxLength === "number" && input.maxLength > 0
        ? input.maxLength
        : undefined,
  };
}

function signalForGroup(
  radios: HTMLInputElement[],
  groupKey: string,
  kind: "radio_group" | "multiselect",
  opts: ScanOptions,
  headings: { el: Element; text: string }[],
  ref: string,
): FieldSignal {
  const first = radios[0]!;
  const options: FieldOption[] = radios.map((r) => {
    const text = extractLabel(r).label || r.value;
    // checkboxes without an explicit value submit "on" — the label IS the value
    const value = r.value && r.value !== "on" ? r.value : text;
    return { value, text };
  });

  // group label: fieldset legend, else the group container's question text
  let label = "";
  const fieldset = first.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  if (legend?.textContent?.trim()) {
    label = legend.textContent.replace(/\s+/g, " ").trim();
  } else {
    const container = commonAncestor(radios);
    if (container) {
      const clone = container.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("input,label,select,textarea").forEach((x) => x.remove());
      label = (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    }
  }
  if (!label) label = extractLabel(first).label;

  return {
    ref,
    framePath: opts.framePath,
    selector: buildSelector(first),
    memberSelectors: radios.map((r) => buildSelector(r)),
    kind,
    label,
    labelSource: legend ? "label-for" : "geometric",
    nameAttr: first.name || undefined,
    idAttr: first.id || undefined,
    required: radios.some((r) => isRequired(r, label)),
    options,
    currentValue:
      kind === "multiselect"
        ? radios.filter((r) => r.checked).map((r) => r.value).join(",") || undefined
        : radios.find((r) => r.checked)?.value,
    sectionHeading: sectionHeadingFor(first, headings),
    visible: radios.some((r) => isVisible(r, opts.assumeLayout ?? false)),
    inShadow: first.getRootNode() instanceof ShadowRoot,
    groupId: groupKey,
    widgetHint: "native",
  };
}

// ---------------------------------------------------------------------------

function kindOf(el: Element): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return el.multiple ? "multiselect" : "select";
  if (el instanceof HTMLInputElement) {
    const role = el.getAttribute("role");
    if (role === "combobox") return "aria_combobox";
    const t = (el.type || "text").toLowerCase();
    switch (t) {
      case "email":
        return "email";
      case "tel":
        return "tel";
      case "url":
        return "url";
      case "number":
        return "number";
      case "date":
      case "month":
        return "date";
      case "checkbox":
        return "checkbox";
      case "radio":
        return "radio_group"; // grouped by the caller
      case "file":
        return "file";
      default:
        return "text";
    }
  }
  const role = el.getAttribute("role");
  if (role === "combobox") return "aria_combobox";
  if (role === "listbox") return "aria_listbox";
  const ce = el.getAttribute("contenteditable");
  if (ce === "" || ce === "true") return "contenteditable";
  return null;
}

function optionsOf(el: Element, kind: FieldKind): FieldOption[] | undefined {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options)
      .filter((o) => o.value !== "" || o.text.trim() !== "")
      .map((o) => ({ value: o.value, text: o.text.trim() }));
  }
  if (kind === "aria_listbox" || kind === "aria_combobox") {
    // options may not be rendered until opened; capture what exists
    const listboxId = el.getAttribute("aria-controls") ?? el.getAttribute("aria-owns");
    const listbox = listboxId ? el.ownerDocument.getElementById(listboxId) : el;
    const opts = listbox
      ? Array.from(listbox.querySelectorAll("[role=option]")).map((o) => ({
          value: o.getAttribute("data-value") ?? (o.textContent ?? "").trim(),
          text: (o.textContent ?? "").trim(),
        }))
      : [];
    return opts.length > 0 ? opts : undefined;
  }
  return undefined;
}

function currentValueOf(el: Element, kind: FieldKind): string | undefined {
  if (kind === "checkbox") return (el as HTMLInputElement).checked ? "true" : "false";
  if (kind === "file") return undefined;
  if (kind === "contenteditable") return (el.textContent ?? "").trim() || undefined;
  const v = (el as HTMLInputElement).value;
  return v ? v : undefined;
}

function widgetHintOf(el: Element, kind: FieldKind, ats: AtsId): WidgetHint {
  if (kind !== "aria_combobox" && kind !== "aria_listbox") {
    return "native";
  }
  const cls = `${el.className}`;
  const id = el.id ?? "";
  if (/react-select|select__input/i.test(cls) || /^react-select/.test(id)) {
    return "react_select";
  }
  if (ats === "ashby") return "ashby_combobox";
  if (ats === "greenhouse") return "greenhouse_select";
  if (ats === "lever") return "lever_native";
  return "unknown";
}

function isVisible(el: Element, assumeLayout: boolean): boolean {
  if ((el as HTMLElement).hidden) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el instanceof HTMLInputElement && el.type === "hidden") return false;
  const win = el.ownerDocument.defaultView;
  if (win) {
    let cur: Element | null = el;
    for (let i = 0; cur && i < 6; i++) {
      const cs = win.getComputedStyle(cur);
      if (cs.display === "none" || cs.visibility === "hidden") {
        // file inputs are routinely visually hidden behind styled dropzones —
        // still fillable via DataTransfer
        return el instanceof HTMLInputElement && el.type === "file" && cur === el;
      }
      cur = cur.parentElement;
    }
  }
  if (!assumeLayout && typeof el.getClientRects === "function") {
    if (el.getClientRects().length === 0) {
      return el instanceof HTMLInputElement && el.type === "file";
    }
  }
  return true;
}

function formKeyOf(el: HTMLInputElement): string {
  const form = el.form;
  if (!form) return "noform";
  return form.id || form.getAttribute("name") || "form0";
}

function commonAncestor(els: Element[]): Element | null {
  let anc: Element | null = els[0]?.parentElement ?? null;
  while (anc) {
    if (els.every((e) => anc!.contains(e))) return anc;
    anc = anc.parentElement;
  }
  return null;
}

export function buildSelector(el: Element): string {
  const id = el.getAttribute("id");
  if (id) return `#${cssEscape(id)}`;
  const name = el.getAttribute("name");
  if (name) {
    const tag = el.tagName.toLowerCase();
    if (
      el instanceof HTMLInputElement &&
      (el.type === "radio" || el.type === "checkbox")
    ) {
      // grouped inputs share a name — the value attribute disambiguates.
      // Without one, fall through to the positional path (a bare
      // [name=...] selector would resolve every member to the first input).
      const val = el.getAttribute("value");
      if (val !== null) {
        return `${tag}[name="${cssAttrEscape(name)}"][value="${cssAttrEscape(val)}"]`;
      }
    } else {
      return `${tag}[name="${cssAttrEscape(name)}"]`;
    }
  }
  // positional path fallback
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.parentElement && parts.length < 8) {
    const parent: Element = cur.parentElement;
    const idx = Array.from(parent.children).indexOf(cur) + 1;
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
    if (parent.id) {
      parts.unshift(`#${cssEscape(parent.id)}`);
      break;
    }
    cur = parent;
  }
  return parts.join(" > ");
}

function cssAttrEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export { querySelectorDeep };

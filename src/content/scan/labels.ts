import type { LabelSource } from "@shared/types";
import { cssEscape } from "../dom-utils";

// Accessible-name extraction (PLAN.md §2.3). Priority:
// el.labels/<label for> → aria-labelledby → aria-label → placeholder →
// geometric fallback (nearest preceding text in the form-row container).

const MAX_LABEL = 120;

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL * 2);
}

function stripRequiredMarkers(s: string): string {
  return s.replace(/\(required\)|\(optional\)/gi, "").replace(/[*✱]\s*$/, "").trim();
}

export interface LabelResult {
  label: string;
  source: LabelSource;
}

export function extractLabel(el: Element): LabelResult {
  // 1. associated <label>
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) {
    const t = stripRequiredMarkers(clean(labels[0]?.textContent));
    if (t) return { label: t, source: "label-for" };
  }
  const id = el.getAttribute("id");
  if (id) {
    const forLabel = el.ownerDocument.querySelector(`label[for="${cssEscape(id)}"]`);
    const t = stripRequiredMarkers(clean(forLabel?.textContent));
    if (t) return { label: t, source: "label-for" };
  }

  // 2. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((ref) => clean(el.ownerDocument.getElementById(ref)?.textContent))
      .filter(Boolean)
      .join(" ");
    const t = stripRequiredMarkers(text);
    if (t) return { label: t, source: "aria-labelledby" };
  }

  // 3. aria-label
  const ariaLabel = stripRequiredMarkers(clean(el.getAttribute("aria-label")));
  if (ariaLabel) return { label: ariaLabel, source: "aria-label" };

  // 4. wrapping <label>
  const wrapping = el.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("input,textarea,select").forEach((n) => n.remove());
    const t = stripRequiredMarkers(clean(clone.textContent));
    if (t) return { label: t, source: "label-for" };
  }

  // 5. placeholder
  const placeholder = stripRequiredMarkers(clean(el.getAttribute("placeholder")));
  if (placeholder) return { label: placeholder, source: "placeholder" };

  // 6. geometric fallback
  const geo = geometricLabel(el);
  if (geo) return { label: geo, source: "geometric" };

  // 7. humanized name attribute
  const name = el.getAttribute("name");
  if (name) {
    const humanized = name
      .replace(/[[\]_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim();
    if (humanized) return { label: humanized, source: "name-attr" };
  }

  return { label: "", source: "none" };
}

/**
 * Nearest preceding text within the same form-row container: climb up to 4
 * ancestors; at each level look at preceding siblings' text and at text
 * inside the ancestor that precedes the field.
 */
export function geometricLabel(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; depth < 4 && node; depth++) {
    const parent: Element | null = node.parentElement;
    if (!parent) break;

    // text inside the parent that precedes the field
    let acc = "";
    for (const child of Array.from(parent.childNodes)) {
      if (child === node) break;
      if (child.nodeType === Node.TEXT_NODE) acc += ` ${child.textContent ?? ""}`;
      else if (child instanceof Element && !child.querySelector("input,textarea,select")) {
        acc += ` ${child.textContent ?? ""}`;
      }
    }
    const inParent = stripRequiredMarkers(clean(acc));
    if (inParent.length >= 2 && inParent.length <= MAX_LABEL) return inParent;

    // preceding siblings of the container
    let sib: Element | null = parent.previousElementSibling;
    for (let s = 0; s < 3 && sib; s++) {
      if (!sib.querySelector("input,textarea,select")) {
        const t = stripRequiredMarkers(clean(sib.textContent));
        if (t.length >= 2 && t.length <= MAX_LABEL) return t;
      }
      sib = sib.previousElementSibling;
    }
    node = parent;
  }
  return "";
}

export function isRequired(el: Element, label: string): boolean {
  if (el.hasAttribute("required")) return true;
  if (el.getAttribute("aria-required") === "true") return true;
  const rawLabelText = rawLabelFor(el);
  return /[*✱]/.test(rawLabelText) || /\(required\)/i.test(rawLabelText) || /[*✱]$/.test(label);
}

function rawLabelFor(el: Element): string {
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length > 0) return clean(labels[0]?.textContent);
  const id = el.getAttribute("id");
  if (id) {
    return clean(
      el.ownerDocument.querySelector(`label[for="${cssEscape(id)}"]`)?.textContent,
    );
  }
  return "";
}

/** Nearest preceding h1–h4/[role=heading] in document order (PLAN.md §2.3.6). */
export function sectionHeadingFor(
  el: Element,
  headings: { el: Element; text: string }[],
): string | undefined {
  let best: string | undefined;
  for (const h of headings) {
    const pos = h.el.compareDocumentPosition(el);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) best = h.text;
    else break;
  }
  return best;
}

export function collectHeadings(root: Document | ShadowRoot): { el: Element; text: string }[] {
  return Array.from(root.querySelectorAll("h1,h2,h3,h4,[role=heading],legend"))
    .map((el) => ({ el, text: clean(el.textContent).slice(0, MAX_LABEL) }))
    .filter((h) => h.text.length > 0);
}

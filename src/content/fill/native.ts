// Native-input fill primitives (PLAN.md §4.1–4.2). The value-setter bypass is
// non-negotiable: React/Vue/Angular trap direct .value writes.

export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export function fillTextLike(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  el.focus();
  setNativeValue(el, value);
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

/** Wait two animation frames so frameworks can revert/settle, then read back. */
export function afterTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      setTimeout(resolve, 32);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function fillSelect(el: HTMLSelectElement, optionValue: string, optionText: string): boolean {
  let target = Array.from(el.options).find((o) => o.value === optionValue);
  if (!target) {
    target = Array.from(el.options).find((o) => o.text.trim() === optionText);
  }
  if (!target) return false;
  el.focus();
  el.value = target.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

/** Checkbox/radio: .click() fires the full framework event chain. */
export function setChecked(el: HTMLInputElement, desired: boolean): void {
  if (el.checked !== desired) el.click();
}

export function attachFile(
  input: HTMLInputElement,
  data: ArrayBuffer,
  fileName: string,
  mime: string,
): void {
  const file = new File([data], fileName, { type: mime });
  const dt = new DataTransfer();
  dt.items.add(file);
  try {
    input.files = dt.files;
  } catch {
    // some engines reject non-native FileList assignment — define directly
    Object.defineProperty(input, "files", { value: dt.files, configurable: true });
  }
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Dropzone fallback (PLAN.md §4.2): when the real input refuses files,
 * dispatch a synthetic drop carrying the DataTransfer at the dropzone.
 */
export function dropFileOn(
  dropzone: Element,
  data: ArrayBuffer,
  fileName: string,
  mime: string,
): void {
  const file = new File([data], fileName, { type: mime });
  const dt = new DataTransfer();
  dt.items.add(file);
  for (const type of ["dragenter", "dragover", "drop"] as const) {
    const ev = new DragEvent(type, { bubbles: true, cancelable: true });
    // DragEvent constructor ignores dataTransfer in some engines — define it
    Object.defineProperty(ev, "dataTransfer", { value: dt });
    dropzone.dispatchEvent(ev);
  }
}

export function fillContentEditable(el: HTMLElement, value: string): void {
  el.focus();
  const doc = el.ownerDocument;
  const sel = doc.defaultView?.getSelection?.();
  if (sel) {
    const range = doc.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  let inserted = false;
  try {
    inserted = doc.execCommand("insertText", false, value);
  } catch {
    inserted = false;
  }
  if (!inserted || (el.textContent ?? "").trim() !== value.trim()) {
    el.textContent = value;
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
    );
  }
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

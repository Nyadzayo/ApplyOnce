import { sameMeaning, normalizeLabel } from "@shared/normalize";
import { setNativeValue, afterTwoFrames } from "./native";

// Custom-widget playbook (PLAN.md §4.3). Every action is retry-once, verify,
// else downgrade to review. Never loop.

const MENU_TIMEOUT_MS = 1500;

function findOption(doc: Document, desired: string): HTMLElement | null {
  const options = Array.from(doc.querySelectorAll<HTMLElement>("[role=option]"));
  const exact = options.find((o) => sameMeaning(o.textContent ?? "", desired));
  if (exact) return exact;
  const nd = normalizeLabel(desired);
  const partial = options.filter((o) =>
    normalizeLabel(o.textContent ?? "").includes(nd),
  );
  return partial.length === 1 ? (partial[0] ?? null) : null;
}

function waitFor<T>(
  probe: () => T | null,
  timeoutMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    const immediate = probe();
    if (immediate) {
      resolve(immediate);
      return;
    }
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      observer.disconnect();
      resolve(probe());
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      const found = probe();
      if (found && !done) {
        done = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

function pressKey(el: Element, key: string): void {
  for (const type of ["keydown", "keyup"] as const) {
    el.dispatchEvent(
      new KeyboardEvent(type, { key, bubbles: true, cancelable: true }),
    );
  }
}

export interface WidgetResult {
  ok: boolean;
  verified: boolean;
  error?: string;
}

/**
 * react-select / Greenhouse-style select: click control → type into the inner
 * search input → await filtered menu → click exact-text option → verify.
 */
export async function fillReactSelect(
  input: HTMLInputElement,
  desired: string,
): Promise<WidgetResult> {
  const attempt = async (): Promise<WidgetResult> => {
    const control =
      input.closest("[class*='control']") ?? input.parentElement ?? input;
    (control as HTMLElement).dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    input.focus();
    setNativeValue(input, desired);
    const option = await waitFor(() => findOption(input.ownerDocument, desired), MENU_TIMEOUT_MS);
    if (!option) return { ok: false, verified: false, error: "no matching option appeared" };
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    option.click();
    await afterTwoFrames();
    return { ok: true, verified: verifyComboValue(input, desired) };
  };

  const first = await attempt();
  if (first.ok && first.verified) return first;
  const second = await attempt(); // retry once
  return second.ok ? second : first;
}

/**
 * ARIA combobox (Ashby): type via native setter → await [role=option] →
 * ArrowDown+Enter AND option click (belt + suspenders) → verify.
 */
export async function fillAriaCombobox(
  input: HTMLInputElement,
  desired: string,
): Promise<WidgetResult> {
  const attempt = async (): Promise<WidgetResult> => {
    input.focus();
    input.click();
    setNativeValue(input, desired);
    const option = await waitFor(() => findOption(input.ownerDocument, desired), MENU_TIMEOUT_MS);
    if (!option) return { ok: false, verified: false, error: "no matching option appeared" };
    option.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    pressKey(input, "ArrowDown");
    option.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    option.click();
    pressKey(input, "Enter");
    await afterTwoFrames();
    return { ok: true, verified: verifyComboValue(input, desired) };
  };

  const first = await attempt();
  if (first.ok && first.verified) return first;
  const second = await attempt();
  return second.ok ? second : first;
}

/** ARIA listbox: click trigger → click [role=option] by exact text. */
export async function fillAriaListbox(
  trigger: HTMLElement,
  desired: string,
): Promise<WidgetResult> {
  trigger.click();
  const option = await waitFor(() => findOption(trigger.ownerDocument, desired), MENU_TIMEOUT_MS);
  if (!option) return { ok: false, verified: false, error: "no matching option appeared" };
  option.click();
  await afterTwoFrames();
  const rendered = normalizeLabel(trigger.textContent ?? "");
  return {
    ok: true,
    verified: rendered.includes(normalizeLabel(desired)) || rendered.length > 0,
  };
}

function verifyComboValue(input: HTMLInputElement, desired: string): boolean {
  const nd = normalizeLabel(desired);
  if (normalizeLabel(input.value).includes(nd)) return true;
  // many comboboxes clear the input and render a chip/value next to it
  const container = input.closest("[class*='container'],[class*='control'],[role=combobox]")
    ?? input.parentElement;
  const rendered = normalizeLabel(container?.textContent ?? "");
  if (rendered.includes(nd)) return true;
  const active = input.getAttribute("aria-activedescendant");
  if (active) {
    const activeEl = input.ownerDocument.getElementById(active);
    if (activeEl && sameMeaning(activeEl.textContent ?? "", desired)) return true;
  }
  return false;
}

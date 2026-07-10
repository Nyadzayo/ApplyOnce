// Fill highlighting (PLAN.md §4.4): green = filled+verified, amber = filled +
// review suggested, red = needs you. Inline outline styles, restorable.

type Mark = "green" | "amber" | "red";

const COLORS: Record<Mark, string> = {
  green: "#267b4c",
  amber: "#9a6418",
  red: "#ab413a",
};

const marked = new Map<HTMLElement, { outline: string; offset: string }>();

export function markField(el: Element, mark: Mark, title?: string): void {
  // outline the visible widget, not a hidden input
  let target = el as HTMLElement;
  if (el instanceof HTMLInputElement && (el.type === "file" || el.type === "radio")) {
    target = (el.closest("fieldset, [class*=dropzone], label") as HTMLElement) ?? target;
  }
  if (!marked.has(target)) {
    marked.set(target, {
      outline: target.style.outline,
      offset: target.style.outlineOffset,
    });
  }
  target.style.outline = `2px solid ${COLORS[mark]}`;
  target.style.outlineOffset = "2px";
  if (title) target.title = title;
  target.setAttribute("data-fastapply-mark", mark);
}

export function clearMarks(): void {
  for (const [el, prev] of marked) {
    el.style.outline = prev.outline;
    el.style.outlineOffset = prev.offset;
    el.removeAttribute("data-fastapply-mark");
  }
  marked.clear();
}

// Shadow-root-aware DOM traversal (PLAN.md §2.1). Closed shadow roots are
// unreachable by design — we count them and surface "N fields couldn't be
// read" instead of resorting to fragile MAIN-world patches.

const FIELD_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[role=combobox]",
  "[role=listbox]",
  "[contenteditable=true]",
  "[contenteditable='']",
].join(",");

const SKIPPED_INPUT_TYPES = new Set(["submit", "button", "reset", "image", "hidden"]);

export function isFieldCandidate(el: Element): boolean {
  if (el.closest("[data-fastapply-ui]")) return false;
  if (el instanceof HTMLInputElement) {
    return !SKIPPED_INPUT_TYPES.has((el.type || "text").toLowerCase());
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  const role = el.getAttribute("role");
  if (role === "combobox" || role === "listbox") {
    // avoid double-reporting: native inputs with these roles are caught above
    return !(el instanceof HTMLInputElement);
  }
  const ce = el.getAttribute("contenteditable");
  return ce === "" || ce === "true";
}

export interface TraverseResult {
  fields: Element[];
  /** elements that host a closed shadow root (unreadable) */
  closedShadowHosts: number;
}

export function collectFields(root: Document | ShadowRoot): TraverseResult {
  const fields: Element[] = [];
  let closed = 0;
  const seen = new Set<Element>();

  const visit = (scope: Document | ShadowRoot | Element): void => {
    const doc = scope.ownerDocument ?? (scope as Document);
    const walker = doc.createTreeWalker(scope as Node, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode as Element | null;
    while (node) {
      if (node instanceof Element) {
        if (node.matches?.(FIELD_SELECTOR) && isFieldCandidate(node) && !seen.has(node)) {
          seen.add(node);
          fields.push(node);
        }
        const sr = (node as HTMLElement).shadowRoot;
        if (sr) {
          visit(sr);
        } else if (node.tagName?.includes("-") && customElements?.get?.(node.tagName.toLowerCase())) {
          // custom element without an open shadowRoot property → likely closed
          closed++;
        }
      }
      node = walker.nextNode() as Element | null;
    }
  };

  visit(root);
  return { fields, closedShadowHosts: closed };
}

/** querySelector that pierces open shadow roots (used by the filler). */
export function querySelectorDeep(root: Document | ShadowRoot, selector: string): Element | null {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root as Node, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as Element | null;
  while (node) {
    const sr = (node as HTMLElement).shadowRoot;
    if (sr) {
      const found = querySelectorDeep(sr, selector);
      if (found) return found;
    }
    node = walker.nextNode() as Element | null;
  }
  return null;
}

// CSS identifier escaping without depending on the CSS global — the scanner
// also runs under jsdom in the eval harness, which doesn't provide it.

export function cssEscape(value: string): string {
  const g = globalThis as { CSS?: { escape?: (s: string) => string } };
  if (typeof g.CSS?.escape === "function") return g.CSS.escape(value);
  // minimal fallback: escape everything outside [a-zA-Z0-9_-]
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

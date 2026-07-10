// Text normalization + similarity primitives used by the lexicon, the option
// resolver, and saved-answer retrieval. Pure functions, no browser APIs.

import { countryKeyOf, stateKeyOf } from "./geo";

export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(required\)|\(optional\)/g, " ")
    .replace(/[*✱]|:$/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(s: string): Set<string> {
  return new Set(normalizeLabel(s).split(" ").filter(Boolean));
}

export function jaccard(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function trigrams(s: string): Set<string> {
  const n = ` ${normalizeLabel(s)} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= n.length; i++) out.add(n.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Combined fuzzy score used for saved-answer retrieval (PLAN.md §3.2 tier 5). */
export function fuzzyScore(a: string, b: string): number {
  return Math.max(jaccard(a, b), trigramSimilarity(a, b));
}

// ---------------------------------------------------------------------------
// Alias tables for option resolution (PLAN.md §3.3)
// ---------------------------------------------------------------------------

/** Each group is a set of spellings that mean the same option value. */
const ALIAS_GROUPS: string[][] = [
  ["united states", "usa", "us", "united states of america", "u s", "u s a"],
  ["united kingdom", "uk", "great britain", "u k"],
  ["yes", "y", "true", "i am", "i do"],
  ["no", "n", "false", "i am not", "i do not", "i dont"],
  [
    "prefer not to say",
    "prefer not to answer",
    "decline to self identify",
    "decline to answer",
    "i dont wish to answer",
    "prefer not to disclose",
  ],
  ["male", "man"],
  ["female", "woman"],
  ["non binary", "nonbinary", "non binary genderqueer or gender non conforming"],
  ["bachelors", "bachelors degree", "bachelor s degree", "bs", "ba", "bsc", "beng", "b s", "b a", "undergraduate degree"],
  ["masters", "masters degree", "master s degree", "ms", "ma", "msc", "meng", "m s", "m a", "graduate degree"],
  ["doctorate", "phd", "ph d", "doctoral degree"],
  ["high school", "high school diploma", "ged", "secondary school"],
  ["remote", "fully remote", "remote only"],
  ["hybrid", "partially remote"],
  ["onsite", "on site", "in office", "in person"],
  [
    "i am not a protected veteran",
    "i am not a veteran",
    "not a protected veteran",
    "no i am not a protected veteran",
  ],
  [
    "i dont wish to answer veteran",
    "i decline to self identify veteran",
  ],
  ["no i do not have a disability", "no i dont have a disability or have a history record of having a disability"],
  ["yes i have a disability", "yes i have a disability or previously had a disability"],
];

const aliasIndex = new Map<string, number>();
ALIAS_GROUPS.forEach((group, i) => {
  for (const g of group) aliasIndex.set(g, i);
});

export function aliasGroupOf(s: string): number | undefined {
  return aliasIndex.get(normalizeLabel(s));
}

/** "South Africa (ZA)" → "South Africa" — dropdowns love parenthetical tags. */
function stripParenthetical(s: string): string {
  return s.replace(/\([^)]*\)/g, " ");
}

function meaningVariants(s: string): string[] {
  const a = normalizeLabel(s);
  const b = normalizeLabel(stripParenthetical(s));
  return a === b ? [a] : [a, b];
}

/** True when a and b are the same after normalization, alias resolution,
 *  country/state knowledge, or parenthetical stripping. */
export function sameMeaning(a: string, b: string): boolean {
  for (const va of meaningVariants(a)) {
    if (!va) continue;
    for (const vb of meaningVariants(b)) {
      if (!vb) continue;
      if (va === vb) return true;
      const ga = aliasIndex.get(va);
      if (ga !== undefined && ga === aliasIndex.get(vb)) return true;
      const ca = countryKeyOf(va);
      if (ca !== undefined && ca === countryKeyOf(vb)) return true;
      const sa = stateKeyOf(va);
      if (sa !== undefined && sa === stateKeyOf(vb)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Option resolution (PLAN.md §3.3)
// ---------------------------------------------------------------------------

export type OptionMatch<O> = { option: O; quality: "exact" | "substring" } | null;

/**
 * Resolve a desired value against a verbatim option list.
 * Tier 1: exact normalized/alias/country/state match.
 * Tier 2: UNIQUE substring match at reduced confidence.
 * Tier 3: UNIQUE token-containment match ("+44" → "United Kingdom (+44)").
 * Never invents an option (hard rule).
 */
export function resolveOption<O extends { value: string; text: string }>(
  desired: string,
  options: readonly O[],
): OptionMatch<O> {
  const nd = normalizeLabel(desired);
  if (!nd) return null;
  for (const o of options) {
    if (sameMeaning(desired, o.text) || sameMeaning(desired, o.value)) {
      return { option: o, quality: "exact" };
    }
  }
  const substr = options.filter((o) => {
    const nt = normalizeLabel(o.text);
    return nt.length > 0 && (nt.includes(nd) || nd.includes(nt));
  });
  if (substr.length === 1 && substr[0]) {
    return { option: substr[0], quality: "substring" };
  }
  // token containment: every token of the desired value appears in exactly
  // one option (text or value)
  const dtoks = tokenSet(desired);
  if (dtoks.size > 0) {
    const tokenMatches = options.filter((o) => {
      const otoks = tokenSet(`${o.text} ${o.value}`);
      return [...dtoks].every((t) => otoks.has(t));
    });
    if (tokenMatches.length === 1 && tokenMatches[0]) {
      return { option: tokenMatches[0], quality: "substring" };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Date formatting for fill-time (dates stored as "YYYY-MM" or "YYYY-MM-DD")
// ---------------------------------------------------------------------------

export function formatDateForInput(iso: string, hint: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(iso.trim());
  if (!m) return iso;
  const [, y = "", mo = "", d] = m;
  const day = d ?? "01";
  const h = hint.toUpperCase();
  if (h.includes("YYYY-MM-DD")) return `${y}-${mo}-${day}`;
  if (h.includes("DD")) {
    if (h.indexOf("DD") < h.indexOf("MM")) return `${day}/${mo}/${y}`;
    return `${mo}/${day}/${y}`;
  }
  if (h.includes("MM") && h.includes("YYYY")) {
    return h.indexOf("MM") < h.indexOf("YYYY") ? `${mo}/${y}` : `${y}/${mo}`;
  }
  return `${mo}/${day}/${y}`;
}

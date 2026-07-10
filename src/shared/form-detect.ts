import type { FieldSignal } from "./types";
import { lexiconLookup } from "./lexicon";

// Deterministic "is this a job application form?" classifier. No ML, no
// network — a transparent score over scanner output + URL, so the floating
// widget only appears on pages that actually look like applications.
// Same philosophy as the mapper: explainable, testable, tunable.

export interface DetectInput {
  url: string;
  title: string;
  signals: FieldSignal[];
}

export interface DetectResult {
  score: number;
  isApplication: boolean;
  reasons: string[];
}

export const DETECT_THRESHOLD = 6;

const URL_TOKENS = /apply|application|careers?|jobs?|vacanc|position|opening|recruit/i;
const RESUME_ACCEPT = /pdf|doc/i;

export function detectApplicationForm(input: DetectInput): DetectResult {
  const reasons: string[] = [];
  let score = 0;

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`+${points} ${reason}`);
  };

  const visible = input.signals.filter((s) => s.visible);
  if (visible.length < 2) {
    return { score: 0, isApplication: false, reasons: ["fewer than 2 visible fields"] };
  }

  // resume upload is the strongest single signal
  const fileInputs = visible.filter((s) => s.kind === "file");
  const resumeInput = fileInputs.find(
    (s) =>
      /resume|cv|curriculum/i.test(s.label) ||
      (s.accept !== undefined && RESUME_ACCEPT.test(s.accept)),
  );
  if (resumeInput) add(3, "resume/CV upload field");
  else if (fileInputs.length > 0) add(1, "file upload field");

  // canonical coverage: how many fields the lexicon recognizes as
  // application-shaped (name/email/phone/links/work-auth/EEO…)
  let canonicalHits = 0;
  let eeoOrLegal = 0;
  for (const s of visible) {
    const key = lexiconLookup(s.label, s.sectionHeading);
    if (key) {
      canonicalHits++;
      if (key.startsWith("eeo.") || key.startsWith("preferences.")) eeoOrLegal++;
    }
  }
  if (canonicalHits >= 5) add(3, `${canonicalHits} recognized application fields`);
  else if (canonicalHits >= 3) add(2, `${canonicalHits} recognized application fields`);
  else if (canonicalHits >= 2) add(1, `${canonicalHits} recognized application fields`);
  if (eeoOrLegal >= 1) add(2, "work-authorization/EEO questions present");

  const hasEmail = visible.some(
    (s) => s.kind === "email" || s.autocomplete === "email" || /e-?mail/i.test(s.label),
  );
  if (hasEmail) add(1, "email field");

  // page context
  if (URL_TOKENS.test(input.url)) add(2, "application-like URL");
  else if (URL_TOKENS.test(input.title)) add(1, "application-like title");

  // negative signals: login/checkout/search pages
  const negative = visible.filter((s) => /password|card number|cvv|coupon/i.test(s.label));
  if (negative.length > 0) {
    score -= 4;
    reasons.push("-4 password/payment fields present");
  }

  return { score, isApplication: score >= DETECT_THRESHOLD, reasons };
}

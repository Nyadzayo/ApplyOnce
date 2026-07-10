import type { AtsId, FieldSignal } from "./types";
import type { CanonicalKey } from "./canonical-fields";

// ---------------------------------------------------------------------------
// ATS detection (by URL) + per-ATS adapter rules (PLAN.md §3.2 tier 1).
// Adapter rules are the precision moat: selector/name maps per platform.
// They match on scanner output (FieldSignal), never on live DOM, so the
// mapper stays pure and testable.
// ---------------------------------------------------------------------------

export const ATS_IFRAME_PATTERNS: { ats: AtsId; hostRe: RegExp; origin: string }[] = [
  { ats: "greenhouse", hostRe: /(^|\.)greenhouse\.io$/i, origin: "https://boards.greenhouse.io/*" },
  { ats: "greenhouse", hostRe: /(^|\.)job-boards\.greenhouse\.io$/i, origin: "https://job-boards.greenhouse.io/*" },
  { ats: "lever", hostRe: /(^|\.)jobs\.lever\.co$/i, origin: "https://jobs.lever.co/*" },
  { ats: "ashby", hostRe: /(^|\.)jobs\.ashbyhq\.com$/i, origin: "https://jobs.ashbyhq.com/*" },
];

export function detectAts(url: string): AtsId {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return "generic";
  }
  for (const p of ATS_IFRAME_PATTERNS) {
    if (p.hostRe.test(host)) return p.ats;
  }
  return "generic";
}

// ---------------------------------------------------------------------------
// Adapter rules
// ---------------------------------------------------------------------------

interface AdapterRule {
  key: CanonicalKey;
  /** matched against the element id */
  idRe?: RegExp;
  /** matched against the name attribute */
  nameRe?: RegExp;
}

const GREENHOUSE: AdapterRule[] = [
  { key: "basics.firstName", idRe: /^first_name$/, nameRe: /^job_application\[first_name\]$/ },
  { key: "basics.lastName", idRe: /^last_name$/, nameRe: /^job_application\[last_name\]$/ },
  { key: "basics.email", idRe: /^email$/, nameRe: /^job_application\[email\]$/ },
  { key: "basics.phone", idRe: /^phone$/, nameRe: /^job_application\[phone\]$/ },
  { key: "location.full", idRe: /^(job_application_location|candidate-location|auto_complete_input)$/ },
  { key: "attachments.resume", idRe: /^resume$/, nameRe: /^job_application\[resume\]$/ },
  { key: "attachments.coverLetter", idRe: /^cover_letter$/, nameRe: /^job_application\[cover_letter\]$/ },
  { key: "eeo.gender", idRe: /^job_application_gender$/, nameRe: /^job_application\[gender\]$/ },
  { key: "eeo.hispanic", idRe: /^job_application_hispanic_ethnicity$/, nameRe: /^job_application\[hispanic_ethnicity\]$/ },
  { key: "eeo.race", idRe: /^job_application_race$/, nameRe: /^job_application\[race\]$/ },
  { key: "eeo.veteran", idRe: /^job_application_veteran_status$/, nameRe: /^job_application\[veteran_status\]$/ },
  { key: "eeo.disability", idRe: /^job_application_disability_status$/, nameRe: /^job_application\[disability_status\]$/ },
];

const LEVER: AdapterRule[] = [
  { key: "basics.fullName", nameRe: /^name$/ },
  { key: "basics.email", nameRe: /^email$/ },
  { key: "basics.phone", nameRe: /^phone$/ },
  { key: "work.company", nameRe: /^org$/ },
  { key: "location.full", nameRe: /^location$/ },
  { key: "links.linkedin", nameRe: /^urls\[LinkedIn\]$/i },
  { key: "links.github", nameRe: /^urls\[Git[Hh]ub\]$/ },
  { key: "links.portfolio", nameRe: /^urls\[Portfolio\]$/i },
  { key: "links.website", nameRe: /^urls\[(Other|Website)\]$/i },
  { key: "attachments.resume", nameRe: /^resume$/ },
  { key: "eeo.gender", nameRe: /^eeo\[gender\]$/ },
  { key: "eeo.race", nameRe: /^eeo\[race\]$/ },
  { key: "eeo.veteran", nameRe: /^eeo\[veteran\]$/ },
  { key: "eeo.disability", nameRe: /^eeo\[disability\]$/ },
];

const ASHBY: AdapterRule[] = [
  { key: "basics.fullName", idRe: /^_systemfield_name$/ },
  { key: "basics.email", idRe: /^_systemfield_email$/ },
  { key: "basics.phone", idRe: /^_systemfield_phone$/ },
  { key: "location.full", idRe: /^_systemfield_location$/ },
  { key: "attachments.resume", idRe: /^_systemfield_resume$/ },
];

const RULES: Record<AtsId, AdapterRule[]> = {
  greenhouse: GREENHOUSE,
  lever: LEVER,
  ashby: ASHBY,
  generic: [],
};

export function adapterLookup(
  ats: AtsId,
  signal: Pick<FieldSignal, "idAttr" | "nameAttr">,
): CanonicalKey | undefined {
  for (const rule of RULES[ats]) {
    if (rule.idRe && signal.idAttr && rule.idRe.test(signal.idAttr)) return rule.key;
    if (rule.nameRe && signal.nameAttr && rule.nameRe.test(signal.nameAttr)) return rule.key;
  }
  return undefined;
}

/** Greenhouse/Lever custom-question fields → routed to saved answers. */
export function isCustomQuestionField(
  ats: AtsId,
  signal: Pick<FieldSignal, "idAttr" | "nameAttr">,
): boolean {
  if (ats === "greenhouse") {
    return /job_application\[answers_attributes\]/.test(signal.nameAttr ?? "") ||
      /^job_application_answers_attributes/.test(signal.idAttr ?? "");
  }
  if (ats === "lever") {
    return /^cards\[/.test(signal.nameAttr ?? "");
  }
  return false;
}

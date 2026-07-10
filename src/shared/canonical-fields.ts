// Canonical field ontology (PLAN.md §3.1). Every mapping decision resolves a
// page field to one of these keys, or abstains. `custom.*` keys are minted at
// runtime from normalized saved-answer questions.

export const CANONICAL_KEYS = [
  // basics
  "basics.firstName",
  "basics.lastName",
  "basics.fullName",
  "basics.email",
  "basics.phone",
  "basics.phoneCountryCode",
  "basics.pronouns",
  // location
  "location.street",
  "location.city",
  "location.region",
  "location.country",
  "location.postalCode",
  "location.full",
  // links
  "links.linkedin",
  "links.github",
  "links.portfolio",
  "links.website",
  "links.other",
  // work (un-indexed keys map to most recent entry in v1)
  "work.company",
  "work.title",
  "work.start",
  "work.end",
  "work.current",
  "work.description",
  // education
  "education.school",
  "education.degree",
  "education.field",
  "education.start",
  "education.end",
  "education.gpa",
  // skills
  "skills.list",
  // preferences / legal
  "preferences.workAuth",
  "preferences.requiresSponsorship",
  "preferences.salary",
  "preferences.salaryMin",
  "preferences.salaryMax",
  "preferences.startDate",
  "preferences.relocation",
  "preferences.remote",
  "preferences.noticePeriod",
  "preferences.howHeard",
  // EEO self-identification — explicit settings only, never inferred
  "eeo.gender",
  "eeo.race",
  "eeo.hispanic",
  "eeo.veteran",
  "eeo.disability",
  // attachments
  "attachments.resume",
  "attachments.coverLetter",
] as const;

export type CanonicalKey = (typeof CANONICAL_KEYS)[number] | `custom.${string}`;

export function isCanonicalKey(k: string): k is CanonicalKey {
  return (
    (CANONICAL_KEYS as readonly string[]).includes(k) || k.startsWith("custom.")
  );
}

/**
 * Risk classes drive the hard gates in scoring.ts (PLAN.md §3.4).
 * - "eeo"    → fill only from explicit user settings, else always review
 * - "legal"  → work authorization / sponsorship — explicit settings only
 * - "salary" → explicit setting or saved answer only
 * - "file"   → always surface what will be attached
 * - "normal" → score-gated
 */
export type RiskClass = "normal" | "eeo" | "legal" | "salary" | "file";

export function riskClassOf(key: CanonicalKey): RiskClass {
  if (key.startsWith("eeo.")) return "eeo";
  if (key === "preferences.workAuth" || key === "preferences.requiresSponsorship")
    return "legal";
  if (
    key === "preferences.salary" ||
    key === "preferences.salaryMin" ||
    key === "preferences.salaryMax"
  )
    return "salary";
  if (key.startsWith("attachments.")) return "file";
  return "normal";
}

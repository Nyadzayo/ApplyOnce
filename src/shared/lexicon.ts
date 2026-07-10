import type { CanonicalKey } from "./canonical-fields";
import { normalizeLabel } from "./normalize";

// Normalized-label lexicon (PLAN.md §3.2 tier 3). A curated synonym table —
// exact normalized matches first, then anchored "contains" patterns. Order
// matters: first hit wins, so specific entries precede general ones.

interface LexiconEntry {
  key: CanonicalKey;
  /** label must equal one of these after normalization */
  exact?: string[];
  /** label must contain one of these after normalization */
  contains?: string[];
  /** if present, at least one must appear in the section heading (normalized) */
  sectionAny?: string[];
}

const LEXICON: LexiconEntry[] = [
  // --- legal / preferences (specific phrasings before generic words) ---
  {
    key: "preferences.requiresSponsorship",
    contains: [
      "require sponsorship",
      "need sponsorship",
      "require visa sponsorship",
      "require immigration sponsorship",
      "now or in the future require sponsorship",
      "sponsorship to work",
    ],
  },
  {
    key: "preferences.workAuth",
    contains: [
      "legally authorized to work",
      "legally authorised to work", // British spelling
      "authorized to work",
      "authorised to work",
      "eligible to work",
      "eligibility to work",
      "right to work",
      "work authorization",
      "work authorisation",
    ],
  },
  // min/max before the generic salary phrasings
  {
    key: "preferences.salaryMin",
    exact: ["minimum salary", "salary minimum", "salary from", "base salary minimum"],
    contains: ["minimum salary", "minimum expected salary", "minimum compensation", "salary range from"],
  },
  {
    key: "preferences.salaryMax",
    exact: ["maximum salary", "salary maximum", "salary to", "base salary maximum"],
    contains: ["maximum salary", "maximum expected salary", "maximum compensation", "salary range to"],
  },
  {
    key: "preferences.salary",
    contains: [
      "salary expectation",
      "expected salary",
      "desired salary",
      "compensation expectation",
      "desired compensation",
      "salary requirement",
    ],
  },
  {
    key: "skills.list",
    exact: ["skills", "technical skills", "technologies", "tech stack", "key skills", "core skills"],
    contains: ["which of the following skills", "which of the following technologies", "select your skills"],
  },
  {
    key: "preferences.startDate",
    contains: ["earliest start date", "available to start", "availability date", "when can you start"],
  },
  {
    key: "preferences.noticePeriod",
    contains: ["notice period"],
  },
  {
    key: "preferences.relocation",
    contains: ["willing to relocate", "open to relocat", "able to relocate"],
  },
  {
    key: "preferences.remote",
    contains: ["remote work preference", "work preference remote", "prefer to work remote"],
  },
  {
    key: "preferences.howHeard",
    contains: ["how did you hear", "how you heard", "where did you hear"],
  },

  // --- EEO (explicit settings only; the gate is enforced in scoring) ---
  { key: "eeo.gender", exact: ["gender", "gender identity", "sex"], contains: ["gender identity"] },
  {
    key: "eeo.hispanic",
    contains: ["hispanic or latino", "hispanic latino", "latinx"],
  },
  {
    key: "eeo.race",
    exact: ["race", "ethnicity", "race ethnicity"],
    contains: ["racial or ethnic", "race and or ethnicity", "identify your race"],
  },
  {
    key: "eeo.veteran",
    contains: ["veteran status", "protected veteran"],
  },
  {
    key: "eeo.disability",
    contains: ["disability status", "have a disability"],
  },

  // --- links (before generic "website") ---
  { key: "links.linkedin", contains: ["linkedin"] },
  { key: "links.github", contains: ["github"] },
  { key: "links.portfolio", contains: ["portfolio"] },
  { key: "links.website", exact: ["website", "personal website", "web site"], contains: ["personal website"] },

  // --- basics ---
  {
    key: "basics.firstName",
    exact: ["first name", "given name", "forename", "legal first name", "preferred first name"],
  },
  {
    key: "basics.lastName",
    exact: ["last name", "family name", "surname", "legal last name"],
  },
  {
    key: "basics.fullName",
    exact: ["full name", "name", "your name", "full legal name", "legal name"],
  },
  { key: "basics.email", exact: ["email", "email address", "e mail", "e mail address", "contact email"] },
  {
    key: "basics.phone",
    exact: ["phone", "phone number", "mobile", "mobile number", "cell phone", "telephone", "contact number"],
    contains: ["phone number"],
  },
  { key: "basics.pronouns", exact: ["pronouns", "preferred pronouns"] },

  // --- location (street/address-line before the generic "address") ---
  {
    key: "location.street",
    exact: ["street address", "address line 1", "address line", "street", "home address"],
    contains: ["address line 1", "street address"],
  },
  {
    key: "location.full",
    exact: ["location", "current location", "address", "where are you located", "city state"],
    contains: ["current location", "where are you based", "where are you located"],
  },
  { key: "location.city", exact: ["city", "town", "current city", "city of residence"] },
  {
    key: "location.region",
    exact: ["state", "province", "region", "state province", "county", "state region", "state or province"],
  },
  { key: "location.country", exact: ["country", "country of residence", "current country", "country region"] },
  { key: "location.postalCode", exact: ["zip", "zip code", "postal code", "postcode"] },
  {
    key: "basics.phoneCountryCode",
    exact: ["country code", "phone country code", "dial code", "country calling code", "phone country"],
    contains: ["country dial code", "phone country code"],
  },

  // --- work (section-disambiguated dates first) ---
  {
    key: "work.company",
    exact: ["company", "current company", "employer", "current employer", "most recent company", "organization"],
  },
  {
    key: "work.title",
    exact: ["title", "job title", "current title", "role", "current role", "position", "most recent title"],
  },
  {
    key: "work.start",
    exact: ["start date", "from"],
    sectionAny: ["experience", "employment", "work history", "work"],
  },
  {
    key: "work.end",
    exact: ["end date", "to"],
    sectionAny: ["experience", "employment", "work history", "work"],
  },

  // --- education ---
  {
    key: "education.school",
    exact: ["school", "university", "college", "institution", "school name", "alma mater"],
  },
  { key: "education.degree", exact: ["degree", "highest degree", "education level", "degree level", "highest level of education"] },
  { key: "education.field", exact: ["major", "field of study", "discipline", "area of study", "concentration"] },
  { key: "education.gpa", exact: ["gpa", "grade point average"] },
  {
    key: "education.start",
    exact: ["start date", "from"],
    sectionAny: ["education", "school", "university"],
  },
  {
    key: "education.end",
    exact: ["end date", "graduation date", "to", "graduation year"],
    sectionAny: ["education", "school", "university"],
  },

  // --- attachments ---
  {
    key: "attachments.resume",
    exact: ["resume", "cv", "resume cv", "upload resume", "attach resume", "resume or cv"],
    contains: ["resume", "curriculum vitae"],
  },
  {
    key: "attachments.coverLetter",
    contains: ["cover letter"],
  },
];

export function lexiconLookup(
  label: string,
  sectionHeading?: string,
): CanonicalKey | undefined {
  const nl = normalizeLabel(label);
  if (!nl) return undefined;
  const section = normalizeLabel(sectionHeading ?? "");
  for (const entry of LEXICON) {
    if (entry.sectionAny) {
      if (!section || !entry.sectionAny.some((s) => section.includes(s))) continue;
    }
    if (entry.exact?.includes(nl)) return entry.key;
    if (entry.contains?.some((c) => nl.includes(c))) return entry.key;
  }
  return undefined;
}

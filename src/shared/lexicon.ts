import type { CanonicalKey } from "./canonical-fields";
import { normalizeLabel, tokenSet } from "./normalize";

// Normalized-label lexicon (PLAN.md §3.2 tier 3). A curated synonym table —
// exact normalized matches first, then anchored "contains" patterns, then
// whole-word matches. Order matters: first hit wins, so specific entries
// precede general ones. Expanded 2026-09-01 (PLAN.md Part 9 §1) from the
// 2,078-question corpus; every pattern below was checked against that corpus
// for false positives — precision beats recall, add nothing speculative.

interface LexiconEntry {
  key: CanonicalKey;
  /** label must equal one of these after normalization */
  exact?: string[];
  /** label must contain one of these after normalization */
  contains?: string[];
  /** label must contain one of these as a whole word */
  anyWord?: string[];
  /** every one of these must appear (substring) — for "sponsor" + "require" */
  all?: string[];
  /** never match when the label contains one of these */
  excludeContains?: string[];
  /** if present, at least one must appear in the section heading (normalized) */
  sectionAny?: string[];
}

const LEXICON: LexiconEntry[] = [
  // --- legal / preferences (specific phrasings before generic words) ---
  // Sponsorship: any question that asks whether the applicant requires/needs
  // sponsorship. Statements ("this role is not eligible for sponsorship")
  // and free-text detail requests carry no require/need verb and fall through.
  ...(["require", "need", "will you", "would you"] as const).map(
    (verb): LexiconEntry => ({
      key: "preferences.requiresSponsorship",
      all: ["sponsor", verb],
      excludeContains: ["not eligible for", "if yes", "if you answered", "additional detail", "disclaimer"],
    }),
  ),
  {
    key: "preferences.workAuth",
    contains: [
      "legally authorized to work",
      "legally authorised to work", // British spelling
      "authorized to work",
      "authorised to work",
      "authorized to lawfully work",
      "authorization to work",
      "authorisation to work",
      "eligible to work",
      "eligibility to work",
      "right to work",
      "work authorization",
      "work authorisation",
      "legally able to work",
      "legally permitted to work",
      "permitted to work",
    ],
    excludeContains: ["sponsor"],
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
      "expected compensation",
      "salary expectations",
      "expected base salary",
      "desired base salary",
      "target salary",
      "target compensation",
    ],
    excludeContains: ["current salary", "current compensation", "current base"],
  },
  {
    key: "skills.list",
    exact: ["skills", "technical skills", "technologies", "tech stack", "key skills", "core skills"],
    contains: ["which of the following skills", "which of the following technologies", "select your skills"],
  },
  {
    key: "preferences.startDate",
    contains: [
      "earliest start date",
      "available to start",
      "availability date",
      "when can you start",
      "earliest date you",
      "earliest possible start",
      "start date availability",
      "date available to start",
      "when could you start",
      "when are you available to start",
      "when would you be able to start",
      "available start date",
      "desired start date",
      "preferred start date",
    ],
  },
  {
    key: "preferences.noticePeriod",
    contains: ["notice period"],
    excludeContains: ["comment"],
  },
  {
    key: "preferences.relocation",
    contains: [
      "willing to relocate",
      "open to relocat",
      "able to relocate",
      "consider relocating",
      "willing to move to",
      "willingness to relocate",
    ],
  },
  {
    key: "preferences.remote",
    contains: [
      "remote work preference",
      "work preference remote",
      "prefer to work remote",
      "preferred work arrangement",
      "work arrangement preference",
      "remote hybrid or on site",
      "remote hybrid or onsite",
      "remote hybrid on site",
      "onsite hybrid or remote",
      "on site hybrid or remote",
      "in office remote or hybrid",
      "remote or in office",
      "remote or on site",
      "remote or onsite",
    ],
  },
  {
    key: "preferences.howHeard",
    contains: [
      "how did you hear",
      "how you heard",
      "where did you hear",
      "how did you first hear",
      "how did you initially hear",
      "where did you first hear",
      "how did you learn about",
      "where have you learned about",
      "how did you learn of",
      "how did you find out about",
      "how did you find this",
      "how did you find us",
      "how did you come across",
      "how did you discover",
      "referral source",
      "source of referral",
      "how were you referred",
      "how did you get referred",
    ],
  },

  // --- pronouns before EEO gender ("gender pronouns") ---
  {
    key: "basics.pronouns",
    exact: ["pronouns", "preferred pronouns"],
    anyWord: ["pronouns"],
    excludeContains: ["if you selected", "self describe", "specify", "encourage"],
  },

  // --- EEO (explicit settings only; the gate is enforced in scoring) ---
  {
    key: "eeo.gender",
    exact: ["gender", "gender identity", "sex"],
    anyWord: ["gender"],
    excludeContains: ["sexual orientation", "pronoun"],
  },
  {
    key: "eeo.hispanic",
    contains: ["hispanic or latino", "hispanic latino", "latinx", "hispanic"],
  },
  {
    key: "eeo.race",
    exact: ["race", "ethnicity", "race ethnicity"],
    anyWord: ["race", "ethnicity", "racial", "ethnic"],
  },
  {
    key: "eeo.veteran",
    exact: ["veteran", "veterans", "veteran status", "disabled veteran"],
    contains: ["veteran status", "protected veteran", "are you a veteran", "military status", "military service"],
    anyWord: ["veteran"],
    excludeContains: ["employment", "above", "resume", "please enter", "please list"],
  },
  {
    key: "eeo.disability",
    contains: ["disability status", "have a disability"],
    anyWord: ["disability", "disabled", "disabilities"],
    excludeContains: ["accommodat", "veteran"],
  },

  // --- attachments before links ("Portfolio or Cover Letter" is a file) ---
  {
    key: "attachments.coverLetter",
    contains: ["cover letter", "covering letter", "letter of motivation", "motivation letter"],
  },

  // --- links (before generic "website") ---
  {
    key: "links.linkedin",
    exact: ["linkedin", "linkedin profile", "linkedin url", "linkedin profile url", "linkedin link", "linkedin com", "linkedin profile link", "linkedin address"],
    contains: [
      "linkedin profile",
      "linkedin url",
      "linkedin link",
      "linkedin address",
      "linkedin page",
      "linkedin com",
      "link to your linkedin",
      "your linkedin",
      "linkedin optional",
    ],
  },
  {
    key: "links.github",
    exact: ["github", "github profile", "github url", "github link", "github profile url", "github com", "github username", "website or github", "github or website", "github or portfolio", "portfolio or github", "github gitlab", "github or gitlab", "github bitbucket"],
    contains: ["github profile", "github url", "github link", "github com", "your github", "github username", "link to your github"],
  },
  {
    key: "links.portfolio",
    exact: [
      "portfolio",
      "portfolio url",
      "portfolio link",
      "portfolio website",
      "online portfolio",
      "portfolio site",
      "link to portfolio",
      "portfolio or website",
      "website or portfolio",
      "website portfolio",
      "portfolio website url",
      "personal website or portfolio",
      "portfolio or personal website",
    ],
    contains: ["portfolio url", "portfolio link", "link to your portfolio", "online portfolio", "portfolio website", "your portfolio"],
    excludeContains: ["password", "revenue", "managed"],
  },
  {
    key: "links.website",
    exact: ["website", "personal website", "web site", "website url", "personal site", "personal website url", "homepage", "blog", "personal blog"],
    contains: ["personal website"],
  },
  {
    key: "links.other",
    exact: ["other website", "other links", "other link", "other url", "additional links", "other relevant links", "twitter", "twitter url", "x twitter", "twitter handle", "other social media", "additional website", "any other links"],
  },

  // --- basics ---
  {
    key: "basics.firstName",
    exact: ["first name", "given name", "forename", "legal first name", "first", "firstname", "first name s", "given names"],
    contains: ["legal first name", "your first name"],
    excludeContains: ["preferred", "nickname", "emergency", "reference", "referrer", "referral", "recruiter", "manager"],
  },
  {
    key: "basics.lastName",
    exact: ["last name", "family name", "surname", "legal last name", "last", "lastname", "second name", "family names"],
    contains: ["legal last name", "your last name", "your surname", "legal surname"],
    excludeContains: ["preferred", "emergency", "reference", "referrer", "referral", "recruiter", "manager", "maiden"],
  },
  {
    key: "basics.fullName",
    exact: ["full name", "name", "your name", "full legal name", "legal name", "candidate name", "applicant name", "your full name", "complete name"],
    contains: ["full legal name", "your full name", "what is your legal name", "what is your name"],
    excludeContains: ["if different", "preferred", "emergency", "reference", "referrer", "referral", "recruiter", "manager", "company", "employer", "school", "university"],
  },
  {
    key: "basics.email",
    exact: ["email", "email address", "e mail", "e mail address", "contact email", "your email", "email id", "primary email", "personal email", "e mail id", "correo electrónico", "correo", "e mail adresse", "adresse e mail", "courriel"],
    contains: ["your email address", "email address optional", "preferred email"],
    excludeContains: ["confirm", "verify", "reference", "referrer", "referral", "recruiter", "manager", "emergency"],
  },
  {
    key: "basics.phone",
    exact: [
      "phone",
      "phone number",
      "mobile",
      "mobile number",
      "cell phone",
      "telephone",
      "contact number",
      "mobile phone",
      "mobile phone number",
      "cell phone number",
      "cellphone",
      "cell",
      "telephone number",
      "phone no",
      "primary phone",
      "primary phone number",
      "contact phone",
      "contact phone number",
      "phone number optional",
      "best phone number",
      "telefono",
      "teléfono",
      "telefon",
      "telefonnummer",
      "téléphone",
      "numéro de téléphone",
      "número de teléfono",
      "handynummer",
      "celular",
      "phone mobile",
      "mobile phone number optional",
      "your phone number",
    ],
    contains: ["your phone number", "best phone number", "phone number optional"],
    excludeContains: ["agree", "consent", "acknowledge", "reference", "referrer", "recruiter", "manager", "emergency", "country code"],
  },

  // --- location (street/address-line before the generic "address") ---
  {
    key: "location.street",
    exact: ["street address", "address line 1", "address line", "street", "home address", "address 1", "street address line 1", "mailing address", "home address street"],
    contains: ["address line 1", "street address"],
  },
  {
    key: "location.postalCode",
    exact: ["zip", "zip code", "postal code", "postcode", "zip postal code", "postal zip code", "zip or postal code", "postal", "plz", "postleitzahl", "código postal", "codigo postal", "code postal", "cep", "pin code", "pincode", "home address zip code", "address zip code", "home address postal code", "zip postal", "postcode zip"],
    contains: ["zip code", "postal code", "postcode", "zip postal code", "home address zip", "home address cep"],
  },
  {
    key: "location.city",
    exact: ["city", "town", "current city", "city of residence", "home address city", "address city", "city town", "town city", "city name", "home city", "residence city", "ciudad", "stadt", "ville", "cidade", "city or town", "town or city", "what city do you live in"],
    contains: ["home address city", "which city do you", "what city do you", "city do you currently", "city do you live", "city are you based", "city are you located", "city of residence"],
    excludeContains: ["state", "country", "province", "region"],
  },
  {
    key: "location.region",
    exact: ["state", "province", "region", "state province", "county", "state region", "state or province", "home address state", "address state", "state region province", "state province region", "state or region", "province state", "province region", "region state", "state territory", "state or territory", "estado", "bundesland", "provincia", "state province region", "state province territory"],
    contains: ["home address state", "state or province do you", "state province do you", "which state do", "what state do", "which state or province", "state do you currently", "state do you live", "state do you reside", "province do you", "region do you reside", "region do you live", "region you are currently located", "region are you located", "region are you currently", "which state are you", "what state are you"],
    excludeContains: ["country", "city", "united states", "statement", "estate"],
  },
  {
    key: "location.country",
    exact: ["country", "country of residence", "current country", "country region", "home address country", "address country", "residence country", "country name", "país", "pais", "pays", "país de residencia", "country you live in", "country of current residence", "country territory", "country or region"],
    contains: [
      "country of residence",
      "country are you based",
      "country where you currently reside",
      "country where you currently live",
      "country where you live",
      "country where you reside",
      "country do you currently",
      "country do you live",
      "country do you reside",
      "country you currently",
      "country are you located",
      "country are you currently",
      "country you live",
      "country you reside",
      "country you are based",
      "country you are located",
      "country you are currently",
      "country of current residence",
      "home address country",
    ],
    excludeContains: ["code", "citizenship", "nationality", "authorized", "authorised", "sponsor", "relocat", "move"],
  },
  {
    key: "location.full",
    exact: ["location", "current location", "address", "where are you located", "city state", "city and state", "location city", "your location", "city state country", "city country", "location city state", "current address", "residential address", "where do you live", "where are you based", "present location"],
    contains: [
      "current location",
      "where are you based",
      "where are you located",
      "where are you currently located",
      "where are you currently based",
      "where do you currently live",
      "where do you live",
      "where do you currently reside",
      "where do you reside",
      "where do you intend to work",
      "city and state",
      "city state",
      "where are you currently living",
      "where are you living",
      "where do you currently work from",
      "where are you currently residing",
    ],
    excludeContains: ["relocat", "move", "office", "preferred", "prefer", "yes", "willing", "plan to", "email", "ip address", "url", "web"],
  },
  {
    key: "basics.phoneCountryCode",
    exact: ["country code", "phone country code", "dial code", "country calling code", "phone country", "country dial code", "phone code", "calling code"],
    contains: ["country dial code", "phone country code", "country calling code"],
  },

  // --- work (section-disambiguated dates first) ---
  {
    key: "work.company",
    exact: ["company", "current company", "employer", "current employer", "most recent company", "organization", "company name", "current company name", "employer name", "most recent employer", "current or most recent company", "current or most recent employer", "current employer name", "organisation", "company organization", "current organization"],
    contains: ["current or most recent company", "current or most recent employer", "current or previous employer", "current or previous company", "name of your current employer", "name of current employer", "who is your current employer", "current company name"],
    excludeContains: ["sponsor", "referred", "referral", "hear", "previously", "worked for", "worked at", "ever", "why"],
  },
  {
    key: "work.title",
    exact: ["title", "job title", "current title", "role", "current role", "position", "most recent title", "current job title", "current position", "most recent job title", "current or most recent title", "current or most recent job title", "current or most recent role", "job title current", "your current title", "your job title"],
    contains: ["current job title", "current or most recent title", "current or most recent job title", "current or most recent role", "current or previous job title", "current or previous title", "your current job title", "most recent job title"],
    excludeContains: ["why", "interest", "apply", "referred", "which", "hear", "requirement"],
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
    exact: ["school", "university", "college", "institution", "school name", "alma mater", "university name", "college name", "university college", "school university", "school college university", "institution name", "name of school", "name of university", "name of institution", "educational institution", "most recent school", "school attended", "university attended", "college university", "school college"],
    contains: [
      "which university",
      "which school",
      "which college",
      "name of your university",
      "name of your school",
      "name of your college",
      "university attended",
      "school attended",
      "most recently attended school",
      "most recent school",
      "school you attended",
      "university you attended",
      "college you attended",
      "where did you study",
      "where did you go to school",
      "where did you go to college",
      "university did you attend",
      "school did you attend",
      "college did you attend",
      "university are you currently attending",
      "school are you currently attending",
      "school college university",
      "school university college",
    ],
    excludeContains: ["high school", "why", "email", "address", "gpa", "graduat", "degree", "major"],
  },
  {
    key: "education.degree",
    exact: ["degree", "highest degree", "education level", "degree level", "highest level of education", "level of education", "degree type", "degree obtained", "highest degree obtained", "highest education level", "highest degree earned", "degree earned", "education", "qualification", "highest qualification", "highest education"],
    contains: ["highest degree", "highest level of education", "most advanced degree", "level of education", "highest education", "degree obtained", "degree earned", "education level", "degree level", "highest qualification", "highest academic"],
    excludeContains: ["why", "field", "major", "subject", "gpa", "school", "university", "college", "which university", "graduation"],
  },
  {
    key: "education.field",
    exact: ["major", "field of study", "discipline", "area of study", "concentration", "major field of study", "subject", "field", "course of study", "major s", "majors", "major concentration", "field of study major", "major field", "study field", "degree major", "degree field"],
    contains: ["field of study", "area of study", "course of study", "major field", "what did you study", "what was your major", "your major"],
    excludeContains: ["why", "gpa", "school name", "university name", "graduat"],
  },
  {
    key: "education.gpa",
    exact: ["gpa", "grade point average", "cumulative gpa", "overall gpa", "undergraduate gpa", "current gpa", "gpa out of 4 0", "gpa 4 0 scale"],
    contains: ["grade point average", "cumulative gpa", "undergraduate gpa", "overall gpa", "current gpa", "what is your gpa", "your gpa"],
    anyWord: ["gpa"],
    excludeContains: ["why", "scale do", "which scale"],
  },
  {
    key: "education.end",
    exact: ["graduation date", "graduation year", "expected graduation date", "expected graduation", "year of graduation", "date of graduation", "anticipated graduation date", "expected graduation year", "graduation month year", "graduation month and year", "expected graduation month year", "graduation"],
    contains: ["graduation date", "graduation year", "expected graduation", "anticipated graduation", "date of graduation", "year of graduation", "when did you graduate", "when will you graduate", "month and year of graduation", "graduation month"],
    excludeContains: ["why", "high school", "did you graduate from", "gpa"],
  },
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
    exact: ["resume", "cv", "resume cv", "upload resume", "attach resume", "resume or cv", "cv resume", "upload cv", "attach cv", "résumé", "resume upload", "cv upload", "upload your resume", "upload your cv", "curriculum vitae", "lebenslauf", "attach your resume", "resume file"],
    contains: ["upload resume", "upload your resume", "attach resume", "attach your resume", "resume or cv", "resume cv", "cv resume", "upload cv", "upload your cv", "attach cv", "curriculum vitae", "resume upload", "cv upload", "resume file"],
    excludeContains: ["agree", "acknowledge", "consent", "share", "keep", "retain", "verified", "format", "team member", "other than", "in addition", "besides"],
  },
];

function labelVariants(label: string): string[] {
  const nl = normalizeLabel(label);
  // "DisabilityStatus" / "VeteranStatus": camelCase attribute names used as
  // labels by some ATS builders — split them before normalizing
  const split = normalizeLabel(label.replace(/([a-z])([A-Z])/g, "$1 $2"));
  return split === nl ? [nl] : [nl, split];
}

function entryMatches(entry: LexiconEntry, nl: string, words: Set<string>): boolean {
  if (entry.excludeContains?.some((x) => nl.includes(x))) return false;
  if (entry.exact?.includes(nl)) return true;
  if (entry.contains?.some((c) => nl.includes(c))) return true;
  // whole-word hits are only trusted on question-length labels; a paragraph
  // mentioning "pronouns" or a "data race" screener is not that field
  if (words.size <= 16 && entry.anyWord?.some((w) => words.has(w))) return true;
  if (entry.all && entry.all.every((a) => nl.includes(a))) return true;
  return false;
}

export function lexiconLookup(
  label: string,
  sectionHeading?: string,
): CanonicalKey | undefined {
  const variants = labelVariants(label);
  if (!variants[0]) return undefined;
  const section = normalizeLabel(sectionHeading ?? "");
  for (const entry of LEXICON) {
    if (entry.sectionAny) {
      if (!section || !entry.sectionAny.some((s) => section.includes(s))) continue;
    }
    for (const nl of variants) {
      if (entryMatches(entry, nl, tokenSet(nl))) return entry.key;
    }
  }
  return undefined;
}

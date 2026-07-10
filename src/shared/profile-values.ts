import type { CandidateProfile } from "./types";
import type { CanonicalKey } from "./canonical-fields";
import { formatDateForInput } from "./normalize";
import { dialForCountry, dialFromPhone } from "./geo";

// Resolves a canonical key to a concrete value from the profile.
// Un-indexed work.* / education.* keys map to the most recent entry (v1).

export interface ResolvedValue {
  text: string;
  /** true when the value comes from the explicit-settings onboarding step */
  fromExplicitSetting: boolean;
  /** true for boolean-ish values destined for checkboxes */
  boolValue?: boolean;
  /** for multi-valued canonicals (skills) — each entry matched independently */
  values?: string[];
}

const DATE_KEYS = new Set<string>([
  "work.start",
  "work.end",
  "education.start",
  "education.end",
  "preferences.startDate",
]);

export function isDateKey(key: CanonicalKey): boolean {
  return DATE_KEYS.has(key);
}

export function resolveProfileValue(
  key: CanonicalKey,
  profile: CandidateProfile,
): ResolvedValue | null {
  const t = (text: string, fromExplicitSetting = false): ResolvedValue | null =>
    text.trim() ? { text: text.trim(), fromExplicitSetting } : null;

  const work = profile.work[0];
  const edu = profile.education[0];
  const ex = profile.explicit;

  switch (key) {
    case "basics.firstName":
      return t(profile.basics.firstName);
    case "basics.lastName":
      return t(profile.basics.lastName);
    case "basics.fullName":
      return t(`${profile.basics.firstName} ${profile.basics.lastName}`.trim());
    case "basics.email":
      return t(profile.basics.email);
    case "basics.phone":
      return t(profile.basics.phone);
    case "basics.phoneCountryCode": {
      // derive from the phone's +prefix, else from the country
      const dial =
        dialFromPhone(profile.basics.phone) ?? dialForCountry(profile.location.country);
      return dial ? t(`+${dial}`) : null;
    }
    case "basics.pronouns":
      return t(profile.basics.pronouns);

    case "location.street":
      return t(profile.location.street);
    case "location.city":
      return t(profile.location.city);
    case "location.region":
      return t(profile.location.region);
    case "location.country":
      return t(profile.location.country);
    case "location.postalCode":
      return t(profile.location.postalCode);
    case "location.full":
      return t(
        [profile.location.city, profile.location.region, profile.location.country]
          .filter(Boolean)
          .join(", "),
      );

    case "links.linkedin":
      return t(profile.links.linkedin);
    case "links.github":
      return t(profile.links.github);
    case "links.portfolio":
      return t(profile.links.portfolio);
    case "links.website":
      return t(profile.links.website || profile.links.portfolio);
    case "links.other":
      return null;

    case "work.company":
      return work ? t(work.company) : null;
    case "work.title":
      return work ? t(work.title) : null;
    case "work.start":
      return work ? t(work.start) : null;
    case "work.end":
      return work ? t(work.current ? "" : work.end) : null;
    case "work.current":
      return work ? { text: work.current ? "Yes" : "No", fromExplicitSetting: false, boolValue: work.current } : null;
    case "work.description":
      return work ? t(work.description) : null;

    case "education.school":
      return edu ? t(edu.school) : null;
    case "education.degree":
      return edu ? t(edu.degree) : null;
    case "education.field":
      return edu ? t(edu.field) : null;
    case "education.start":
      return edu ? t(edu.start) : null;
    case "education.end":
      return edu ? t(edu.end) : null;
    case "education.gpa":
      return edu ? t(edu.gpa) : null;

    case "preferences.workAuth":
      return ex.workAuth === null ? null : t(ex.workAuth, true);
    case "preferences.requiresSponsorship":
      return ex.requiresSponsorship === null ? null : t(ex.requiresSponsorship, true);
    case "preferences.salary":
      return ex.salary === null ? null : t(ex.salary, true);
    case "preferences.salaryMin":
      return ex.salaryMin === null ? null : t(ex.salaryMin, true);
    case "preferences.salaryMax":
      return ex.salaryMax === null ? null : t(ex.salaryMax, true);
    case "skills.list":
      return profile.skills.length > 0
        ? {
            text: profile.skills.join(", "),
            fromExplicitSetting: false,
            values: profile.skills,
          }
        : null;
    case "preferences.startDate":
      return ex.startDate === null ? null : t(ex.startDate, true);
    case "preferences.relocation":
      return ex.relocation === null ? null : t(ex.relocation, true);
    case "preferences.remote":
      return ex.remote === null ? null : t(ex.remote, true);
    case "preferences.noticePeriod":
      return ex.noticePeriod === null ? null : t(ex.noticePeriod, true);
    case "preferences.howHeard":
      return null; // saved answers only

    case "eeo.gender":
      return ex.gender === null ? null : t(ex.gender, true);
    case "eeo.race":
      return ex.race === null ? null : t(ex.race, true);
    case "eeo.hispanic":
      return ex.hispanic === null ? null : t(ex.hispanic, true);
    case "eeo.veteran":
      return ex.veteran === null ? null : t(ex.veteran, true);
    case "eeo.disability":
      return ex.disability === null ? null : t(ex.disability, true);

    // attachments are resolved against stored documents by the mapper
    case "attachments.resume":
    case "attachments.coverLetter":
      return null;

    default:
      return null;
  }
}

/** Format a resolved date value for a specific input. */
export function formatForField(
  key: CanonicalKey,
  text: string,
  fieldKind: string,
  placeholder: string | undefined,
  dateFormatHint: string,
): string {
  if (!isDateKey(key)) return text;
  if (fieldKind === "date") return formatDateForInput(text, "YYYY-MM-DD");
  const hint =
    placeholder && /[MDY]{2}/i.test(placeholder) ? placeholder : dateFormatHint;
  return formatDateForInput(text, hint);
}

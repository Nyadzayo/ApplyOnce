import type { CanonicalKey } from "./canonical-fields";

// autocomplete token → canonical key (PLAN.md §3.2 tier 2).
// Highest-precision signal on the web; near-zero false positives.
const MAP: Record<string, CanonicalKey> = {
  "given-name": "basics.firstName",
  "additional-name": "basics.fullName", // middle names: review, never silent
  "family-name": "basics.lastName",
  name: "basics.fullName",
  email: "basics.email",
  tel: "basics.phone",
  "tel-national": "basics.phone",
  "tel-country-code": "basics.phoneCountryCode",
  url: "links.website",
  "address-level1": "location.region",
  "address-level2": "location.city",
  "postal-code": "location.postalCode",
  country: "location.country",
  "country-name": "location.country",
  "street-address": "location.street",
  "address-line1": "location.street",
  organization: "work.company",
  "organization-title": "work.title",
};

export function autocompleteToCanonical(
  token: string | undefined,
): CanonicalKey | undefined {
  if (!token) return undefined;
  // tokens may be space-separated with section prefixes: "section-x shipping tel"
  for (const part of token.toLowerCase().trim().split(/\s+/).reverse()) {
    const hit = MAP[part];
    if (hit) return hit;
  }
  return undefined;
}

// Country / state / dial-code knowledge for option resolution. Job-form
// country dropdowns come in every flavor: "South Africa", "South Africa (ZA)",
// value="ZA", "ZAF", "+27". This table lets the option resolver treat them all
// as the same thing. Deterministic data, no network.

type CountryRow = [iso2: string, dial: string, name: string, ...aliases: string[]];

const COUNTRIES: CountryRow[] = [
  ["US", "1", "United States", "United States of America", "USA", "U.S.", "U.S.A.", "America", "USA United States"],
  ["GB", "44", "United Kingdom", "UK", "Great Britain", "England", "Britain", "United Kingdom of Great Britain and Northern Ireland"],
  ["CA", "1", "Canada"],
  ["AU", "61", "Australia"],
  ["NZ", "64", "New Zealand"],
  ["IE", "353", "Ireland", "Republic of Ireland"],
  ["ZA", "27", "South Africa", "RSA"],
  ["ZW", "263", "Zimbabwe"],
  ["NG", "234", "Nigeria"],
  ["KE", "254", "Kenya"],
  ["GH", "233", "Ghana"],
  ["EG", "20", "Egypt"],
  ["MA", "212", "Morocco"],
  ["ET", "251", "Ethiopia"],
  ["TZ", "255", "Tanzania"],
  ["UG", "256", "Uganda"],
  ["ZM", "260", "Zambia"],
  ["BW", "267", "Botswana"],
  ["NA", "264", "Namibia"],
  ["MZ", "258", "Mozambique"],
  ["MW", "265", "Malawi"],
  ["RW", "250", "Rwanda"],
  ["SN", "221", "Senegal"],
  ["CI", "225", "Ivory Coast", "Cote d'Ivoire", "Côte d'Ivoire"],
  ["CM", "237", "Cameroon"],
  ["DE", "49", "Germany", "Deutschland"],
  ["FR", "33", "France"],
  ["ES", "34", "Spain", "España"],
  ["PT", "351", "Portugal"],
  ["IT", "39", "Italy", "Italia"],
  ["NL", "31", "Netherlands", "The Netherlands", "Holland"],
  ["BE", "32", "Belgium"],
  ["CH", "41", "Switzerland"],
  ["AT", "43", "Austria"],
  ["SE", "46", "Sweden"],
  ["NO", "47", "Norway"],
  ["DK", "45", "Denmark"],
  ["FI", "358", "Finland"],
  ["IS", "354", "Iceland"],
  ["PL", "48", "Poland"],
  ["CZ", "420", "Czech Republic", "Czechia"],
  ["SK", "421", "Slovakia"],
  ["HU", "36", "Hungary"],
  ["RO", "40", "Romania"],
  ["BG", "359", "Bulgaria"],
  ["GR", "30", "Greece"],
  ["HR", "385", "Croatia"],
  ["SI", "386", "Slovenia"],
  ["RS", "381", "Serbia"],
  ["UA", "380", "Ukraine"],
  ["EE", "372", "Estonia"],
  ["LV", "371", "Latvia"],
  ["LT", "370", "Lithuania"],
  ["TR", "90", "Turkey", "Türkiye", "Turkiye"],
  ["IL", "972", "Israel"],
  ["AE", "971", "United Arab Emirates", "UAE", "Dubai"],
  ["SA", "966", "Saudi Arabia", "KSA"],
  ["QA", "974", "Qatar"],
  ["KW", "965", "Kuwait"],
  ["BH", "973", "Bahrain"],
  ["OM", "968", "Oman"],
  ["JO", "962", "Jordan"],
  ["LB", "961", "Lebanon"],
  ["IN", "91", "India", "Bharat"],
  ["PK", "92", "Pakistan"],
  ["BD", "880", "Bangladesh"],
  ["LK", "94", "Sri Lanka"],
  ["NP", "977", "Nepal"],
  ["CN", "86", "China", "People's Republic of China", "PRC", "Mainland China"],
  ["HK", "852", "Hong Kong", "Hong Kong SAR"],
  ["TW", "886", "Taiwan", "Chinese Taipei"],
  ["JP", "81", "Japan"],
  ["KR", "82", "South Korea", "Korea, South", "Republic of Korea", "Korea Republic of", "Korea"],
  ["SG", "65", "Singapore"],
  ["MY", "60", "Malaysia"],
  ["TH", "66", "Thailand"],
  ["VN", "84", "Vietnam", "Viet Nam"],
  ["PH", "63", "Philippines", "The Philippines"],
  ["ID", "62", "Indonesia"],
  ["MX", "52", "Mexico", "México"],
  ["BR", "55", "Brazil", "Brasil"],
  ["AR", "54", "Argentina"],
  ["CL", "56", "Chile"],
  ["CO", "57", "Colombia"],
  ["PE", "51", "Peru", "Perú"],
  ["UY", "598", "Uruguay"],
  ["EC", "593", "Ecuador"],
  ["CR", "506", "Costa Rica"],
  ["PA", "507", "Panama"],
  ["DO", "1", "Dominican Republic"],
  ["JM", "1", "Jamaica"],
  ["TT", "1", "Trinidad and Tobago"],
  ["RU", "7", "Russia", "Russian Federation"],
  ["KZ", "7", "Kazakhstan"],
  ["GE", "995", "Georgia"],
  ["AM", "374", "Armenia"],
  ["AZ", "994", "Azerbaijan"],
];

// name/abbr pairs; keys are normalized in the index below
type StateRow = [abbr: string, name: string];

const US_STATES: StateRow[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "District of Columbia"],
];

const CA_PROVINCES: StateRow[] = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"],
  ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"],
  ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"],
  ["SK", "Saskatchewan"], ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["YT", "Yukon"],
];

const ZA_PROVINCES: StateRow[] = [
  ["EC", "Eastern Cape"], ["FS", "Free State"], ["GP", "Gauteng"],
  ["KZN", "KwaZulu-Natal"], ["LP", "Limpopo"], ["MP", "Mpumalanga"],
  ["NC", "Northern Cape"], ["NW", "North West"], ["WC", "Western Cape"],
];

// ---------------------------------------------------------------------------

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const countryIndex = new Map<string, string>(); // normalized alias → iso2
const dialByIso2 = new Map<string, string>();
for (const [iso2, dial, ...names] of COUNTRIES) {
  dialByIso2.set(iso2, dial);
  countryIndex.set(norm(iso2), iso2);
  for (const n of names) countryIndex.set(norm(n), iso2);
}

const stateIndex = new Map<string, string>(); // normalized → "US:CA" style key
for (const [prefix, rows] of [
  ["US", US_STATES],
  ["CA", CA_PROVINCES],
  ["ZA", ZA_PROVINCES],
] as const) {
  for (const [abbr, name] of rows) {
    const key = `${prefix}:${abbr}`;
    // 2-letter abbreviations collide across regions and with ISO country
    // codes ("CA" = California / Canada) — first writer wins; the country
    // index takes precedence for country fields anyway
    if (!stateIndex.has(norm(abbr))) stateIndex.set(norm(abbr), key);
    if (!stateIndex.has(norm(name))) stateIndex.set(norm(name), key);
  }
}

/** ISO2 for any recognizable country spelling ("USA", "za", "Deutschland"). */
export function countryKeyOf(s: string): string | undefined {
  return countryIndex.get(norm(s));
}

/** Region key for state/province spellings ("CA" / "California" → "US:CA"). */
export function stateKeyOf(s: string): string | undefined {
  return stateIndex.get(norm(s));
}

/** Dial code for a country spelling ("South Africa" → "27"). */
export function dialForCountry(country: string): string | undefined {
  const iso2 = countryKeyOf(country);
  return iso2 ? dialByIso2.get(iso2) : undefined;
}

const DIALS_DESC = [...new Set(COUNTRIES.map((c) => c[1]))].sort(
  (a, b) => b.length - a.length,
);

/** Dial code from an international phone number ("+27 76 189 1101" → "27"). */
export function dialFromPhone(phone: string): string | undefined {
  const m = /^\s*(?:\+|00)(\d{1,4})/.exec(phone.replace(/[\s().-]/g, ""));
  if (!m) return undefined;
  const digits = m[1]!;
  return DIALS_DESC.find((d) => digits.startsWith(d));
}

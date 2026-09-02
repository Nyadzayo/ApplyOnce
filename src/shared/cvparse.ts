import type { EducationEntry, ProfilePatch, WorkEntry } from "./types";
import { emptyProfile } from "./types";
import { linesFromText, type DocLine } from "./doclines";
import { countryKeyOf, stateKeyOf } from "./geo";

// CV lines → CandidateProfile patch (PLAN.md Phase 6, Part 9 §5b). Pure
// heuristics over the DocLine model: contact regex block, section
// segmentation by heading lexicon + typography, entries anchored on date
// ranges with cell-based role assignment (date / location / title /
// company) backed by gazetteers and a document-level consistency vote.
// Every extracted value carries an evidence snippet and a confidence so the
// review UI can show where it came from and what to double-check.

type Confidence = "high" | "medium" | "low";
const CONF_RANK: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
const minConf = (...c: Confidence[]) => c.reduce((a, b) => (CONF_RANK[b] < CONF_RANK[a] ? b : a));

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,5}[\s.-]?\d{3,5}[\s.-]?\d{3,5}/;
// bare linkedin.com/github.com paths count too — PDFs often omit the protocol
const URL_RE = /(?:https?:\/\/|www\.)[^\s|,;)]+|(?:linkedin\.com|github\.com)\/[^\s|,;)]+/gi;
const CONTACT_LABEL_RE =
  /\b(email|e-mail|mobile|phone|tel|cell|linkedin|github|website|portfolio|address)\b\s*:?/gi;

// Keyword sets, matched against decoration-stripped headings ("=== WORK
// EXPERIENCE ===" → "work experience"). Includes common DE/FR/ES headings.
const SECTION_KEYWORDS: { section: string; words: string[] }[] = [
  { section: "experience", words: [
    "experience", "employment", "work history", "career history",
    "berufserfahrung", "experiencia", "expérience", "erfahrung"] },
  { section: "education", words: [
    "education", "academic", "qualifications", "studies",
    "ausbildung", "bildung", "studium", "formation", "educación", "educacion"] },
  { section: "skills", words: [
    "skills", "competencies", "kenntnisse", "compétences", "habilidades", "tools & technologies", "tools and technologies"] },
  { section: "summary", words: ["summary", "objective"] },
  { section: "projects", words: ["projects", "projekte"] },
  { section: "other", words: [
    "certifications", "awards", "publications", "languages", "interests",
    "references", "sprachen", "zertifikate"] },
];
// weak words: a heading only when they are the whole heading ("Profile",
// not "Company Profile Inc"; "Contact", not "Contact Energy")
const STRICT_HEADINGS: Record<string, string> = {
  profile: "summary", about: "summary", "about me": "summary", profil: "summary",
  contact: "other", kontakt: "other", "contact details": "other", "contact information": "other",
  technologies: "skills", "technical": "skills",
};

/** Decoration/case-tolerant heading detection (PLAN.md Part 9 §5b). */
export function headingSectionOf(line: string): string | undefined {
  const stripped = line
    .replace(/(?<=[A-Za-z])[01](?=[A-Za-z])/g, (d) => (d === "0" ? "O" : "I")) // OCR: EXPER1ENCE
    .replace(/[^A-Za-zÀ-ž&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped || stripped.length >= 60) return undefined;
  if (stripped.split(" ").length > 4) return undefined;
  const lower = ` ${stripped.toLowerCase()} `;
  const strict = STRICT_HEADINGS[lower.trim()];
  if (strict) return strict;
  for (const { section, words } of SECTION_KEYWORDS) {
    if (words.some((w) => lower.includes(` ${w} `) || lower.trim() === w)) return section;
  }
  return undefined;
}

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|mär(?:z)?|mai|okt(?:ober)?|dez(?:ember)?|janv(?:ier)?|févr(?:ier)?|avr(?:il)?|juin|juil(?:let)?|août|déc(?:embre)?|ene(?:ro)?|abr(?:il)?|ago(?:sto)?|dic(?:iembre)?";
const DATE_PART = `(?:(?:${MONTHS})[a-z]*\\.?\\s+)?(?:19|20)\\d{2}(?:-(?:0[1-9]|1[0-2]))?|(?:0?[1-9]|1[0-2])\\s*\\/\\s*(?:19|20)\\d{2}`;
const PRESENT_WORDS = "present|current|now|ongoing|today|heute|aktuell|présent|actualidad|actual|date";
// the separator is optional: OCR drops or mangles the dash ("Mar 2021 Present")
const DATE_RANGE_RE = new RegExp(
  `(${DATE_PART})\\s*(?:[–—\\-~=_]|to|until|bis|a|à)?\\s*((?:${DATE_PART})|${PRESENT_WORDS})\\b`,
  "i",
);
// "Since 2021" / "Seit 04/2020" style single-anchor ranges
const SINCE_RE = new RegExp(`\\b(?:since|seit|desde|depuis)\\s+(${DATE_PART})`, "i");
const PRESENT_RE = new RegExp(`^(?:${PRESENT_WORDS})$`, "i");

export function normalizeCvText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/-\n(?=[a-z])/g, "") // de-hyphenate across line breaks
    .replace(/[•●▪◦·∙][ \t]*/g, "- ") // never consume the newline — a lone
    // bullet marker on its own line must not merge with the next line
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface Section {
  name: string;
  lines: DocLine[];
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function bodySize(lines: DocLine[]): number {
  const long = lines.filter((l) => wordCount(l.text) >= 5).map((l) => l.size);
  const pool = (long.length > 0 ? long : lines.map((l) => l.size)).sort((a, b) => a - b);
  return pool[Math.floor(pool.length / 2)] ?? 10;
}

const NOT_A_NAME_RE = /^(curriculum vitae|resume|résumé|cv|lebenslauf|currículum)$/i;

export function segmentLines(lines: DocLine[]): Section[] {
  const body = bodySize(lines);
  // plain-text sources carry no typography; there, word count is all we have
  const uniform = lines.every((l) => l.size === lines[0]!.size && !l.bold);
  const sections: Section[] = [{ name: "header", lines: [] }];
  for (const line of lines) {
    // "Digital skills<cell>Python, SQL": the heading is the first cell
    const headCell = line.cells.length > 1 ? headingSectionOf(line.cells[0]!) : undefined;
    const typo = line.bold || line.caps || line.italic || line.size > body * 1.05;
    const headingShaped =
      (line.cells.length === 1 || headCell !== undefined) &&
      !DATE_RANGE_RE.test(line.text) &&
      !EMAIL_RE.test(line.text) &&
      (uniform || typo || wordCount(line.cells[0]!) <= 2);
    const known = headingShaped ? headCell ?? headingSectionOf(line.text) : undefined;
    const letters = line.text.replace(/[^\p{L}]/gu, "").length;
    const typographic =
      sections.length > 1 && // never before the first known heading (the name lives there)
      line.cells.length === 1 &&
      wordCount(line.text) <= 3 &&
      line.size >= body * 1.2 &&
      letters >= 4 &&
      !/\d|@/.test(line.text) &&
      !line.text.startsWith("- ");
    if (known) {
      sections.push({ name: known, lines: [] });
      if (headCell) {
        const rest = line.cells.slice(1);
        sections[sections.length - 1]!.lines.push({ ...line, cells: rest, text: rest.join("\t") });
      }
    } else if (typographic) {
      sections.push({ name: "other", lines: [] });
    } else {
      sections[sections.length - 1]!.lines.push(line);
    }
  }
  return sections;
}

/** Text convenience used by tests: sections of plain lines. */
export function segmentSections(text: string): { name: string; lines: string[] }[] {
  return segmentLines(linesFromText(text)).map((s) => ({ name: s.name, lines: s.lines.map((l) => l.text) }));
}

function toIsoMonth(datePart: string): string {
  const m = new RegExp(`^(${MONTHS})[a-z]*\\.?\\s+((?:19|20)\\d{2})$`, "i").exec(datePart.trim());
  if (m) {
    const key = m[1]!.slice(0, 3).toLowerCase();
    const idx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key);
    const alt: Record<string, number> = { mär: 3, mai: 5, okt: 10, dez: 12, fév: 2, avr: 4, jui: 6, aoû: 8, déc: 12, ene: 1, abr: 4, ago: 8, dic: 12 };
    const monthIdx = idx >= 0 ? idx + 1 : alt[key] ?? 0;
    if (key === "jui" && /^juil/i.test(m[1]!)) return `${m[2]}-07`;
    if (monthIdx > 0) return `${m[2]}-${String(monthIdx).padStart(2, "0")}`;
  }
  const slash = /^(0?[1-9]|1[0-2])\s*\/\s*((?:19|20)\d{2})$/.exec(datePart.trim());
  if (slash) return `${slash[2]}-${slash[1]!.padStart(2, "0")}`;
  const iso = /^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/.exec(datePart.trim());
  if (iso) return `${iso[1]}-${iso[2]}`;
  const year = /^((?:19|20)\d{2})$/.exec(datePart.trim());
  if (year) return `${year[1]}-01`;
  return datePart.trim();
}

// ---------------------------------------------------------------------------
// Gazetteers: role nouns (titles), organisation markers (companies), places
// ---------------------------------------------------------------------------

// substring matches catch inflections ("Produktmanagerin", "Entwicklerin")
const TITLE_STEM_RE =
  /manager|engineer|developer|entwickl|programmer|berater|leiter|ingenieur|ingenier|analyst|analista|designer|consultant|recruit|assistant|associate|specialist|coordinator|director|intern|praktikant|werkstudent|trainee|tutor|teacher|lecturer|professor|scientist|researcher|architect|administrator|technician|supervisor|sommelier|barista|nurse|writer|editor|founder|president|contributor|volunteer|apprentice|cashier|bartender|receptionist|secretary|accountant|auditor|controller|attorney|lawyer|paralegal|pharmacist|physician|therapist|counselor|counsellor|driver|operator|mechanic|electrician|plumber|carpenter|welder|representative|salesperson|marketer|strategist|planner|producer|photographer|illustrator|animator|journalist|translator|interpreter|librarian|curator|inspector|surveyor|dispatcher|tester|devops|gerente|desarrollador|consultor|becari|responsable|chargé|développeu|stagiaire|officer|executive|owner|partner|principal|fellow|clerk|server|steward|mitarbeiter|praktikum|student/i;
const TITLE_WORD_RE =
  /\b(lead|head|chief|chef|vp|ceo|cto|cfo|coo|cmo|cpo|sre|qa|agent|buyer|pilot|guard|host|hostess|waiter|waitress|scrum master|product owner|founder|co-founder|cofounder|freelance|freelancer|self-employed|consultant|advisor|adviser)\b/i;
export const TITLE_WORDS = new RegExp(`${TITLE_STEM_RE.source}|${TITLE_WORD_RE.source}`, "i");

const COMPANY_SUFFIX_RE =
  /^(inc\.?|llc|llp|ltd\.?|limited|plc|gmbh|ag|se|sa|s\.a\.|sl|s\.l\.|srl|bv|b\.v\.|nv|n\.v\.|oy|ab|as|kg|pty|pty ltd|co\.?|corp\.?|corporation|company|& co\.?|and co\.?|pvt\.? ltd\.?|pte\.? ltd\.?|lp|l\.p\.|pc|p\.c\.|s\.p\.a\.|spa|ltda\.?)$/i;
const COMPANY_MARKER_RE =
  /\b(inc|llc|llp|ltd|limited|plc|gmbh|srl|pty|corp|corporation|company|group|holdings|partners|technologies|technology|labs|systems|solutions|software|studio|studios|agency|consulting|consultancy|bank|capital|ventures|foundation|institute|university|college|school|hospital|clinic|restaurant|hotel|media|network|networks|international|global|industries|enterprises|services|associates|brothers|stores|retail|airlines|airways|motors|pharma|pharmaceuticals|energy|logistics|insurance|trust|council|ministry|department|authority|commission|bureau|centre|center|gesellschaft|verlag|werke|programme|organization|organisation|association|federation|fund|trading|telecom|telecommunications|entertainment|games|gaming|healthcare|health|dental|medical|clinic|finance|financial|fintech|payments|automotive|manufacturing|construction|properties|realty|hospitality|foods|beverages|breweries|brewery|distillery|farms|cooperative|universität|hochschule|krankenhaus|stiftung)\b|&|\.(com|io|ai|co|org|net)\b/i;

const COMPANY_WORDS_RE =
  /\b(engineering|consulting|consultancy|management|developments?|services|solutions|technologies|associates|partners|studios?|students?|research|design|designs)\b/gi;

export function looksLikeTitle(s: string): boolean {
  const t = s.replace(COMPANY_WORDS_RE, " ");
  return TITLE_WORDS.test(t) && !COMPANY_SUFFIX_RE.test(s.trim());
}
export function looksLikeCompany(s: string): boolean {
  return COMPANY_MARKER_RE.test(s);
}

const REMOTE_RE = /^(remote|hybrid|on-?site|onsite|work from home|wfh|remote \/ hybrid|hybrid \/ remote)$/i;
const CAP_WORDS_RE = /^[\p{Lu}][\p{L}'’.-]*(?:\s+(?:de|del|of|la|le|du|van|von|da|and|&|[\p{Lu}][\p{L}'’.-]*)){0,2}$/u;

function isPlaceWord(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (REMOTE_RE.test(t)) return true;
  if (countryKeyOf(t) || stateKeyOf(t)) return true;
  // "Cape Town, SA" / "Cambridge, MA": a 2–3 letter code after a comma is a
  // region far more often than a legal suffix ("Zalando SE" has no comma)
  return /^[A-Z]{2,3}$/.test(t) && !/^(vp|qa|it|hr|pr|ux|ui|ai|ml|ceo|cto|cfo|coo|cmo|llc|llp|inc|ltd|plc)$/i.test(t);
}

/** "Lagos, Nigeria" / "San Francisco, CA" / "Remote" / "Berlin (Germany)". */
export function isLocationText(s: string): boolean {
  const t = s.replace(/[()]/g, ",").replace(/\s+/g, " ").trim();
  if (!t || /\d{4}/.test(t)) return false;
  const pieces = t.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
  if (pieces.length === 0 || pieces.length > 4) return false;
  if (pieces.length === 1) return isPlaceWord(pieces[0]!);
  const last = pieces[pieces.length - 1]!;
  if (!isPlaceWord(last)) return false;
  const rest = pieces.slice(0, -1);
  // "City, Country" / "City, ST, USA" — never "Company, City, ST"
  if (rest.length > 1 && !rest.slice(1).every((p) => isPlaceWord(p))) return false;
  return rest.every((p) => CAP_WORDS_RE.test(p) && wordCount(p) <= 3 && !looksLikeTitle(p) && !looksLikeCompany(p));
}

/** Split "Company, City, Country" into its non-place head and the place tail. */
function peelLocation(pieces: string[]): { head: string[]; place: string } {
  const head = [...pieces];
  const tail: string[] = [];
  let sawPlace = false;
  while (head.length > 1) {
    const last = head[head.length - 1]!;
    if (isPlaceWord(last)) {
      tail.unshift(head.pop()!);
      sawPlace = true;
    } else if (sawPlace && CAP_WORDS_RE.test(last) && !looksLikeTitle(last) && !looksLikeCompany(last)) {
      tail.unshift(head.pop()!); // the city before a country/state code
      sawPlace = false;
    } else if (sawPlace && tail.length === 1 && /^[A-Z]{2}$/.test(tail[0]!) && wordCount(last) >= 3) {
      // "Beacon Health System Mishawaka, IN": the last word is the city
      const words = last.split(" ");
      const city = words[words.length - 1]!;
      if (/^[\p{Lu}][\p{L}'’.-]+$/u.test(city) && !looksLikeCompany(city) && !looksLikeTitle(city)) {
        head[head.length - 1] = words.slice(0, -1).join(" ");
        tail.unshift(city);
      }
      break;
    } else break;
  }
  return { head, place: tail.join(", ") };
}

/** "Deloitte, LLP" was split on its comma; put suffix pieces back. */
function mergeSuffixes(pieces: string[]): string[] {
  const out: string[] = [];
  for (const p of pieces) {
    if (out.length > 0 && COMPANY_SUFFIX_RE.test(p)) out[out.length - 1] += `, ${p}`;
    else out.push(p);
  }
  return out;
}

/** Strip trailing location debris: ", SA", ", Remote", "Remote", 2–3 letter codes. */
export function cleanCompany(raw: string): string {
  const prepared = raw
    .replace(/\s*\(([^)]*\d[^)]*)\)?/g, "") // "(Note 1,7)", "(2015 - 2019)"
    .replace(/\s*\(([^)]*)\)/g, ", $1") // "Chennai (India)" → "Chennai, India"
    .replace(/,?\s*(?:19|20)\d{2}(?:\s*[–—-]\s*(?:(?:19|20)\d{2}|present))?\s*$/i, "");
  const pieces = prepared.split(",").map((s) => s.trim()).filter(Boolean);
  const { head } = peelLocation(pieces);
  return head
    .join(", ")
    .replace(/\s+(Remote|Hybrid|On-?site)$/i, "")
    .replace(/\s*\((remote|hybrid|on-?site)\)$/i, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Work entries
// ---------------------------------------------------------------------------

interface DateHit {
  start: string;
  end: string;
  current: boolean;
  cell: number;
  before: string;
  after: string;
}

function findDate(line: DocLine): DateHit | undefined {
  for (let c = 0; c < line.cells.length; c++) {
    const cell = line.cells[c]!;
    const m = DATE_RANGE_RE.exec(cell);
    const s = m ? null : SINCE_RE.exec(cell);
    const hit = m ?? s;
    if (!hit) continue;
    const current = m ? PRESENT_RE.test(m[2]!.trim()) : true;
    return {
      start: toIsoMonth(hit[1]!),
      end: m && !current ? toIsoMonth(m[2]!) : "",
      current,
      cell: c,
      before: cell.slice(0, hit.index).trim().replace(/[|,–—-]\s*$/, "").trim(),
      after: cell
        .slice(hit.index + hit[0].length)
        .replace(/^\s*\([^)]*\)/, "") // "(3 years 6 months)"
        .replace(/^[\s|,·•–—-]+/, "")
        .trim(),
    };
  }
  return undefined;
}

function isBullet(l: DocLine): boolean {
  return l.text.startsWith("- ");
}

/** Short, name-like line that can carry a title/company/location. */
function isHeaderish(l: DocLine): boolean {
  const t = l.text;
  // "Waste Management — Corning, CA." (OCR adds a period) is a header line,
  // "Managed inventory for 3 depots." is not: a separator or a place tail tells
  const body = t.replace(/\.$/, "");
  const headerTail = wordCount(body) <= 8 && (/\s[–—-]\s/.test(body) || isLocationText(body.split(/\s[–—-]\s|,\s(?=[^,]*$)/).pop() ?? ""));
  return (
    !isBullet(t.length ? l : l) &&
    !/^[a-z0-9(]/.test(t) && // wrapped continuation of a bullet
    (!/[.:;]$/.test(t) || (/\.$/.test(t) && headerTail)) && // full sentences are bullet text, not names
    wordCount(t) <= 12 &&
    /\p{L}/u.test(t) &&
    !EMAIL_RE.test(t) &&
    headingSectionOf(t) === undefined
  );
}

interface Part {
  text: string;
  bold: boolean;
  order: number;
}

interface Roles {
  title: string;
  company: string;
  location: string;
  titleConf: Confidence;
  companyConf: Confidence;
  /** two unresolved parts, kept for the document vote */
  pending?: [Part, Part];
}

interface Votes {
  titleFirst: number;
  companyFirst: number;
}

function assignRoles(parts: Part[], votes: Votes): Roles {
  const places: string[] = [];
  const titles: Part[] = [];
  const companies: Part[] = [];
  const unresolved: Part[] = [];
  for (const part of parts) {
    let text = part.text
      .replace(/\s+/g, " ")
      .replace(/^[^\p{L}\p{N}(]+|[^\p{L}\p{N}).]+$/gu, "") // OCR glyphs: "_Assistant", "TX +"
      .trim();
    if (!/\p{L}/u.test(text)) continue;
    const trailing = /\s+(remote|hybrid|on-?site|onsite)$/i.exec(text);
    if (trailing && wordCount(text) > 1) {
      places.push(trailing[1]!);
      text = text.slice(0, trailing.index).trim();
    }
    const paren = /\(([^)]*)\)\s*$/.exec(text);
    if (paren && isLocationText(paren[1]!)) {
      places.push(paren[1]!.trim());
      text = text.slice(0, paren.index).trim().replace(/[,|–—-]\s*$/, "");
    }
    if (isLocationText(text)) {
      places.push(text);
      continue;
    }
    const protectedText = text.replace(/\(([^)]*)\)/g, (m) => m.replace(/,/g, "\u0000"));
    const pieces = protectedText.split(/,\s*/).map((p) => p.replace(/\u0000/g, ",").trim()).filter(Boolean);
    const { head, place } = peelLocation(mergeSuffixes(pieces));
    if (place) places.push(place);
    if (head.length === 1) {
      unresolved.push({ ...part, text: head[0]! });
      continue;
    }
    // "Senior Engineer, Acme Corp" / "Acme Corp, Senior Engineer" / "Title, Company, City"
    const t = head.findIndex((p) => looksLikeTitle(p));
    if (t >= 0) {
      titles.push({ ...part, text: head[t]!, order: part.order + t / 10 });
      const rest = head.filter((_, i) => i !== t);
      const c = rest.findIndex((p) => looksLikeCompany(p));
      const company = c >= 0 ? rest[c]! : rest[0]!;
      companies.push({ ...part, text: company, order: part.order + head.indexOf(company) / 10 });
      for (const leftover of rest.filter((p) => p !== company)) if (CAP_WORDS_RE.test(leftover)) places.push(leftover);
    } else {
      head.forEach((p, i) => unresolved.push({ ...part, text: p, order: part.order + i / 10 }));
    }
  }
  const roles: Roles = { title: "", company: "", location: places[0] ?? "", titleConf: "low", companyConf: "low" };
  if (titles.length > 0 && companies.length > 0) {
    roles.title = titles[0]!.text;
    roles.company = companies[0]!.text;
    roles.titleConf = "high";
    roles.companyConf = looksLikeCompany(roles.company) ? "high" : "medium";
    return roles;
  }
  const titleLike = unresolved.filter((p) => looksLikeTitle(p.text));
  const companyLike = unresolved.filter((p) => !looksLikeTitle(p.text) && looksLikeCompany(p.text));
  const others = (skip: Part[]) => unresolved.filter((p) => !skip.includes(p));
  if (titleLike.length >= 1) {
    const title = titleLike[0]!;
    const rest = others([title]);
    const company = companyLike.find((c) => c !== title) ?? rest[0];
    roles.title = title.text;
    roles.titleConf = "high";
    if (company) {
      roles.company = company.text;
      roles.companyConf = looksLikeCompany(company.text) ? "high" : titleLike.length === 1 ? "high" : "medium";
    }
    return roles;
  }
  if (companyLike.length === 1) {
    const company = companyLike[0]!;
    const rest = others([company]);
    roles.company = company.text;
    roles.companyConf = "high";
    if (rest[0]) {
      roles.title = rest[0].text;
      roles.titleConf = rest.length === 1 ? "medium" : "low";
    }
    return roles;
  }
  if (unresolved.length >= 2) {
    const [a, b] = [unresolved[0]!, unresolved[1]!];
    if (votes.titleFirst !== votes.companyFirst) {
      const titleFirst = votes.titleFirst > votes.companyFirst;
      roles.title = titleFirst ? a.text : b.text;
      roles.company = titleFirst ? b.text : a.text;
      roles.titleConf = roles.companyConf = "medium";
    } else {
      roles.title = a.text;
      roles.company = b.text;
      roles.pending = [a, b];
    }
    return roles;
  }
  if (unresolved.length === 1) {
    roles.company = unresolved[0]!.text;
    roles.companyConf = "low";
  }
  return roles;
}

interface WorkResult {
  entries: WorkEntry[];
  evidence: Record<string, { snippet: string; confidence: Confidence }>;
}

/** Narrow date columns wrap a range over two lines ("2012-08 -" / "2017-09"):
 *  pull the end date up into the first line's cell. */
function joinWrappedRanges(lines: DocLine[]): DocLine[] {
  const open = new RegExp(`^(${DATE_PART})\\s*[–—-]\\s*$`, "i");
  const start = new RegExp(`^((?:${DATE_PART})|${PRESENT_WORDS})\\b`, "i");
  const out = lines.map((l) => ({ ...l, cells: [...l.cells] }));
  for (let i = 0; i + 1 < out.length; i++) {
    const a = out[i]!, b = out[i + 1]!;
    const ci = a.cells.findIndex((c) => open.test(c));
    if (ci < 0 || !b.cells[0] || !start.test(b.cells[0])) continue;
    const m = start.exec(b.cells[0])!;
    a.cells[ci] = `${a.cells[ci]!.replace(/\s*[–—-]\s*$/, "")} - ${m[1]}`;
    b.cells[0] = b.cells[0].slice(m[0].length).replace(/^[\s|,–—-]+/, "");
    if (!b.cells[0]) b.cells.shift();
    a.text = a.cells.join("\t");
    b.text = b.cells.join("\t");
  }
  return out.filter((l) => l.cells.length > 0);
}

function extractWork(input: DocLine[]): WorkResult {
  const lines = joinWrappedRanges(input);
  const entries: WorkEntry[] = [];
  const evidence: WorkResult["evidence"] = {};
  // a date line starts an entry; LaTeX/Word "itemize" resumes bullet the
  // title+date line itself ("• Software Engineer   Oct 2025 – Present")
  // a sentence that happens to contain a year range ("...member of the
  // association 2007 - 2008 ...") is prose, not an entry header
  const headerLength = (l: DocLine) => {
    const d = findDate(l);
    return d ? wordCount(l.cells.map((c, ci) => (ci === d.cell ? `${d.before} ${d.after}` : c)).join(" ")) : 0;
  };
  const dateIdx = lines
    .map((l, i) => (findDate(l) && (!isBullet(l) || wordCount(l.text) <= 12) && headerLength(l) <= 12 ? i : -1))
    .filter((i) => i >= 0);
  const consumed = new Set<number>();
  const votes: Votes = { titleFirst: 0, companyFirst: 0 };
  const pending: { entry: WorkEntry; roles: Roles; index: number }[] = [];

  for (let k = 0; k < dateIdx.length; k++) {
    const i = dateIdx[k]!;
    const line = lines[i]!;
    const hit = findDate(line)!;
    // rules and stray dashes ("—", "- | -") are layout, not content: step over them
    const blank = (l: DocLine) => !/[\p{L}\p{N}]/u.test(l.text);
    const above: number[] = [];
    for (let j = i - 1, seen = 0; j >= 0 && seen < 2; j--) {
      if (blank(lines[j]!)) continue;
      if (consumed.has(j) || !isHeaderish(lines[j]!) || findDate(lines[j]!)) break;
      above.unshift(j);
      seen++;
    }
    const below: number[] = [];
    for (let j = i + 1, seen = 0; j < lines.length && seen < 2; j++) {
      const l = lines[j]!;
      if (blank(l)) continue;
      const next = lines.slice(j + 1).find((n) => !blank(n));
      const nextStartsLower = /^[a-z]/.test(next?.text ?? "");
      const separated = /\s[–—-]\s|,\s|\t/.test(l.text); // "City Of Indianapolis And Marion County – Indianapolis, IN"
      if (dateIdx.includes(j) || !isHeaderish(l) || wordCount(l.text) > (separated ? 10 : 7) || nextStartsLower) break;
      below.push(j);
      seen++;
    }
    const headerIdx = [...above, i, ...below];
    headerIdx.forEach((j) => consumed.add(j));

    const parts: Part[] = [];
    let order = 0;
    for (const j of headerIdx) {
      const l = lines[j]!;
      const cells = j === i ? line.cells.flatMap((c, ci) => (ci === hit.cell ? [hit.before, hit.after] : [c])) : l.cells;
      for (const raw of cells) {
        const cell = raw.replace(/^-\s*/, "");
        for (const piece of cell.split(/\s+[|·•@]\s+|\s+[–—-]\s+(?!\d)|\s+at\s+(?=[A-Z\p{Lu}])/u)) {
          const text = piece.trim().replace(/^[-–—|]+\s*|\s*[-–—|]+$/g, "");
          if (text) parts.push({ text, bold: l.bold, order: order++ });
        }
      }
    }
    const roles = assignRoles(parts, votes);

    const bullets: string[] = [];
    let j = i + 1;
    const stop = dateIdx[k + 1] ?? lines.length;
    while (j < stop) {
      const l = lines[j]!;
      if (isBullet(l)) bullets.push(l.text.replace(/^-\s*/, ""));
      else if (bullets.length > 0 && /^[a-z0-9(]/.test(l.text)) bullets[bullets.length - 1] += ` ${l.text}`;
      else if (!headerIdx.includes(j) && (/[.!]$/.test(l.text) || wordCount(l.text) > 8)) {
        // PDF producers that draw list markers as paths leave bare sentences
        bullets.push(l.text);
      }
      j++;
      if (bullets.length >= 8) break;
    }
    const entry: WorkEntry = {
      company: roles.company,
      title: roles.title,
      start: hit.start,
      end: hit.end,
      current: hit.current,
      location: roles.location,
      description: bullets.join(" "),
    };
    entries.push(entry);
    const index = entries.length - 1;
    evidence[`work[${index}]`] = {
      snippet: headerIdx.map((h) => lines[h]!.cells.join(" ")).join(" | ").slice(0, 160),
      confidence: minConf(roles.titleConf, roles.companyConf),
    };
    if (roles.pending) pending.push({ entry, roles, index });
    else if (roles.titleConf === "high" && roles.companyConf === "high" && roles.title && roles.company) {
      const tOrder = parts.find((p) => roles.title.startsWith(p.text.split(",")[0]!.trim()))?.order ?? 0;
      const cOrder = parts.find((p) => roles.company.startsWith(p.text.split(",")[0]!.trim()))?.order ?? 0;
      if (tOrder < cOrder) votes.titleFirst++;
      else if (cOrder < tOrder) votes.companyFirst++;
    }
  }
  // document-level consistency vote: templates are uniform, so entries the
  // gazetteers could not decide follow the pattern of the ones they could
  for (const p of pending) {
    const [a, b] = p.roles.pending!;
    if (votes.titleFirst !== votes.companyFirst) {
      const titleFirst = votes.titleFirst > votes.companyFirst;
      p.entry.title = titleFirst ? a.text : b.text;
      p.entry.company = titleFirst ? b.text : a.text;
      evidence[`work[${p.index}]`]!.confidence = "medium";
    }
  }
  entries.forEach((e, idx) => {
    const conf = evidence[`work[${idx}]`]!.confidence;
    if (conf !== "high") {
      evidence[`work[${idx}].title`] = { snippet: e.title, confidence: conf };
      evidence[`work[${idx}].company`] = { snippet: e.company, confidence: conf };
    }
  });
  return { entries, evidence };
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

const DEGREE_RE =
  /\b(b\.?\s?(sc?|a|eng|s|com|ba|tech|fa|ed)|m\.?\s?(sc?|a|eng|s|ba|fa|ed|com)|ph\.?d|ll\.?[bm]|hnd|bachelor(?:'?s)?|master(?:'?s)?|doctorate|associate(?:'?s)? degree|diploma|certificate in|grado|licenciatura|máster|maestría|licence|abitur)\b/i;

const SCHOOL_RE =
  /university|college|institute|school|academy|polytechnic|universidad|université|universität|hochschule|escuela|instituto|politecnico|\bTU\b|\bETH\b|\bMIT\b|\bIIT\b|\bUCLA\b/i;

const DEGREE_OF_RE =
  /^\s*(?:of|in|en|de)\s+(?:science|sciences|arts|fine arts|commerce|engineering|business administration|business|technology|education|laws|philosophy|ciencias|artes|comercio)\b/i;
const DEGREE_ABBR_RE = /^\s*[-–—,:]?\s*(?:b\.?s\.?c?\.?|b\.?a\.?|m\.?s\.?c?\.?|m\.?a\.?|bfa|mfa|mba|phd|ll\.?[bm]|b\.?com|hons?\.?)\b\.?/i;

function fieldFromDegreeText(rest: string): string {
  let s = rest;
  s = s.replace(DEGREE_OF_RE, "");
  for (let n = 0; n < 3; n++) {
    s = s.replace(DEGREE_ABBR_RE, "");
    const again = new RegExp(`^\\s*[-–—,:]?\\s*(?:${DEGREE_RE.source})`, "i").exec(s);
    if (again) s = s.slice(again[0].length);
  }
  s = s.replace(/^[\s.,:\-–—]+/, "").replace(/^(?:in|of|en|de)\s+/i, "");
  s = s.split(/[;,(·|]|\s[-–—]\s|(?:19|20)\d{2}/)[0]!.trim();
  s = s.replace(/\s*\b(?:gpa|grade|note)\b.*$/i, "").trim();
  return s.length >= 2 && s.length <= 60 && !SCHOOL_RE.test(s) ? s : "";
}

interface EduResult {
  entries: EducationEntry[];
  evidence: Record<string, { snippet: string; confidence: Confidence }>;
}

function extractEducation(lines: DocLine[]): EduResult {
  const entries: EducationEntry[] = [];
  const evidence: EduResult["evidence"] = {};
  const text = lines.filter((l) => l.text && !/^[-•◦*]+$/.test(l.text));
  const usedSchools = new Set<string>();
  const years = (l: DocLine | undefined) => l?.text.match(/(?:19|20)\d{2}/g) ?? [];

  for (let i = 0; i < text.length; i++) {
    const line = text[i]!;
    // "• MSc Artificial Intelligence   2025 – Present" (itemized education)
    if (!DEGREE_RE.test(line.text) || (isBullet(line) && wordCount(line.text) > 12)) continue;
    const prev = text[i - 1];
    const next = text[i + 1];
    const degreeCellIdx = line.cells.findIndex((c) => DEGREE_RE.test(c));
    const degreeCell = (line.cells[degreeCellIdx] ?? line.text).replace(/^-\s*/, "");
    const otherCells = line.cells.filter((_, ci) => ci !== degreeCellIdx);
    const degreeMatch = DEGREE_RE.exec(degreeCell)!;
    let field = fieldFromDegreeText(degreeCell.slice(degreeMatch.index + degreeMatch[0].length));
    if (!field) field = /\b(?:in|of|en)\s+([A-Z][A-Za-z&\s]{2,40})/.exec(degreeCell)?.[1]?.trim() ?? "";

    // institution: same line's other cell, the degree cell itself, the line
    // above (usual), the line below; else a non-place comma piece of the
    // degree cell ("BFA Graphic Design, CalArts")
    let school = "";
    let conf: Confidence = "high";
    const schoolCell = otherCells.find((c) => SCHOOL_RE.test(c));
    if (schoolCell) school = schoolCell;
    else if (SCHOOL_RE.test(degreeCell)) {
      // "BSc Computer Science, University of London" → the piece holding the school
      const piece = degreeCell.split(/[,;|]|\s+at\s+|\s[–—]\s/).find((p) => SCHOOL_RE.test(p)) ?? degreeCell;
      school = piece.replace(DEGREE_RE, "").replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "").trim() || degreeCell;
    } else if (prev && !isBullet(prev) && SCHOOL_RE.test(prev.text) && !DEGREE_RE.test(prev.text)) school = prev.cells.find((c) => SCHOOL_RE.test(c)) ?? prev.text;
    else if (next && !isBullet(next) && SCHOOL_RE.test(next.text) && !DEGREE_RE.test(next.text)) school = next.cells.find((c) => SCHOOL_RE.test(c)) ?? next.text;
    else {
      const pieces = mergeSuffixes(degreeCell.split(/,\s*/).map((p) => p.trim()).filter(Boolean));
      const { head } = peelLocation(pieces);
      const cand = head.slice(1).find((p) => !DEGREE_RE.test(p) && p !== field && CAP_WORDS_RE.test(p));
      if (cand) {
        school = cand;
        conf = "medium";
      } else {
        // a short neighbouring line: "CalArts<cell>2015 – 2019" above, or
        // "CalArts, 2019" below the degree line
        const neighbour = [prev, next].find((n) => {
          if (!n || isBullet(n) || DEGREE_RE.test(n.text)) return false;
          const c = cleanCompany(n.cells[0] ?? "");
          return c && wordCount(c) <= 6 && CAP_WORDS_RE.test(c.split(",")[0]!) && !isLocationText(c) && !findDate({ ...n, cells: [n.cells[0]!] });
        });
        if (neighbour) {
          school = neighbour.cells[0]!;
          conf = "medium";
        }
      }
    }
    const cleanSchool = cleanCompany(school.replace(/\s+/g, " ").replace(/[|–—]+/g, " ").trim());
    if (cleanSchool && usedSchools.has(cleanSchool)) continue;
    if (cleanSchool) usedSchools.add(cleanSchool);
    const ys = years(line).length > 0 ? years(line) : prev && years(prev).length > 0 && !findDate(prev) ? years(prev) : years(next);
    const current = /present|current|ongoing|expected|erwartet/i.test(`${line.text} ${next?.text ?? ""}`);
    const gpaSrc = `${line.text} ${next?.text ?? ""} ${prev?.text ?? ""}`;
    entries.push({
      school: cleanSchool,
      degree: degreeMatch[0],
      field,
      // "2025 – Present" → start only; a lone year is the graduation year
      start: ys.length > 1 || (current && ys.length === 1) ? `${ys[0]}-01` : "",
      end: current && ys.length < 2 ? "" : ys.length > 0 ? `${ys[ys.length - 1]}-01` : "",
      gpa: /\b(?:gpa|note)[:\s]+([\d.,]+(?:\/[\d.]+)?)/i.exec(gpaSrc)?.[1] ?? "",
    });
    const idx = entries.length - 1;
    evidence[`education[${idx}]`] = { snippet: line.cells.join(" ").slice(0, 160), confidence: cleanSchool ? conf : "low" };
    if (!cleanSchool || conf !== "high") evidence[`education[${idx}].school`] = { snippet: school, confidence: cleanSchool ? conf : "low" };
    if (entries.length >= 5) break;
  }
  return { entries, evidence };
}

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

function stripContact(s: string): string {
  return s
    .replace(new RegExp(EMAIL_RE.source, "g"), " ")
    .replace(URL_RE, " ")
    .replace(new RegExp(PHONE_RE.source, "g"), " ")
    .replace(CONTACT_LABEL_RE, " ")
    .replace(/[|•·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameCandidate(cell: string): string | undefined {
  const cleaned = stripContact(cell);
  const first = cleaned.split(/[,|(]/)[0]!.trim().replace(/^(?:dr|mr|mrs|ms|prof)\.?\s+/i, "");
  if (!first || /@/.test(first) || NOT_A_NAME_RE.test(first)) return undefined;
  if ((first.match(/\d/g)?.length ?? 0) > 1) return undefined; // tolerate one OCR digit ("J0hn")
  const tokens = first.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 4 || first.length < 4) return undefined;
  if (!/^[\p{Lu}]/u.test(first) || !tokens.every((t) => /^[\p{L}\d'’.-]+$/u.test(t))) return undefined;
  // "Invoice coding familiarity" is a phrase, not a person: every token is
  // capitalized in a name (particles like "van", "de", "al" excepted)
  const particle = /^(?:van|von|de|del|della|di|da|do|dos|das|la|le|du|der|den|ten|ter|bin|ibn|al|el|of|y|e)$/i;
  if (!tokens.every((t) => /^[\p{Lu}\d]/u.test(t) || particle.test(t))) return undefined;
  // "PROFESSIONAL CERTIFICATION AND ORGANIZATIONS": headings carry function words, names do not
  if (tokens.some((t) => /^(and|or|the|for|with|in|on|at|to|by|from|our|your|my|summary|objective|profile|professional|certifications?|organizations?|references?|available|upon|request|job|status|career|work|experience|education|skills?|contact|details?|personal|information|address|phone|email|date|birth|nationality|marital|languages?|hobbies|declaration|resume|curriculum|vitae|page|expert|advanced|intermediate|beginner|basic|proficient|fluent|native)$/i.test(t))) return undefined;
  if (headingSectionOf(first) || looksLikeTitle(first) || looksLikeCompany(first) || isLocationText(first)) return undefined;
  if (DEGREE_RE.test(first) || /\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|boulevard|suite|floor|apt|p\.?o\.? box)\b\.?/i.test(first)) return undefined;
  return first;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const lettersOf = (s: string) => s.toLowerCase().replace(/[^\p{L}]/gu, "");

/** "amara.okafor@x" → "Amara Okafor" when the local part has a clear separator. */
export function nameFromEmail(email: string): string | undefined {
  const local = email.split("@")[0]?.replace(/\d+/g, "") ?? "";
  const parts = local.split(/[._-]+/).filter((p) => /^\p{L}{2,}$/u.test(p));
  if (parts.length < 2 || parts.length > 3 || local.split(/[._-]+/).length !== parts.length) return undefined;
  if (parts.some((p) => /^(mail|info|hello|contact|admin|jobs|cv|resume|career|careers|me|my)$/i.test(p))) return undefined;
  return parts.map(cap).join(" ");
}

/**
 * OCR reads stylised header names as fragments ("D arc i e A bi mo a"). When
 * the fragments' letters match the email's local part, the header is the
 * name and its capital letters mark the word boundaries; the email supplies
 * the spelling.
 */
export function nameFromHeaderAndEmail(headerText: string, email: string): string | undefined {
  const local = lettersOf(email.split("@")[0] ?? "");
  if (local.length < 5) return undefined;
  const raw = headerText.replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ").trim();
  const joined = lettersOf(raw);
  if (joined.length < 5) return undefined;
  const distance = (a: string, b: string) => {
    const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0]!;
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j]!;
        dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length]!;
  };
  if (distance(joined, local) > Math.max(1, Math.floor(local.length * 0.2))) return undefined;
  // word boundaries: capitals in the OCR text ("DarcieAbimoa" → Darcie | Abimoa)
  const words = raw.replace(/\s+/g, "").split(/(?=\p{Lu})/u).filter(Boolean);
  if (words.length < 2 || words.length > 3) return undefined;
  // spelling from the email, cut at the first word's length
  const first = words[0]!.length;
  if (first < 2 || first >= local.length - 1) return undefined;
  const rest = local.slice(first);
  const second = words.length === 3 ? words[1]!.length : rest.length;
  const parts = words.length === 3 ? [local.slice(0, first), rest.slice(0, second), rest.slice(second)] : [local.slice(0, first), rest];
  if (parts.some((p) => p.length < 2)) return undefined;
  return parts.map(cap).join(" ");
}

function detectName(lines: DocLine[], body: number, email = ""): { name: string; confidence: Confidence; snippet: string } | undefined {
  const top = lines.filter((l) => l.page === 1).slice(0, 14);
  const cands: { name: string; size: number; snippet: string }[] = [];
  for (const l of top) {
    // OCR may split a name across cells ("Priya | Raghunathan"): try the whole line too
    const candidates = l.cells.length > 1 && wordCount(l.text) <= 4 ? [...l.cells, l.cells.join(" ")] : l.cells;
    for (const cell of candidates) {
      const name = nameCandidate(cell);
      if (name) {
        cands.push({ name, size: l.size, snippet: l.cells.join(" ") });
        break;
      }
    }
  }
  if (cands.length === 0) {
    // no readable name line: rebuild it from the header fragments + email,
    // else from a separated email local part. Both are suggestions (medium).
    if (email) {
      for (const l of top.slice(0, 8)) {
        const rebuilt = nameFromHeaderAndEmail(l.cells.join(" "), email);
        if (rebuilt) return { name: rebuilt, confidence: "medium", snippet: `${l.cells.join(" ")} / ${email}` };
      }
      const fromEmail = nameFromEmail(email);
      if (fromEmail) return { name: fromEmail, confidence: "medium", snippet: email };
    }
    return undefined;
  }
  const maxSize = Math.max(...cands.map((c) => c.size));
  const best = cands.find((c) => c.size === maxSize)!;
  const allSame = cands.every((c) => c.size === maxSize);
  // the email agreeing with the name is as good as typography
  const emailAgrees = email !== "" && lettersOf(email.split("@")[0] ?? "") === lettersOf(best.name);
  return {
    name: best.name,
    confidence: maxSize >= body * 1.3 || emailAgrees ? "high" : allSame && cands.length === 1 ? "medium" : allSame ? "medium" : "low",
    snippet: best.snippet,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseCvText(raw: string): ProfilePatch {
  return parseCvLines(linesFromText(normalizeCvText(raw)));
}

export interface ParseOptions {
  /** text came from OCR: every value is shown for checking (confidence capped at medium) */
  ocr?: boolean;
}

export function parseCvLines(lines: DocLine[], options: ParseOptions = {}): ProfilePatch {
  const patch = parseLines(lines);
  if (options.ocr) {
    for (const ev of Object.values(patch.evidence)) if (ev.confidence === "high") ev.confidence = "medium";
    const flag = (key: string, value: string) => {
      if (value && !patch.evidence[key]) patch.evidence[key] = { snippet: value, confidence: "medium" };
    };
    flag("basics.firstName", patch.profile.basics.firstName);
    flag("basics.lastName", patch.profile.basics.lastName);
    patch.profile.work.forEach((w, i) => {
      flag(`work[${i}].title`, w.title);
      flag(`work[${i}].company`, w.company);
    });
    patch.profile.education.forEach((e, i) => flag(`education[${i}].school`, e.school));
  }
  return patch;
}

function parseLines(lines: DocLine[]): ProfilePatch {
  const warnings: string[] = [];
  const totalChars = lines.reduce((n, l) => n + l.text.length, 0);
  if (totalChars < 200) {
    warnings.push(
      "Very little text was extracted. If this is a scanned PDF, paste your resume text instead.",
    );
  }
  const profile = emptyProfile();
  const evidence: ProfilePatch["evidence"] = {};
  const body = bodySize(lines);
  const sections = segmentLines(lines);
  const header = sections.find((s) => s.name === "header")?.lines ?? [];
  const contactSource = [...header, ...lines];

  const email = contactSource.map((l) => EMAIL_RE.exec(l.text)).find(Boolean);
  if (email) {
    profile.basics.email = email[0];
    evidence["basics.email"] = { snippet: email.input.slice(0, 120), confidence: "high" };
  }
  const phone = contactSource
    .map((l) => PHONE_RE.exec(l.text.replace(EMAIL_RE, " ")))
    .find((m) => m && m[0].replace(/\D/g, "").length >= 9);
  if (phone) {
    profile.basics.phone = phone[0].trim();
    evidence["basics.phone"] = { snippet: phone.input.slice(0, 120), confidence: "high" };
  }
  // links: annotations attached to lines, or bare domains anywhere in the
  // document. Prefer the shortest linkedin/github URL — the profile root.
  const linkedins: string[] = [];
  const githubs: string[] = [];
  const headerText = header.slice(0, 40).map((l) => l.text);
  for (const line of lines) {
    for (const url of [...(line.text.match(URL_RE) ?? []), ...line.urls]) {
      const u = url.replace(/[.,;]$/, "");
      if (/linkedin\.com/i.test(u)) linkedins.push(u);
      else if (/github\.com/i.test(u)) githubs.push(u);
      else if (/^mailto:|^tel:/i.test(u)) continue;
      else if (!profile.links.website && (headerText.some((h) => h.includes(u)) || header.includes(line))) {
        profile.links.website = u;
      }
    }
  }
  const shortest = (arr: string[]) => arr.sort((a, b) => a.length - b.length)[0] ?? "";
  profile.links.linkedin = shortest(linkedins);
  profile.links.github = shortest(githubs);

  const name = detectName(lines, body, profile.basics.email);
  if (name) {
    const parts = name.name.split(/\s+/);
    profile.basics.firstName = parts[0] ?? "";
    profile.basics.lastName = parts.slice(1).join(" ");
    evidence["basics.firstName"] = { snippet: name.snippet, confidence: name.confidence };
    if (name.confidence !== "high") evidence["basics.lastName"] = evidence["basics.firstName"]!;
  } else {
    warnings.push("Couldn't identify your name. Please fill it in.");
  }

  // several headings can map to one section ("Experience", "Other
  // Experience", Europass's "Digital skills" rows): merge them in order
  const named = (name: string) => {
    const found = sections.filter((s) => s.name === name);
    return found.length > 0 ? found.flatMap((s) => s.lines) : undefined;
  };
  // documents with no recognizable heading at all are scanned whole
  const rest = sections.length > 1 ? lines.filter((l) => !header.includes(l)) : lines;
  const work = extractWork(named("experience") ?? rest);
  profile.work = work.entries;
  Object.assign(evidence, work.evidence);
  if (work.entries.length === 0) warnings.push("No work experience entries were recognized.");

  // an unrecognized heading must not cost the whole education section —
  // fall back to scanning the document minus the contact header
  const edu = extractEducation(named("education") ?? rest);
  profile.education = edu.entries;
  Object.assign(evidence, edu.evidence);

  const skillLines = named("skills");
  if (skillLines) {
    profile.skills = skillLines
      .flatMap((l) => l.cells)
      .map((c) => c.replace(/^-\s*/, ""))
      .join(", ")
      .split(/[,;•|·]|\s-\s/)
      .map((s) => {
        // "Languages : Python" / "Backend: Django" → drop the category label
        const colon = s.lastIndexOf(":");
        return (colon >= 0 ? s.slice(colon + 1) : s).trim();
      })
      .filter((s) => s.length >= 2 && s.length <= 40)
      .slice(0, 40);
  }

  return { profile, evidence, warnings };
}

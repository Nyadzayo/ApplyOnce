import type { EducationEntry, ProfilePatch, WorkEntry } from "./types";
import { emptyProfile } from "./types";

// CV text → CandidateProfile patch (PLAN.md Phase 6). Pure text heuristics:
// contact regex block, section segmentation by heading lexicon, work items via
// date-range regex + title/company line pairing. Every extracted value carries
// an evidence snippet so the review UI can show where it came from.

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;
// bare linkedin.com/github.com paths count too — PDFs often omit the protocol
const URL_RE = /(?:https?:\/\/|www\.)[^\s|,;)]+|(?:linkedin\.com|github\.com)\/[^\s|,;)]+/gi;
const CONTACT_LABEL_RE =
  /\b(email|e-mail|mobile|phone|tel|cell|linkedin|github|website|portfolio|address)\b\s*:?/gi;

const SECTION_HEADINGS: { section: string; re: RegExp }[] = [
  { section: "experience", re: /^(work\s+)?(experience|employment( history)?|professional experience|career history)\s*$/i },
  { section: "education", re: /^(education|academic background|qualifications)\s*$/i },
  { section: "skills", re: /^(skills|technical skills|core competencies|technologies)\s*$/i },
  { section: "summary", re: /^(summary|profile|about( me)?|objective)\s*$/i },
  { section: "projects", re: /^(projects|selected projects)\s*$/i },
  { section: "other", re: /^(certifications|awards|publications|languages|interests|references)\s*$/i },
];

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_PART = `(?:(?:${MONTHS})[a-z]*\\.?\\s+)?(?:19|20)\\d{2}|(?:0?[1-9]|1[0-2])\\s*\\/\\s*(?:19|20)\\d{2}`;
const DATE_RANGE_RE = new RegExp(
  `(${DATE_PART})\\s*(?:[–—-]|to|until)\\s*((?:${DATE_PART})|present|current|now|ongoing)`,
  "i",
);

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
  lines: string[];
}

export function segmentSections(text: string): Section[] {
  const lines = text.split("\n").map((l) => l.trim());
  const sections: Section[] = [{ name: "header", lines: [] }];
  for (const line of lines) {
    const heading = SECTION_HEADINGS.find((h) => h.re.test(line));
    if (heading && line.length < 60) {
      sections.push({ name: heading.section, lines: [] });
    } else {
      sections[sections.length - 1]!.lines.push(line);
    }
  }
  return sections;
}

function toIsoMonth(datePart: string): string {
  const m = new RegExp(`^(${MONTHS})[a-z]*\\.?\\s+((?:19|20)\\d{2})$`, "i").exec(
    datePart.trim(),
  );
  if (m) {
    const monthIdx =
      ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
        m[1]!.slice(0, 3).toLowerCase(),
      ) + 1;
    return `${m[2]}-${String(monthIdx).padStart(2, "0")}`;
  }
  const slash = /^(0?[1-9]|1[0-2])\s*\/\s*((?:19|20)\d{2})$/.exec(datePart.trim());
  if (slash) return `${slash[2]}-${slash[1]!.padStart(2, "0")}`;
  const year = /^((?:19|20)\d{2})$/.exec(datePart.trim());
  if (year) return `${year[1]}-01`;
  return datePart.trim();
}

function extractWork(lines: string[]): { entries: WorkEntry[]; evidence: string[] } {
  const entries: WorkEntry[] = [];
  const evidence: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const range = DATE_RANGE_RE.exec(line);
    if (!range) {
      i++;
      continue;
    }
    // title/company usually live on this line (before the dates) or the 1–2
    // lines above; bullets follow until the next date range. Continuation
    // lines of wrapped bullets (start lowercase / end with ".") are NOT
    // title/company context.
    const before = line.slice(0, range.index).trim().replace(/[|,–—-]\s*$/, "");
    const context = [lines[i - 2] ?? "", lines[i - 1] ?? "", before]
      .map((s) => s.trim())
      .filter(
        (s) =>
          s &&
          !s.startsWith("-") &&
          !/^[a-z0-9(]/.test(s) && // wrapped continuation of a bullet
          !/[.:]$/.test(s), // full sentences are bullet text, not names
      );
    const { title, company } = splitTitleCompany(context);

    const endRaw = range[2]!.toLowerCase();
    const current = /present|current|now|ongoing/.test(endRaw);
    const bullets: string[] = [];
    let j = i + 1;
    while (j < lines.length && !DATE_RANGE_RE.test(lines[j]!)) {
      const l = lines[j]!;
      if (l.startsWith("-")) {
        bullets.push(l.replace(/^-\s*/, ""));
      } else if (bullets.length > 0 && /^[a-z0-9(]/.test(l)) {
        // wrapped continuation of the previous bullet
        bullets[bullets.length - 1] += ` ${l}`;
      }
      j++;
      if (bullets.length >= 8) break;
    }
    entries.push({
      company,
      title,
      start: toIsoMonth(range[1]!),
      end: current ? "" : toIsoMonth(range[2]!),
      current,
      location: "",
      description: bullets.join(" "),
    });
    evidence.push(line.slice(0, 160));
    i = Math.max(j, i + 1);
  }
  return { entries, evidence };
}

/** Heuristic: "Senior Engineer, Acme Corp" / "Acme Corp — Senior Engineer" /
 *  two separate lines. Titles contain role words; companies usually don't. */
const TITLE_WORDS =
  /\b(engineer|developer|manager|director|analyst|designer|scientist|consultant|lead|intern|architect|specialist|officer|head|vp|president|founder|administrator|accountant|nurse|teacher|writer)\b/i;

function splitTitleCompany(context: string[]): { title: string; company: string } {
  // two-line layout first: one line is clearly the role, another the company
  // ("Prime Circle Finance Cape Town, SA" above / "Software Engineer <dates>")
  const titleLine = [...context].reverse().find((c) => TITLE_WORDS.test(c) && !c.includes(","));
  if (titleLine) {
    const companyLine = [...context].reverse().find((c) => c !== titleLine && !TITLE_WORDS.test(c));
    if (companyLine) {
      return { title: titleLine, company: cleanCompany(companyLine) };
    }
  }
  // inline layout: "Senior Engineer, Acme Corp" / "Acme — Senior Engineer"
  for (const c of [...context].reverse()) {
    const parts = c.split(/\s+[|@–—]\s+|,\s+| at /);
    if (parts.length >= 2) {
      const [a, b] = [parts[0]!.trim(), parts.slice(1).join(", ").trim()];
      if (TITLE_WORDS.test(a)) return { title: a, company: cleanCompany(b) };
      if (TITLE_WORDS.test(b)) return { title: b, company: cleanCompany(a) };
      return { title: a, company: cleanCompany(b) };
    }
  }
  const t = context.find((c) => TITLE_WORDS.test(c)) ?? "";
  const rest = context.find((c) => c && c !== t) ?? "";
  return { title: t, company: cleanCompany(rest) };
}

/** Strip trailing location debris: ", SA", ", Remote", "Remote", 2–3 letter codes. */
function cleanCompany(raw: string): string {
  const parts = raw.split(",").map((s) => s.trim());
  while (parts.length > 1) {
    const last = parts[parts.length - 1]!;
    if (last.length <= 3 || /^(remote|hybrid|on-?site)$/i.test(last)) parts.pop();
    else break;
  }
  return parts
    .join(", ")
    .replace(/\s+(Remote|Hybrid|On-?site)$/i, "")
    .trim();
}

const DEGREE_RE =
  /\b(b\.?\s?(sc?|a|eng|s)|m\.?\s?(sc?|a|eng|s|ba)|ph\.?d|bachelor(?:'?s)?|master(?:'?s)?|doctorate|associate|diploma)\b/i;

const SCHOOL_RE = /university|college|institute|school|academy|polytechnic/i;

function extractEducation(lines: string[]): { entries: EducationEntry[]; evidence: string[] } {
  const entries: EducationEntry[] = [];
  const evidence: string[] = [];
  // bullet-marker-only lines ("•" → "-") must not shift prev/next context
  const text = lines.filter((l) => l && !/^[-•◦*]+$/.test(l));
  const usedSchools = new Set<string>();

  for (let i = 0; i < text.length; i++) {
    const line = text[i]!;
    if (!DEGREE_RE.test(line)) continue;
    const prev = text[i - 1] ?? "";
    const next = text[i + 1] ?? "";
    // resumes usually put the institution ABOVE the degree line — prefer prev
    const school = SCHOOL_RE.test(line)
      ? line
      : SCHOOL_RE.test(prev) && !DEGREE_RE.test(prev)
        ? prev
        : SCHOOL_RE.test(next) && !DEGREE_RE.test(next)
          ? next
          : "";
    const current = /present|current|ongoing/i.test(line);
    const years = line.match(/(?:19|20)\d{2}/g) ?? next.match(/(?:19|20)\d{2}/g) ?? [];
    const degreeMatch = DEGREE_RE.exec(line);
    let field = /\b(?:in|of)\s+([A-Z][A-Za-z&\s]{2,40})/.exec(line)?.[1]?.trim() ?? "";
    if (!field && degreeMatch) {
      // "BSc. Honours Computer Science; GPA: 3.5" → text after the degree word
      field = line
        .slice(degreeMatch.index + degreeMatch[0].length)
        .split(/[;,(]|(?:19|20)\d{2}/)[0]!
        .replace(/^[.\s:-]+/, "")
        .trim()
        .slice(0, 60);
    }
    const cleanSchool =
      school === line
        ? school.replace(DEGREE_RE, "").replace(/[,|–—-]+/g, " ").replace(/\s+/g, " ").trim()
        : cleanCompany(school);
    if (cleanSchool && usedSchools.has(cleanSchool)) continue;
    if (cleanSchool) usedSchools.add(cleanSchool);
    entries.push({
      school: cleanSchool || school.trim(),
      degree: degreeMatch?.[0] ?? "",
      field,
      start: years.length > 0 ? `${years[0]}-01` : "",
      end: current ? "" : years.length > 0 ? `${years[years.length - 1]}-01` : "",
      gpa: /gpa[:\s]+([\d.]+)/i.exec(`${line} ${next}`)?.[1] ?? "",
    });
    evidence.push(line.slice(0, 160));
    if (entries.length >= 5) break;
  }
  return { entries, evidence };
}

export function parseCvText(raw: string): ProfilePatch {
  const warnings: string[] = [];
  const text = normalizeCvText(raw);
  if (text.length < 200) {
    warnings.push(
      "Very little text was extracted. If this is a scanned PDF, paste your resume text instead.",
    );
  }
  const profile = emptyProfile();
  const evidence: Record<string, { snippet: string }> = {};
  const sections = segmentSections(text);
  const header = sections.find((s) => s.name === "header")?.lines ?? [];
  const all = text.split("\n");

  // contact block (usually the header, but scan everything as fallback)
  const contactSource = [...header, ...all];
  const email = contactSource.map((l) => EMAIL_RE.exec(l)).find(Boolean);
  if (email) {
    profile.basics.email = email[0];
    evidence["basics.email"] = { snippet: email.input.slice(0, 120) };
  }
  const phone = contactSource
    .map((l) => PHONE_RE.exec(l.replace(EMAIL_RE, " ")))
    .find((m) => m && m[0].replace(/\D/g, "").length >= 9);
  if (phone) {
    profile.basics.phone = phone[0].trim();
    evidence["basics.phone"] = { snippet: phone.input.slice(0, 120) };
  }
  // links: PDFs carry these as link annotations (appended to the text by the
  // PDF extractor) or bare domains anywhere in the document. Prefer the
  // shortest linkedin/github URL — that's the profile root, not a repo.
  const linkedins: string[] = [];
  const githubs: string[] = [];
  for (const line of all) {
    for (const url of line.match(URL_RE) ?? []) {
      const u = url.replace(/[.,;]$/, "");
      if (/linkedin\.com/i.test(u)) linkedins.push(u);
      else if (/github\.com/i.test(u)) githubs.push(u);
      else if (!profile.links.website && contactSource.slice(0, 40).some((h) => h.includes(u))) {
        profile.links.website = u;
      }
    }
  }
  const shortest = (arr: string[]) =>
    arr.sort((a, b) => a.length - b.length)[0] ?? "";
  profile.links.linkedin = shortest(linkedins);
  profile.links.github = shortest(githubs);

  // name guess: first header line that reads like a name AFTER stripping
  // contact tokens ("Kelvin N. Email : k@x.com | Mobile : +27..." → "Kelvin N.")
  const phoneG = new RegExp(PHONE_RE.source, "g");
  const nameLine = header
    .slice(0, 8)
    .map((l) =>
      l
        .replace(new RegExp(EMAIL_RE.source, "g"), " ")
        .replace(URL_RE, " ")
        .replace(phoneG, " ")
        .replace(CONTACT_LABEL_RE, " ")
        .replace(/[|•·]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .find(
      (l) =>
        l &&
        !/\d|@/.test(l) &&
        l.split(/\s+/).length <= 4 &&
        l.length >= 4 &&
        /^[A-ZÀ-Ž]/.test(l),
    );
  if (nameLine) {
    const parts = nameLine.trim().split(/\s+/);
    profile.basics.firstName = parts[0] ?? "";
    profile.basics.lastName = parts.slice(1).join(" ");
    evidence["basics.firstName"] = { snippet: nameLine };
  } else {
    warnings.push("Couldn't identify your name. Please fill it in.");
  }

  const workSection = sections.find((s) => s.name === "experience");
  const work = extractWork(workSection?.lines ?? all);
  profile.work = work.entries;
  work.evidence.forEach((snippet, i) => {
    evidence[`work[${i}]`] = { snippet };
  });
  if (work.entries.length === 0) warnings.push("No work experience entries were recognized.");

  const eduSection = sections.find((s) => s.name === "education");
  const edu = extractEducation(eduSection?.lines ?? []);
  profile.education = edu.entries;
  edu.evidence.forEach((snippet, i) => {
    evidence[`education[${i}]`] = { snippet };
  });

  const skillsSection = sections.find((s) => s.name === "skills");
  if (skillsSection) {
    profile.skills = skillsSection.lines
      .map((l) => l.replace(/^-\s*/, ""))
      .join(", ")
      .split(/[,;•|]|\s-\s/)
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

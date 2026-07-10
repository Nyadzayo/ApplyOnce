// @vitest-environment jsdom
//
// The eval runner (PLAN.md Phase 0): loads each fixture, runs the scanner and
// the mapper, scores detection recall + mapping precision per ATS, and
// enforces the launch gates:
//   detection recall  > 0.95
//   mapping precision > 0.98 on filled (high-confidence) fields
//
// Every bug found in the wild becomes a fixture here.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { scanDocument } from "../src/content/scan/scanner";
import { mapFields } from "@shared/mapper";
import { detectAts } from "@shared/ats";
import { emptyProfile, type FieldDecision, type FieldSignal, type SavedAnswer } from "@shared/types";
import { normalizeLabel } from "@shared/normalize";

const FIXTURES_DIR = join(__dirname, "..", "fixtures");

interface GoldenField {
  selector: string;
  canonical: string;
  kind: string;
  required?: boolean;
  viaSavedAnswer?: boolean;
}
interface Golden {
  url: string;
  fields: GoldenField[];
  expectNoFill: string[];
}

// -- the standard eval candidate ---------------------------------------------

function evalProfile() {
  const p = emptyProfile();
  p.basics = { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+44 20 7946 0958", pronouns: "she/her" };
  p.location = { street: "221B Baker Street", city: "London", region: "Greater London", country: "United Kingdom", postalCode: "SW1A 1AA" };
  p.links = { linkedin: "https://linkedin.com/in/ada", github: "https://github.com/ada", portfolio: "https://ada.dev", website: "https://ada.dev" };
  p.work = [{ company: "Analytical Engines Ltd", title: "Staff Engineer", start: "2021-03", end: "", current: true, location: "London", description: "Compilers." }];
  p.education = [{ school: "University of London", degree: "BSc", field: "Mathematics", start: "2012-09", end: "2016-06", gpa: "3.9" }];
  p.skills = ["TypeScript", "Rust"];
  p.explicit = {
    workAuth: "Yes",
    requiresSponsorship: "No",
    salary: "$150,000",
    salaryMin: "$140,000",
    salaryMax: "$160,000",
    startDate: "2026-08-01",
    relocation: "Yes",
    remote: "Remote",
    noticePeriod: "1 month",
    gender: "Prefer not to say",
    race: "Decline to self-identify",
    hispanic: "No",
    veteran: "I am not a protected veteran",
    disability: "No, I do not have a disability",
  };
  return p;
}

const savedAnswers: SavedAnswer[] = [
  {
    id: "sa1",
    questionText: "Why do you want to work here?",
    normalizedKey: normalizeLabel("Why do you want to work here?"),
    aliasKeys: [],
    answer: "Because I love building precise tools.",
    timesUsed: 3,
    lastUsedAt: 0,
    createdAt: 0,
  },
];

const documents = [
  { id: "doc-r", role: "resume" as const, fileName: "ada-lovelace.pdf", mime: "application/pdf", size: 100_000, addedAt: 0 },
  { id: "doc-c", role: "coverLetter" as const, fileName: "cover.pdf", mime: "application/pdf", size: 50_000, addedAt: 0 },
];

// -- runner --------------------------------------------------------------------

interface FixtureScore {
  name: string;
  ats: string;
  goldenCount: number;
  detected: number;
  filled: number;
  filledCorrect: number;
  mistakes: string[];
}

function runFixture(name: string): FixtureScore {
  const dir = join(FIXTURES_DIR, name);
  const html = readFileSync(join(dir, "page.html"), "utf8");
  const golden = JSON.parse(readFileSync(join(dir, "golden.json"), "utf8")) as Golden;
  const ats = detectAts(golden.url);

  const doc = new DOMParser().parseFromString(html, "text/html");
  const { signals, registry } = scanDocument(doc, { ats, framePath: "top", assumeLayout: true });

  const decisions = mapFields(signals, {
    ats,
    profile: evalProfile(),
    savedAnswers,
    documents,
    dateFormatHint: "MM/DD/YYYY",
  });
  const decisionByRef = new Map(decisions.map((d) => [d.ref, d]));

  const signalForSelector = (selector: string): FieldSignal | undefined => {
    const el = doc.querySelector(selector);
    if (!el) return undefined;
    for (const s of signals) {
      const regEl = registry.get(s.ref);
      if (regEl === el) return s;
      if (s.memberSelectors?.some((ms) => doc.querySelector(ms) === el)) return s;
    }
    return undefined;
  };

  const mistakes: string[] = [];
  let detected = 0;
  let filled = 0;
  let filledCorrect = 0;

  for (const g of golden.fields) {
    const sig = signalForSelector(g.selector);
    if (!sig) {
      mistakes.push(`MISSED ${g.selector} (${g.canonical})`);
      continue;
    }
    detected++;
    const d = decisionByRef.get(sig.ref) as FieldDecision;
    const isFill = d.action === "fill" || d.action === "fill-amber";
    if (isFill) {
      filled++;
      if (d.canonical === g.canonical) {
        filledCorrect++;
      } else {
        mistakes.push(
          `WRONG ${g.selector}: mapped to ${d.canonical ?? "∅"} (wanted ${g.canonical}), value="${d.value}"`,
        );
      }
    }
  }

  for (const sel of golden.expectNoFill) {
    const sig = signalForSelector(sel);
    if (!sig) continue;
    const d = decisionByRef.get(sig.ref);
    if (d && (d.action === "fill" || d.action === "fill-amber")) {
      mistakes.push(`FORBIDDEN FILL ${sel}: ${d.canonical} = "${d.value}"`);
      filled++;
    }
  }

  return { name, ats, goldenCount: golden.fields.length, detected, filled, filledCorrect, mistakes };
}

// -- report + gates --------------------------------------------------------------

describe("fixture eval", () => {
  const fixtureNames = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const scores = fixtureNames.map(runFixture);

  it("prints the per-ATS report", () => {
    const rows = scores.map((s) => ({
      fixture: s.name,
      ats: s.ats,
      "golden fields": s.goldenCount,
      detected: s.detected,
      recall: (s.detected / s.goldenCount).toFixed(3),
      filled: s.filled,
      "fill precision": s.filled > 0 ? (s.filledCorrect / s.filled).toFixed(3) : "—",
    }));
    console.table(rows);
    for (const s of scores) {
      for (const m of s.mistakes) console.log(`  [${s.name}] ${m}`);
    }
    expect(scores.length).toBeGreaterThan(0);
  });

  it("launch gate: detection recall > 0.95", () => {
    const total = scores.reduce((a, s) => a + s.goldenCount, 0);
    const detected = scores.reduce((a, s) => a + s.detected, 0);
    expect(detected / total).toBeGreaterThan(0.95);
  });

  it("launch gate: mapping precision > 0.98 on filled fields", () => {
    const filled = scores.reduce((a, s) => a + s.filled, 0);
    const correct = scores.reduce((a, s) => a + s.filledCorrect, 0);
    expect(filled).toBeGreaterThan(0);
    expect(correct / filled).toBeGreaterThan(0.98);
  });

  it("hard gate: nothing on the expectNoFill lists is ever filled", () => {
    const forbidden = scores.flatMap((s) => s.mistakes.filter((m) => m.startsWith("FORBIDDEN")));
    expect(forbidden).toEqual([]);
  });
});

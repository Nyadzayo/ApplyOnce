import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCvLines, parseCvText } from "@shared/cvparse";
import { docxLines, pdfLines } from "./cv-extract-node";


// CV parse eval (PLAN.md Part 9 §5). Two corpora:
//  - fixtures/cv/*.txt: hand-written text layouts, scored loosely (contains).
//  - fixtures/cv/bin/*.pdf|docx: generated binaries through the real
//    extractors, scored strictly (normalized exact match) as precision
//    (filled and correct / filled) and recall (correct / golden).
// Floors ratchet upward as the parser improves — never downward.

interface GoldenWork { company: string; title: string; location: string; start: string; end: string }
interface GoldenEdu { school: string; field: string; degree: string }
interface GoldenDoc {
  dates?: "month" | "year"; minSkills: number; firstName: string; lastName: string; email: string; phone: string;
  work: GoldenWork[]; education: GoldenEdu[];
}

const DIR = join(__dirname, "..", "fixtures", "cv");
const BIN = join(DIR, "bin");
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const strict = (s: string) => norm(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const digits = (s: string) => s.replace(/\D/g, "");
const loose = (got: string | undefined, want: string) => {
  if (!got) return false;
  const a = norm(got), b = norm(want);
  return a.includes(b) || b.includes(a);
};

describe("cv parse eval", () => {
  // Ad-hoc check of any resume on this machine (never committed):
  //   APPLYONCE_CV_FILES="$HOME/Downloads/a.pdf,$HOME/Downloads/b.docx" npm run eval -- cvparse
  const adHoc = (process.env.APPLYONCE_CV_FILES ?? "").split(",").map((f) => f.trim()).filter(Boolean);
  it.skipIf(adHoc.length === 0)("parses the files in APPLYONCE_CV_FILES", async () => {
    for (const file of adHoc) {
      const buf = readFileSync(file);
      const ocr = false;
      const lines = /\.docx$/i.test(file) ? await docxLines(buf) : /\.pdf$/i.test(file) ? await pdfLines(buf) : undefined;
      if (/\.pdf$/i.test(file) && lines && lines.reduce((n, l) => n + l.text.length, 0) < 40) {
        console.log(`${file}: no text layer (scan). Use APPLYONCE_CV_SCANS with evals/cvparse-ocr-eval.test.ts`);
      }
      if (process.env.APPLYONCE_CV_DUMP && lines) {
        for (const l of lines.slice(0, Number(process.env.APPLYONCE_CV_DUMP) || 40)) {
          console.log(`[p${l.page} ${String(l.size).padStart(4)} ${l.bold ? "B" : " "} x${String(l.x0).padStart(3)} g${l.gapAbove.toFixed(1)}] ${l.cells.join(" | ").slice(0, 110)}`);
        }
        console.log(`(${lines.length} lines total)`);
      }
      const { profile, evidence, warnings } = lines ? parseCvLines(lines, { ocr }) : parseCvText(buf.toString("utf8"));
      const flagged = Object.entries(evidence).filter(([k, e]) => e.confidence && e.confidence !== "high" && k.includes(".")).map(([k]) => k);
      console.log(`\n=== ${file.split("/").pop()}`);
      console.log(`name: ${profile.basics.firstName} ${profile.basics.lastName} | email: ${profile.basics.email} | phone: ${profile.basics.phone} | linkedin: ${profile.links.linkedin}`);
      profile.work.forEach((w, i) => console.log(`  work[${i}] ${w.title} @ ${w.company} (${w.location}) ${w.start} -> ${w.current ? "present" : w.end}  [${evidence[`work[${i}]`]?.confidence}]`));
      profile.education.forEach((e, i) => console.log(`  edu[${i}] ${e.degree} ${e.field} @ ${e.school} ${e.start} -> ${e.end}  [${evidence[`education[${i}]`]?.confidence}]`));
      console.log(`  skills: ${profile.skills.length} | flagged for review: ${flagged.join(", ") || "none"} | warnings: ${warnings.join("; ") || "none"}`);
    }
  }, 120000);

  it("text corpus: prints the per-fixture report", () => {
    const golden = JSON.parse(readFileSync(join(DIR, "golden.json"), "utf8"));
    const rows: Record<string, unknown>[] = [];
    let got = 0, want = 0;
    for (const file of readdirSync(DIR).filter((f) => f.endsWith(".txt")).sort()) {
      const name = file.replace(/\.txt$/, "");
      const g = golden[name];
      if (!g) continue;
      const { profile } = parseCvText(readFileSync(join(DIR, file), "utf8"));
      let ok = 0, total = 0;
      const miss: string[] = [];
      const check = (cond: boolean, label: string) => {
        total++;
        if (cond) ok++;
        else miss.push(label);
      };
      if (g.email) check(loose(profile.basics.email, g.email), "email");
      if (g.firstName) check(loose(profile.basics.firstName, g.firstName), "firstName");
      for (let i = 0; i < (g.work ?? []).length; i++) {
        const w = g.work[i];
        const found = profile.work.find((e) => loose(e.company, w.company));
        check(!!found, `work[${i}].company=${w.company}`);
        check(!!found && loose(found.title, w.title), `work[${i}].title=${w.title}`);
      }
      for (let i = 0; i < (g.education ?? []).length; i++) {
        const e = g.education[i];
        const found = profile.education.find((x) => loose(x.school, e.school));
        check(!!found, `edu[${i}].school=${e.school}`);
        if (e.field) check(!!found && loose(found.field, e.field), `edu[${i}].field`);
      }
      if (g.minSkills) check(profile.skills.length >= g.minSkills, "skills");
      got += ok; want += total;
      rows.push({ fixture: name, fields: total, ok, score: (ok / total).toFixed(2),
                  missing: miss.slice(0, 3).join("; ").slice(0, 70) });
    }
    console.table(rows);
    const score = got / want;
    console.log(`text corpus field score: ${got}/${want} = ${score.toFixed(3)}`);
    expect(score).toBeGreaterThanOrEqual(0.98);
  });

  it.skipIf(!existsSync(join(BIN, "golden.json")))("binary corpus: strict precision / recall", async () => {
    const golden: Record<string, GoldenDoc> = JSON.parse(readFileSync(join(BIN, "golden.json"), "utf8"));
    const rows: Record<string, unknown>[] = [];
    const byType: Record<string, { filled: number; correct: number; golden: number }> = {};
    const tally = (type: string, gotValue: string, wantValue: string, eq: (a: string, b: string) => boolean, miss: string[], label: string) => {
      const t = (byType[type] ??= { filled: 0, correct: 0, golden: 0 });
      t.golden++;
      if (gotValue) t.filled++;
      if (gotValue && eq(gotValue, wantValue)) t.correct++;
      else miss.push(`${label}: got "${gotValue}" want "${wantValue}"`);
    };
    const eqStrict = (a: string, b: string) => strict(a) === strict(b);
    for (const file of readdirSync(BIN).filter((f) => /\.(pdf|docx)$/.test(f)).sort()) {
      const g = golden[file];
      if (!g) continue;
      const buf = readFileSync(join(BIN, file));
      const lines = file.endsWith(".pdf") ? await pdfLines(buf) : await docxLines(buf);
      const { profile } = parseCvLines(lines);
      const miss: string[] = [];
      const before = JSON.stringify(byType);
      tally("name", profile.basics.firstName, g.firstName, eqStrict, miss, "firstName");
      tally("name", profile.basics.lastName, g.lastName, eqStrict, miss, "lastName");
      tally("email", profile.basics.email, g.email, eqStrict, miss, "email");
      tally("phone", profile.basics.phone, g.phone, (a, b) => digits(a) === digits(b), miss, "phone");
      const usedWork = new Set<number>();
      g.work.forEach((w, i) => {
        let idx = profile.work.findIndex((e, k) => !usedWork.has(k) && (eqStrict(e.company, w.company) || eqStrict(e.title, w.title)));
        if (idx < 0) idx = profile.work.findIndex((_, k) => !usedWork.has(k));
        const e = idx >= 0 ? profile.work[idx]! : undefined;
        if (idx >= 0) usedWork.add(idx);
        tally("work.company", e?.company ?? "", w.company, eqStrict, miss, `work[${i}].company`);
        tally("work.title", e?.title ?? "", w.title, eqStrict, miss, `work[${i}].title`);
        const eqDate = g.dates === "year" ? (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4) : eqStrict;
        tally("work.start", e?.start ?? "", w.start, eqDate, miss, `work[${i}].start`);
        tally("work.end", e ? (e.current ? "present" : e.end) : "", w.end || "present", eqDate, miss, `work[${i}].end`);
        tally("work.location", e?.location ?? "", w.location, eqStrict, miss, `work[${i}].location`);
      });
      // spurious entries are filled-and-wrong
      profile.work.forEach((e, k) => {
        if (usedWork.has(k)) return;
        for (const type of ["work.company", "work.title"]) {
          const t = (byType[type] ??= { filled: 0, correct: 0, golden: 0 });
          t.filled++;
        }
        miss.push(`spurious work: "${e.title}" @ "${e.company}"`);
      });
      const usedEdu = new Set<number>();
      g.education.forEach((ed, i) => {
        let idx = profile.education.findIndex((x, k) => !usedEdu.has(k) && eqStrict(x.school, ed.school));
        if (idx < 0) idx = profile.education.findIndex((_, k) => !usedEdu.has(k));
        const x = idx >= 0 ? profile.education[idx]! : undefined;
        if (idx >= 0) usedEdu.add(idx);
        tally("edu.school", x?.school ?? "", ed.school, eqStrict, miss, `edu[${i}].school`);
        tally("edu.field", x?.field ?? "", ed.field, eqStrict, miss, `edu[${i}].field`);
      });
      profile.education.forEach((x, k) => {
        if (usedEdu.has(k)) return;
        (byType["edu.school"] ??= { filled: 0, correct: 0, golden: 0 }).filled++;
        miss.push(`spurious edu: "${x.school}"`);
      });
      tally("skills", profile.skills.length >= g.minSkills ? "ok" : "", "ok", eqStrict, miss, "skills");
      const after = byType;
      const delta = Object.keys(after).reduce(
        (acc, k) => {
          const b = JSON.parse(before)[k] ?? { filled: 0, correct: 0, golden: 0 };
          acc.filled += after[k]!.filled - b.filled;
          acc.correct += after[k]!.correct - b.correct;
          acc.golden += after[k]!.golden - b.golden;
          return acc;
        },
        { filled: 0, correct: 0, golden: 0 },
      );
      if (delta.correct === delta.golden && delta.filled === delta.correct) continue; // perfect: keep the table short
      rows.push({
        fixture: file.replace(/\.(pdf|docx)$/, (m) => (m === ".docx" ? " [docx]" : "")),
        P: delta.filled ? (delta.correct / delta.filled).toFixed(2) : "-",
        R: (delta.correct / delta.golden).toFixed(2),
        missing: miss.slice(0, 2).join("; ").slice(0, 90),
      });
    }
    console.table(rows);
    let filled = 0, correct = 0, total = 0;
    const typeRows = Object.entries(byType).map(([type, t]) => {
      filled += t.filled; correct += t.correct; total += t.golden;
      return { type, precision: t.filled ? (t.correct / t.filled).toFixed(3) : "-", recall: (t.correct / t.golden).toFixed(3), golden: t.golden };
    });
    console.table(typeRows);
    const precision = correct / filled;
    const recall = correct / total;
    console.log(`binary corpus: precision ${precision.toFixed(3)} (${correct}/${filled})  recall ${recall.toFixed(3)} (${correct}/${total})`);
    expect(precision).toBeGreaterThanOrEqual(0.99); // PLAN.md Part 9 §5 gate; ratchet toward 1.000
    expect(recall).toBeGreaterThanOrEqual(0.95);
  }, 120000);
});

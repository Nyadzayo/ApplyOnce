// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCvLines } from "@shared/cvparse";
import { ocrLines, pdfEmbeddedImagePng, pdfLines } from "./cv-extract-node";

// OCR evals (PLAN.md Part 9 section 5a, scanned input). Runs tesseract.js in
// a Node worker, so this file needs the node environment (jsdom makes the
// library think it is in a browser). Assets: public/tesseract/ when present
// (scripts/fetch-ocr-assets.mjs), else tesseract.js downloads eng data once.
//
// Ad-hoc check of scanned resumes (PNG/JPEG or image-only PDF):
//   APPLYONCE_CV_SCANS="$HOME/x.pdf,$HOME/y.png" npx vitest run evals/cvparse-ocr-eval.test.ts

interface GoldenWork { company: string; title: string; start: string }
interface GoldenEdu { school: string }
interface GoldenDoc { firstName: string; lastName: string; email: string; work: GoldenWork[]; education: GoldenEdu[] }

const SCAN = join(__dirname, "..", "fixtures", "cv", "scan");
const strict = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

describe("cv parse eval (OCR)", () => {
  const adHoc = (process.env.APPLYONCE_CV_SCANS ?? "").split(",").map((f) => f.trim()).filter(Boolean);
  it.skipIf(adHoc.length === 0)("parses the scans in APPLYONCE_CV_SCANS", async () => {
    for (const file of adHoc) {
      const buf = readFileSync(file);
      let image: { png: Buffer; width: number; height: number } | undefined;
      if (/\.pdf$/i.test(file)) {
        const text = await pdfLines(buf);
        if (text.reduce((n, l) => n + l.text.length, 0) >= 40) {
          console.log(`${file}: has a text layer; use APPLYONCE_CV_FILES with cvparse-eval instead`);
          continue;
        }
        image = await pdfEmbeddedImagePng(buf);
      } else if (/\.png$/i.test(file)) image = { png: buf, ...pngSize(buf) };
      if (!image) {
        console.log(`${file}: no page image found`);
        continue;
      }
      const { lines, confidence } = await ocrLines(image.png, image.width, image.height);
      if (process.env.APPLYONCE_CV_DUMP) {
        for (const l of lines.slice(0, Number(process.env.APPLYONCE_CV_DUMP) || 40)) console.log(`[${String(l.size).padStart(3)} x${String(l.x0).padStart(4)} g${l.gapAbove.toFixed(1)}] ${l.cells.join(" | ").slice(0, 110)}`);
      }
      const { profile, evidence, warnings } = parseCvLines(lines, { ocr: true });
      console.log(`\n=== ${file.split("/").pop()} ${image.width}x${image.height} ocr confidence ${confidence.toFixed(0)} lines ${lines.length}`);
      console.log(`name: ${profile.basics.firstName} ${profile.basics.lastName} | email: ${profile.basics.email} | phone: ${profile.basics.phone}`);
      profile.work.forEach((w, i) => console.log(`  work[${i}] ${w.title} @ ${w.company} (${w.location}) ${w.start} -> ${w.current ? "present" : w.end}  [${evidence[`work[${i}]`]?.confidence}]`));
      profile.education.forEach((e, i) => console.log(`  edu[${i}] ${e.degree} ${e.field} @ ${e.school} ${e.start} -> ${e.end}`));
      console.log(`  skills: ${profile.skills.length} | warnings: ${warnings.join("; ") || "none"}`);
    }
  }, 600000);

  // Scanned resumes: 200 dpi page images of generated fixtures through
  // tesseract.js and the same line model. Scored like the binary corpus; the
  // floors allow OCR noise, and every OCR value is flagged for review anyway.
  it.skipIf(!existsSync(join(SCAN, "golden.json")))("scan corpus: OCR precision / recall", async () => {
    const golden: Record<string, GoldenDoc> = JSON.parse(readFileSync(join(SCAN, "golden.json"), "utf8"));
    let filled = 0, correct = 0, total = 0;
    const rows: Record<string, unknown>[] = [];
    for (const file of readdirSync(SCAN).filter((f) => f.endsWith(".png")).sort()) {
      const g = golden[file];
      if (!g) continue;
      const buf = readFileSync(join(SCAN, file));
      const { width, height } = pngSize(buf);
      const { lines, confidence } = await ocrLines(buf, width, height);
      const { profile } = parseCvLines(lines, { ocr: true });
      let f = 0, c = 0, t = 0;
      const miss: string[] = [];
      const check = (got: string, want: string, label: string) => {
        t++;
        if (got) f++;
        if (got && strict(got) === strict(want)) c++;
        else miss.push(`${label}: "${got}" vs "${want}"`);
      };
      check(profile.basics.firstName, g.firstName, "firstName");
      check(profile.basics.lastName, g.lastName, "lastName");
      check(profile.basics.email, g.email, "email");
      g.work.forEach((w, i) => {
        const e = profile.work.find((x) => strict(x.company) === strict(w.company) || strict(x.title) === strict(w.title)) ?? profile.work[i];
        check(e?.company ?? "", w.company, `work[${i}].company`);
        check(e?.title ?? "", w.title, `work[${i}].title`);
        check(e?.start ?? "", w.start, `work[${i}].start`);
      });
      g.education.forEach((ed, i) => {
        const x = profile.education.find((y) => strict(y.school) === strict(ed.school)) ?? profile.education[i];
        check(x?.school ?? "", ed.school, `edu[${i}].school`);
      });
      filled += f; correct += c; total += t;
      rows.push({ fixture: file, conf: confidence.toFixed(0), P: f ? (c / f).toFixed(2) : "-", R: (c / t).toFixed(2), missing: miss.slice(0, 2).join("; ").slice(0, 80) });
    }
    console.table(rows);
    const precision = correct / filled, recall = correct / total;
    console.log(`scan corpus: precision ${precision.toFixed(3)} (${correct}/${filled})  recall ${recall.toFixed(3)} (${correct}/${total})`);
    expect(precision).toBeGreaterThanOrEqual(0.95); // measured 0.972 / 0.875 (2026-09-02); ratchet upward only
    expect(recall).toBeGreaterThanOrEqual(0.8);
  }, 600000);
});

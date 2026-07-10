import { describe, expect, it } from "vitest";
import { normalizeCvText, parseCvText, segmentSections } from "@shared/cvparse";

const SAMPLE = `
Ada Lovelace
London, United Kingdom
ada.lovelace@example.com | +44 20 7946 0958
https://linkedin.com/in/ada-lovelace | https://github.com/ada

Summary
Engineer with a decade of experience in compilers and numerical computing.

Experience

Staff Software Engineer, Analytical Engines Ltd    Mar 2021 – Present
• Led the difference-engine compiler team
• Cut build times by 60%

Software Engineer, Babbage & Co    Jun 2016 – Feb 2021
• Built the analytical pipeline
• Mentored 4 engineers

Education
BSc in Mathematics, University of London, 2012 – 2016, GPA: 3.9

Skills
TypeScript, Rust, Compiler design, Numerical methods
`;

describe("normalizeCvText", () => {
  it("unifies bullets and de-hyphenates line breaks", () => {
    expect(normalizeCvText("• foo\ncompil-\ners")).toBe("- foo\ncompilers");
  });
});

describe("segmentSections", () => {
  it("splits on heading lexicon", () => {
    const names = segmentSections(normalizeCvText(SAMPLE)).map((s) => s.name);
    expect(names).toEqual(["header", "summary", "experience", "education", "skills"]);
  });
});

describe("parseCvText", () => {
  const patch = parseCvText(SAMPLE);
  const p = patch.profile;

  it("extracts the contact block", () => {
    expect(p.basics.email).toBe("ada.lovelace@example.com");
    expect(p.basics.phone).toContain("+44");
    expect(p.links.linkedin).toBe("https://linkedin.com/in/ada-lovelace");
    expect(p.links.github).toBe("https://github.com/ada");
  });

  it("guesses the name from the header", () => {
    expect(p.basics.firstName).toBe("Ada");
    expect(p.basics.lastName).toBe("Lovelace");
  });

  it("extracts work entries with ISO dates and current flag", () => {
    expect(p.work).toHaveLength(2);
    const [w0, w1] = p.work;
    expect(w0?.title).toBe("Staff Software Engineer");
    expect(w0?.company).toBe("Analytical Engines Ltd");
    expect(w0?.start).toBe("2021-03");
    expect(w0?.current).toBe(true);
    expect(w0?.description).toContain("difference-engine");
    expect(w1?.start).toBe("2016-06");
    expect(w1?.end).toBe("2021-02");
    expect(w1?.current).toBe(false);
  });

  it("extracts education with GPA", () => {
    expect(p.education[0]?.school).toContain("University of London");
    expect(p.education[0]?.degree.toLowerCase()).toContain("bsc");
    expect(p.education[0]?.gpa).toBe("3.9");
  });

  it("extracts skills", () => {
    expect(p.skills).toContain("TypeScript");
    expect(p.skills).toContain("Compiler design");
  });

  it("records evidence snippets for review UI", () => {
    expect(patch.evidence["basics.email"]?.snippet).toContain("ada.lovelace@example.com");
    expect(patch.evidence["work[0]"]).toBeDefined();
  });

  it("warns on scanned/empty documents", () => {
    const empty = parseCvText("short");
    expect(empty.warnings.length).toBeGreaterThan(0);
  });
});

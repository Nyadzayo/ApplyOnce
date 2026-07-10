import { describe, expect, it } from "vitest";
import { parseCvText } from "@shared/cvparse";

// Regression fixture: real-world resume layout that broke the first parser.
// Traits: name + contact labels on one line, company/location line ABOVE a
// "Title DateRange" line, lone bullet-marker lines, wrapped bullet
// continuations, school above the degree line, "Present" in education, links
// as PDF annotations (appended after the text) and bare github.com paths.

const SAMPLE = `
Kelvin Example Email : kelvin.example16@gmail.com
LinkedIn Mobile : +27761891101

Experience
Prime Circle Finance Cape Town, SA
•
Software Engineer Oct 2025 - Present
◦ Lead Engineer : Rebuilt the platform API into a multi-tenant backbone powering lending, OTC,
crypto, investments, and cross-border payments for 25+ organizations.
◦ DDD + hexagonal architecture : Redesigned the system with bounded contexts per capability and a
ports-and-adapters layer isolating providers from the domain.
United Nations Development Programme (UNDP) Remote
•
Agentic AI Training Contributor (Volunteer) Oct 2025 – Feb 2026
◦ Agent Design : Implement agent design patterns (planning, retrieval, and API tool use) for
real-world workflows supporting SDG-aligned projects.
Community Dental Partners Remote
•
Software Developer May 2021 – Jun 2025
◦ ML Appointment Prediction : Built a patient appointment show-up prediction model, improving
show-up rate by 40%.

Projects
• Moderation API (FastAPI + Redis) : Layered moderation service. GitHub: github.com/example/moderation-api

Skills
• Languages : Python, TypeScript, JavaScript Frontend : React
• Backend : Django/DRF, FastAPI, Node.js

Education
University of Cape Town Cape Town, SA
•
Msc in Artificial Intelligence; Feb. 2025 – Present
University of Zimbabwe Harare, Zimbabwe
•
BSc. Honours Computer Science; GPA: 3.5 Feb. 2017 – May. 2021

https://www.linkedin.com/in/kelvin-example
https://github.com/example
`;

describe("parseCvText — two-line company/title layout", () => {
  const patch = parseCvText(SAMPLE);
  const p = patch.profile;

  it("finds the name even when it shares a line with contact labels", () => {
    expect(p.basics.firstName).toBe("Kelvin");
    expect(p.basics.lastName).toBe("Example");
    expect(patch.warnings.join(" ")).not.toContain("name");
  });

  it("pairs title/company across separate lines and strips location debris", () => {
    const w0 = p.work[0];
    expect(w0?.title).toBe("Software Engineer");
    expect(w0?.company).toContain("Prime Circle Finance");
    expect(w0?.company).not.toBe("SA");
    expect(w0?.start).toBe("2025-10");
    expect(w0?.current).toBe(true);
  });

  it("does not turn wrapped bullet continuations into titles/companies", () => {
    for (const w of p.work) {
      expect(w.title.toLowerCase()).not.toContain("mechanisms");
      expect(w.company).not.toMatch(/\.$/);
    }
    const undp = p.work.find((w) => /united nations|undp/i.test(w.company));
    expect(undp).toBeDefined();
    expect(undp?.company).not.toMatch(/remote/i);
  });

  it("keeps wrapped continuation text inside bullet descriptions", () => {
    expect(p.work[0]?.description).toContain("cross-border payments");
  });

  it("attaches the degree to the school line ABOVE it", () => {
    const msc = p.education.find((e) => /msc/i.test(e.degree));
    expect(msc?.school).toContain("University of Cape Town");
    expect(msc?.field).toBe("Artificial Intelligence");
    expect(msc?.end).toBe(""); // Present → ongoing
    const bsc = p.education.find((e) => /bsc/i.test(e.degree));
    expect(bsc?.school).toContain("University of Zimbabwe");
    expect(bsc?.gpa).toBe("3.5");
    expect(bsc?.field.toLowerCase()).toContain("computer science");
  });

  it("prefers profile-root links from annotations over repo URLs", () => {
    expect(p.links.linkedin).toBe("https://www.linkedin.com/in/kelvin-example");
    expect(p.links.github).toBe("https://github.com/example");
  });

  it("strips category labels from skills", () => {
    expect(p.skills).toContain("Python");
    expect(p.skills).toContain("React");
    expect(p.skills.join(",")).not.toMatch(/Languages|Backend :/);
  });
});

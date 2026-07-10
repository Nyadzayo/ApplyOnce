import { describe, expect, it } from "vitest";
import {
  hasTemplatePlaceholders,
  parseJobPageTitle,
  substituteTemplate,
} from "@shared/page-context";
import { mapField, type MapperContext } from "@shared/mapper";
import { emptyProfile, type FieldSignal, type SavedAnswer } from "@shared/types";

describe("parseJobPageTitle", () => {
  it("greenhouse pattern", () => {
    expect(parseJobPageTitle("Job Application for Staff Engineer at Stripe", "greenhouse"))
      .toEqual({ role: "Staff Engineer", company: "Stripe" });
  });
  it("role at company", () => {
    expect(parseJobPageTitle("Backend Developer at Acme Corp", "generic"))
      .toEqual({ role: "Backend Developer", company: "Acme Corp" });
  });
  it("lever ordering: company - role", () => {
    expect(parseJobPageTitle("Acme - Frontend Engineer", "lever"))
      .toEqual({ company: "Acme", role: "Frontend Engineer" });
  });
  it("role-word side wins regardless of order", () => {
    expect(parseJobPageTitle("Product Designer | Umbrella Inc", "generic"))
      .toEqual({ role: "Product Designer", company: "Umbrella Inc" });
    expect(parseJobPageTitle("Umbrella Inc | Product Designer", "generic"))
      .toEqual({ role: "Product Designer", company: "Umbrella Inc" });
  });
  it("strips careers/jobs noise", () => {
    expect(parseJobPageTitle("Data Analyst at Initech - Careers", "generic").company)
      .toBe("Initech");
  });
  it("empty title → empty context", () => {
    expect(parseJobPageTitle("", "generic")).toEqual({});
  });
});

describe("substituteTemplate", () => {
  it("replaces placeholders", () => {
    expect(
      substituteTemplate("I'm excited to join {company} as a {role}.", {
        company: "Acme",
        role: "Engineer",
      }),
    ).toBe("I'm excited to join Acme as a Engineer.");
  });
  it("returns null when a needed value is missing", () => {
    expect(substituteTemplate("I love {company}", {})).toBeNull();
  });
  it("detects placeholders case-insensitively", () => {
    expect(hasTemplatePlaceholders("Dear {Company} team")).toBe(true);
    expect(hasTemplatePlaceholders("No placeholders")).toBe(false);
  });
});

describe("mapper + templates", () => {
  const sig: FieldSignal = {
    ref: "top:f0",
    framePath: "top",
    selector: "#why",
    kind: "textarea",
    label: "Why do you want to work here?",
    labelSource: "label-for",
    required: false,
    visible: true,
    inShadow: false,
    widgetHint: "native",
  };
  const answer: SavedAnswer = {
    id: "a1",
    questionText: "Why do you want to work here?",
    normalizedKey: "why do you want to work here",
    aliasKeys: [],
    answer: "I've admired {company}'s work and the {role} role fits my background.",
    timesUsed: 0,
    lastUsedAt: 0,
    createdAt: 0,
  };
  const base: MapperContext = {
    ats: "generic",
    profile: emptyProfile(),
    savedAnswers: [answer],
    documents: [],
    dateFormatHint: "MM/DD/YYYY",
  };

  it("fills with substituted values when context is known", () => {
    const d = mapField(sig, {
      ...base,
      pageContext: { company: "Acme", role: "Staff Engineer" },
    });
    expect(d.value).toBe(
      "I've admired Acme's work and the Staff Engineer role fits my background.",
    );
    expect(d.action).toBe("fill");
  });

  it("routes to review when the company/role is unknown — never fills a literal placeholder", () => {
    const d = mapField(sig, base);
    expect(d.action).toBe("review");
    expect(d.reason).toContain("template");
  });
});

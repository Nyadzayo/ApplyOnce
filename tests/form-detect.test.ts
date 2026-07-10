import { describe, expect, it } from "vitest";
import { detectApplicationForm } from "@shared/form-detect";
import type { FieldSignal } from "@shared/types";

function sig(partial: Partial<FieldSignal>): FieldSignal {
  return {
    ref: `top:f${Math.floor(Math.random() * 1e6)}`,
    framePath: "top",
    selector: "#x",
    kind: "text",
    label: "",
    labelSource: "label-for",
    required: false,
    visible: true,
    inShadow: false,
    widgetHint: "native",
    ...partial,
  };
}

const applicationSignals = [
  sig({ label: "First name" }),
  sig({ label: "Last name" }),
  sig({ label: "Email", kind: "email" }),
  sig({ label: "Phone", kind: "tel" }),
  sig({ label: "Resume/CV", kind: "file", accept: ".pdf,.docx" }),
  sig({ label: "Are you legally authorized to work in the US?", kind: "radio_group" }),
];

describe("detectApplicationForm", () => {
  it("recognizes a classic application form", () => {
    const r = detectApplicationForm({
      url: "https://boards.greenhouse.io/acme/jobs/123",
      title: "Software Engineer — Acme",
      signals: applicationSignals,
    });
    expect(r.isApplication).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(8);
  });

  it("recognizes generic career pages without ATS URL", () => {
    const r = detectApplicationForm({
      url: "https://acme.example/careers/apply/analyst",
      title: "Careers",
      signals: applicationSignals,
    });
    expect(r.isApplication).toBe(true);
  });

  it("rejects a login form", () => {
    const r = detectApplicationForm({
      url: "https://app.example/login",
      title: "Sign in",
      signals: [
        sig({ label: "Email", kind: "email" }),
        sig({ label: "Password" }),
      ],
    });
    expect(r.isApplication).toBe(false);
  });

  it("rejects a checkout form even with name/email fields", () => {
    const r = detectApplicationForm({
      url: "https://shop.example/checkout",
      title: "Checkout",
      signals: [
        sig({ label: "First name" }),
        sig({ label: "Last name" }),
        sig({ label: "Email", kind: "email" }),
        sig({ label: "Card number" }),
        sig({ label: "CVV" }),
      ],
    });
    expect(r.isApplication).toBe(false);
  });

  it("rejects a newsletter signup", () => {
    const r = detectApplicationForm({
      url: "https://blog.example/subscribe",
      title: "Newsletter",
      signals: [sig({ label: "Email", kind: "email" }), sig({ label: "Name" })],
    });
    expect(r.isApplication).toBe(false);
  });

  it("needs at least two visible fields", () => {
    const r = detectApplicationForm({
      url: "https://jobs.example/apply",
      title: "Apply",
      signals: [sig({ label: "Resume", kind: "file", visible: true })],
    });
    expect(r.isApplication).toBe(false);
  });

  it("a resume upload + email + apply URL is enough", () => {
    const r = detectApplicationForm({
      url: "https://acme.example/jobs/apply",
      title: "Acme",
      signals: [
        sig({ label: "Email address", kind: "email" }),
        sig({ label: "Upload your CV", kind: "file", accept: ".pdf" }),
      ],
    });
    expect(r.isApplication).toBe(true);
  });
});

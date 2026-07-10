import { describe, expect, it } from "vitest";
import {
  formatDateForInput,
  fuzzyScore,
  jaccard,
  normalizeLabel,
  resolveOption,
  sameMeaning,
} from "@shared/normalize";

describe("normalizeLabel", () => {
  it("lowercases, strips punctuation and required markers", () => {
    expect(normalizeLabel("First Name *")).toBe("first name");
    expect(normalizeLabel("  Email Address: (required) ")).toBe("email address");
    expect(normalizeLabel("LinkedIn URL")).toBe("linkedin url");
  });
});

describe("similarity", () => {
  it("jaccard on token sets", () => {
    expect(jaccard("first name", "first name")).toBe(1);
    expect(jaccard("first name", "last name")).toBeCloseTo(1 / 3);
  });
  it("fuzzyScore catches reworded questions", () => {
    const a = "why do you want to work here";
    const b = "why would you like to work at our company";
    expect(fuzzyScore(a, b)).toBeGreaterThan(0.3);
    expect(fuzzyScore(a, a)).toBe(1);
  });
});

describe("sameMeaning / aliases", () => {
  it("resolves country aliases", () => {
    expect(sameMeaning("United States", "USA")).toBe(true);
    expect(sameMeaning("U.S.", "United States of America")).toBe(true);
    expect(sameMeaning("United States", "United Kingdom")).toBe(false);
  });
  it("resolves yes/no and decline variants", () => {
    expect(sameMeaning("Yes", "yes")).toBe(true);
    expect(sameMeaning("Prefer not to say", "Decline to self-identify")).toBe(true);
  });
});

describe("resolveOption", () => {
  const options = [
    { value: "us", text: "United States" },
    { value: "uk", text: "United Kingdom" },
    { value: "de", text: "Germany" },
  ];
  it("exact alias match", () => {
    const m = resolveOption("USA", options);
    expect(m?.option.value).toBe("us");
    expect(m?.quality).toBe("exact");
  });
  it("unique substring match at reduced quality", () => {
    const m = resolveOption("Kingdom", options);
    expect(m?.option.value).toBe("uk");
    expect(m?.quality).toBe("substring");
  });
  it("ambiguous substring → null", () => {
    const m = resolveOption("United", options);
    expect(m).toBeNull();
  });
  it("never invents an option", () => {
    expect(resolveOption("France", options)).toBeNull();
  });
});

describe("formatDateForInput", () => {
  it("US format", () => {
    expect(formatDateForInput("2023-04", "MM/DD/YYYY")).toBe("04/01/2023");
  });
  it("EU format", () => {
    expect(formatDateForInput("2023-04-15", "DD/MM/YYYY")).toBe("15/04/2023");
  });
  it("ISO for date inputs", () => {
    expect(formatDateForInput("2023-04", "YYYY-MM-DD")).toBe("2023-04-01");
  });
  it("month/year only", () => {
    expect(formatDateForInput("2023-04", "MM/YYYY")).toBe("04/2023");
  });
  it("passes through non-ISO values", () => {
    expect(formatDateForInput("April 2023", "MM/DD/YYYY")).toBe("April 2023");
  });
});

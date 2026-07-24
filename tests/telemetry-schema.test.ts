import { describe, expect, it } from "vitest";
import {
  EVENT_SCHEMA,
  FORBIDDEN_PARAM_KEYS,
  MAX_STRING_LENGTH,
  sanitizeParams,
  stripUrls,
} from "@shared/telemetry-schema";

describe("telemetry schema", () => {
  it("rejects unknown events with null", () => {
    expect(sanitizeParams("made_up_event", { ats: "lever" })).toBeNull();
  });

  it("drops params not in the event's allowlist", () => {
    const clean = sanitizeParams("fill_completed", {
      ats: "greenhouse",
      filled: 12,
      url: "https://boards.greenhouse.io/acme/jobs/1",
      email: "a@b.c",
      answer: "secret",
    });
    expect(clean).toEqual({ ats: "greenhouse", filled: 12 });
  });

  it("no event allowlist contains a forbidden key", () => {
    for (const [event, params] of Object.entries(EVENT_SCHEMA)) {
      for (const p of params) {
        expect(FORBIDDEN_PARAM_KEYS.has(p), `${event}.${p}`).toBe(false);
      }
    }
  });

  it("drops objects, arrays, NaN and Infinity", () => {
    const clean = sanitizeParams("fill_completed", {
      filled: Number.NaN,
      field_count: Number.POSITIVE_INFINITY,
      // @ts-expect-error deliberately malformed
      ats: { nested: "x" },
    });
    expect(clean).toEqual({});
  });

  it("truncates long strings", () => {
    const clean = sanitizeParams("extension_error", {
      context: "fill",
      message: "x".repeat(500),
    });
    expect((clean?.message as string).length).toBe(MAX_STRING_LENGTH);
  });

  it("strips URLs out of error messages", () => {
    const clean = sanitizeParams("extension_error", {
      context: "scan",
      message:
        "Cannot access contents of url https://jobs.lever.co/acme/123?tok=abc. Extension manifest must request permission",
    });
    expect(clean?.message).not.toContain("lever.co");
    expect(clean?.message).toContain("<url>");
  });

  it("stripUrls handles chrome-extension and file schemes", () => {
    expect(stripUrls("at chrome-extension://abc/bg.js:1:1")).not.toContain("abc");
    expect(stripUrls("open file:///Users/jane/resume.pdf failed")).not.toContain("jane");
  });

  it("booleans become strings, numbers pass through", () => {
    const clean = sanitizeParams("resume_imported", {
      method: "file_pdf",
      warnings: 2,
    });
    expect(clean).toEqual({ method: "file_pdf", warnings: 2 });
  });
});

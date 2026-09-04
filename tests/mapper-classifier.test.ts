import { describe, expect, it } from "vitest";
import { mapField, type MapperContext } from "@shared/mapper";
import { emptyProfile, type FieldSignal } from "@shared/types";
import type { ClassifierHint } from "@shared/intent-map";

// Tier 5.5 (PLAN.md Part 9 section 4): the on-device classifier proposes a
// canonical key for fields nothing else mapped. It never bypasses a gate and
// never produces a silent fill.

function sig(partial: Partial<FieldSignal>): FieldSignal {
  return {
    ref: "top:f0",
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

function ctx(hints: Record<string, ClassifierHint>, explicit: Partial<Record<string, string>> = {}): MapperContext {
  const profile = emptyProfile();
  profile.basics.firstName = "Ada";
  profile.basics.lastName = "Lovelace";
  profile.links.linkedin = "https://linkedin.com/in/ada";
  profile.location.city = "London";
  profile.location.country = "United Kingdom";
  Object.assign(profile.explicit, explicit);
  return {
    ats: "generic",
    profile,
    savedAnswers: [],
    documents: [],
    dateFormatHint: "MM/DD/YYYY",
    classifier: new Map(Object.entries(hints)),
  };
}

describe("classifier tier", () => {
  it("maps an otherwise-unmapped label through its predicted key, as amber", () => {
    const d = mapField(
      sig({ label: "Where can we find your professional profile online?" }),
      ctx({ "top:f0": { intent: "linkedin_url", score: 0.93, key: "links.linkedin" } }),
    );
    expect(d.canonical).toBe("links.linkedin");
    expect(d.source).toBe("classifier");
    expect(d.action).toBe("fill-amber");
    expect(d.confidence).toBeLessThan(0.9);
  });

  it("abstains below the threshold and when the intent has no key", () => {
    const low = mapField(
      sig({ label: "Professional profile" }),
      ctx({ "top:f0": { intent: "linkedin_url", score: 0.79, key: "links.linkedin" } }),
    );
    expect(low.action).toBe("abstain");
    expect(low.canonical).toBeUndefined();
    const nokey = mapField(
      sig({ label: "What should we call you?" }),
      ctx({ "top:f0": { intent: "preferred_name", score: 0.97 } }),
    );
    expect(nokey.action).toBe("abstain");
  });

  it("never outranks the deterministic tiers", () => {
    const d = mapField(
      sig({ label: "First name" }),
      ctx({ "top:f0": { intent: "last_name", score: 0.99, key: "basics.lastName" } }),
    );
    expect(d.canonical).toBe("basics.firstName");
    expect(d.source).toBe("lexicon");
  });

  it("keeps the hard gates: EEO from the model still needs an explicit setting", () => {
    const hint = { "top:f0": { intent: "eeo_veteran_status", score: 0.95, key: "eeo.veteran" as const } };
    const withoutSetting = mapField(sig({ label: "Have you served in the armed forces of any country?" }), ctx(hint));
    expect(withoutSetting.action).toBe("review");
    expect(withoutSetting.canonical).toBe("eeo.veteran");
    const withSetting = mapField(
      sig({ label: "Have you served in the armed forces of any country?" }),
      ctx(hint, { veteran: "I am not a protected veteran" }),
    );
    expect(["fill", "fill-amber", "review"]).toContain(withSetting.action);
    expect(withSetting.action).not.toBe("abstain");
  });

  it("keeps option safety: a select with no matching option is not filled", () => {
    const d = mapField(
      sig({
        label: "Which country do you call home?",
        kind: "select",
        options: [
          { value: "fr", text: "France" },
          { value: "de", text: "Germany" },
        ],
      }),
      ctx({ "top:f0": { intent: "current_location", score: 0.9, key: "location.full" } }),
    );
    expect(d.action).not.toBe("fill");
    expect(d.action).not.toBe("fill-amber");
  });
});

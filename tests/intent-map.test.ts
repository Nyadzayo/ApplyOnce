import { describe, expect, it } from "vitest";
import { riskClassOf } from "@shared/canonical-fields";
import {
  CLASSIFIER_THRESHOLD,
  hintFromLogits,
  INTENT_TO_KEY,
  serializeForClassifier,
  softmax,
} from "@shared/intent-map";

// Classifier glue (PLAN.md Part 9 section 4): the serialization must match
// the training kernel byte for byte, and every mapped intent must land on a
// real canonical key so the risk gates apply.

describe("serializeForClassifier", () => {
  it("reproduces the training-time format", () => {
    expect(serializeForClassifier("First Name", "text")).toBe("First Name [TYPE=input_text]");
    expect(serializeForClassifier("Gender", "select", ["Male", "Female", "Decline"])).toBe(
      "Gender [TYPE=multi_value_single_select] [OPTIONS=Male | Female | Decline]",
    );
    expect(serializeForClassifier("Resume", "file")).toBe("Resume [TYPE=input_file]");
    expect(serializeForClassifier("Bare")).toBe("Bare");
  });

  it("caps options at eight, like the kernel", () => {
    const opts = Array.from({ length: 12 }, (_, i) => `o${i}`);
    expect(serializeForClassifier("Q", "multiselect", opts)).toBe(
      "Q [TYPE=multi_value_multi_select] [OPTIONS=o0 | o1 | o2 | o3 | o4 | o5 | o6 | o7]",
    );
  });
});

describe("intent to canonical key", () => {
  it("only maps onto keys the ontology defines", () => {
    for (const key of Object.values(INTENT_TO_KEY)) {
      expect(key).toMatch(/^(basics|location|links|preferences|eeo|education|work|attachments|skills)\.[a-zA-Z]+$/);
      expect(() => riskClassOf(key), key).not.toThrow();
    }
  });

  it("leaves intents the profile cannot answer unmapped", () => {
    for (const intent of ["preferred_name", "address", "employment_history", "remote_onsite_preference", "other", "privacy_policy_consent"]) {
      expect(INTENT_TO_KEY[intent]).toBeUndefined();
    }
  });
});

describe("hintFromLogits", () => {
  it("returns the argmax with its softmax probability and mapped key", () => {
    const labels = ["first_name", "other", "linkedin_url"];
    const hint = hintFromLogits([0.1, 0.2, 4.0], labels);
    expect(hint.intent).toBe("linkedin_url");
    expect(hint.key).toBe("links.linkedin");
    expect(hint.score).toBeCloseTo(softmax([0.1, 0.2, 4.0])[2]!, 6);
    expect(hint.score).toBeGreaterThan(CLASSIFIER_THRESHOLD);
  });

  it("flat logits fall below the threshold", () => {
    const hint = hintFromLogits([0, 0, 0, 0], ["a", "b", "c", "d"]);
    expect(hint.score).toBeLessThan(CLASSIFIER_THRESHOLD);
  });
});

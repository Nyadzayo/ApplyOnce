import { describe, expect, it } from "vitest";
import { findDuplicate, withAlias } from "@storage/answers";
import type { SavedAnswer } from "@shared/types";

const mk = (q: string, key: string, aliases: string[] = []): SavedAnswer => ({
  id: `id-${key}`,
  questionText: q,
  normalizedKey: key,
  aliasKeys: aliases,
  answer: "42",
  timesUsed: 0,
  lastUsedAt: 0,
  createdAt: 0,
});

describe("findDuplicate", () => {
  const existing = [mk("What is your notice period?", "what is your notice period")];

  it("exact normalized key", () => {
    expect(findDuplicate("What is your notice period ?", existing)?.id).toBe(
      "id-what is your notice period",
    );
  });

  it("near-identical phrasing dedupes at ≥0.92 trigram", () => {
    expect(findDuplicate("What is your notice period", existing)).not.toBeNull();
  });

  it("different question does not dedupe", () => {
    expect(findDuplicate("What are your salary expectations?", existing)).toBeNull();
  });

  it("alias keys count as exact", () => {
    const withA = [mk("Q", "q key", ["current notice period"])];
    expect(findDuplicate("Current notice period", withA)).not.toBeNull();
  });
});

describe("withAlias", () => {
  it("adds new phrasings once", () => {
    const a = mk("Q", "base key");
    const a2 = withAlias(a, "Another phrasing");
    expect(a2.aliasKeys).toEqual(["another phrasing"]);
    expect(withAlias(a2, "another PHRASING!").aliasKeys).toEqual(["another phrasing"]);
  });
});

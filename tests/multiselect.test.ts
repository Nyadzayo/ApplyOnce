// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { scanDocument } from "../src/content/scan/scanner";
import { executeInstructions, undoLastFill } from "../src/content/fill/filler";
import { mapField, type MapperContext } from "@shared/mapper";
import { emptyProfile, type FieldSignal, type FillInstruction } from "@shared/types";

const deps = () => ({
  registry: new Map<string, Element>(),
  pauseObserver: () => {},
  resumeObserver: () => {},
});

function ctx(partial: Partial<MapperContext> = {}): MapperContext {
  const profile = emptyProfile();
  profile.basics.email = "a@b.c";
  profile.skills = ["TypeScript", "Rust"];
  profile.explicit.salaryMin = "$140,000";
  profile.explicit.salaryMax = "$160,000";
  return {
    ats: "generic",
    profile,
    savedAnswers: [],
    documents: [],
    dateFormatHint: "MM/DD/YYYY",
    ...partial,
  };
}

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

describe("scanner: multiselect shapes", () => {
  it("select[multiple] becomes kind multiselect", () => {
    document.body.innerHTML = `
      <label for="t">Technologies</label>
      <select id="t" multiple><option value="ts">TypeScript</option><option value="go">Go</option></select>`;
    const { signals } = scanDocument(document, { ats: "generic", framePath: "top", assumeLayout: true });
    expect(signals[0]?.kind).toBe("multiselect");
    expect(signals[0]?.options).toHaveLength(2);
  });

  it("checkbox groups collapse; lone checkboxes stay individual", () => {
    document.body.innerHTML = `
      <fieldset><legend>Which skills?</legend>
        <label><input type="checkbox" name="sk[]" value="ts" /> TypeScript</label>
        <label><input type="checkbox" name="sk[]" value="go" /> Go</label>
      </fieldset>
      <label><input type="checkbox" name="consent" /> I agree to the terms</label>`;
    const { signals } = scanDocument(document, { ats: "generic", framePath: "top", assumeLayout: true });
    const group = signals.find((s) => s.kind === "multiselect");
    const lone = signals.find((s) => s.kind === "checkbox");
    expect(group?.label).toBe("Which skills?");
    expect(group?.options?.map((o) => o.text)).toEqual(["TypeScript", "Go"]);
    expect(group?.memberSelectors).toHaveLength(2);
    // regression: member selectors must be DISTINCT — a bare [name=...] would
    // resolve every member to the first checkbox (found by browser e2e)
    expect(new Set(group?.memberSelectors).size).toBe(2);
    expect(group?.memberSelectors?.[0]).toContain('[value="ts"]');
    expect(group?.memberSelectors?.[1]).toContain('[value="go"]');
    expect(lone).toBeDefined();
  });
});

describe("mapper: multiselect + salary range + number inputs", () => {
  it("matches profile skills against multiselect options (subset, verbatim only)", () => {
    const d = mapField(
      sig({
        kind: "multiselect",
        label: "Which of the following skills do you have?",
        options: [
          { value: "ts", text: "TypeScript" },
          { value: "rust", text: "Rust" },
          { value: "go", text: "Go" },
        ],
      }),
      ctx(),
    );
    expect(d.canonical).toBe("skills.list");
    expect(d.optionsMulti?.map((o) => o.value).sort()).toEqual(["rust", "ts"]);
    expect(d.action === "fill" || d.action === "fill-amber").toBe(true);
  });

  it("reviews when no skill matches any option", () => {
    const d = mapField(
      sig({
        kind: "multiselect",
        label: "Skills",
        options: [{ value: "cobol", text: "COBOL" }],
      }),
      ctx(),
    );
    expect(d.action).toBe("review");
  });

  it("salary min/max map from explicit settings, gated amber, digits-only on number inputs", () => {
    const dmin = mapField(sig({ kind: "number", label: "Minimum salary (USD)" }), ctx());
    expect(dmin.canonical).toBe("preferences.salaryMin");
    expect(dmin.value).toBe("140000");
    expect(dmin.action).toBe("fill-amber");
    const dmax = mapField(sig({ kind: "number", label: "Maximum salary (USD)" }), ctx());
    expect(dmax.canonical).toBe("preferences.salaryMax");
    expect(dmax.value).toBe("160000");
  });

  it("salary range without explicit settings goes to review", () => {
    const c = ctx();
    c.profile.explicit.salaryMin = null;
    const d = mapField(sig({ kind: "number", label: "Minimum salary" }), c);
    expect(d.action).toBe("review");
  });
});

describe("filler: multi payloads + undo", () => {
  const base = { framePath: "top", amber: false, widgetHint: "native" as const };

  it("selects multiple options and undoes them", async () => {
    document.body.innerHTML = `
      <select id="t" multiple>
        <option value="ts">TypeScript</option><option value="rust">Rust</option><option value="java">Java</option>
      </select>`;
    const inst: FillInstruction = {
      ...base,
      ref: "r1",
      selector: "#t",
      kind: "multiselect",
      payload: { type: "multi", options: [{ value: "ts", text: "TypeScript" }, { value: "rust", text: "Rust" }] },
    };
    const d = deps();
    const [o] = await executeInstructions([inst], d);
    expect(o?.verified).toBe(true);
    const el = document.getElementById("t") as HTMLSelectElement;
    expect([...el.selectedOptions].map((x) => x.value).sort()).toEqual(["rust", "ts"]);
    await undoLastFill(d);
    expect(el.selectedOptions.length).toBe(0);
  });

  it("checks matching group members without unchecking user picks, and undo restores", async () => {
    document.body.innerHTML = `
      <label><input type="checkbox" name="sk" value="ts" /> TypeScript</label>
      <label><input type="checkbox" name="sk" value="go" checked /> Go</label>
      <label><input type="checkbox" name="sk" value="py" /> Python</label>`;
    const inst: FillInstruction = {
      ...base,
      ref: "r1",
      selector: 'input[name="sk"][value="ts"]',
      memberSelectors: ['input[name="sk"][value="ts"]', 'input[name="sk"][value="go"]', 'input[name="sk"][value="py"]'],
      kind: "multiselect",
      payload: { type: "multi", options: [{ value: "ts", text: "TypeScript" }] },
    };
    const d = deps();
    const [o] = await executeInstructions([inst], d);
    expect(o?.verified).toBe(true);
    const box = (v: string) => document.querySelector(`input[value="${v}"]`) as HTMLInputElement;
    expect(box("ts").checked).toBe(true);
    expect(box("go").checked).toBe(true); // user's pre-existing pick untouched
    await undoLastFill(d);
    expect(box("ts").checked).toBe(false);
    expect(box("go").checked).toBe(true); // restored to pre-fill state
  });
});

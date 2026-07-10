// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { executeInstructions, undoLastFill } from "../src/content/fill/filler";
import type { FillInstruction } from "@shared/types";

const deps = () => ({
  registry: new Map<string, Element>(),
  pauseObserver: () => {},
  resumeObserver: () => {},
});

const base = { framePath: "top", amber: false, widgetHint: "native" as const };

describe("undoLastFill", () => {
  it("restores text, select, radio and checkbox to their pre-fill state", async () => {
    document.body.innerHTML = `
      <input id="fn" type="text" value="Old Name" />
      <select id="c"><option value="">Pick</option><option value="US">United States</option></select>
      <label><input type="radio" name="s" value="1" /> Yes</label>
      <label><input type="radio" name="s" value="0" /> No</label>
      <input type="checkbox" id="cb" />
    `;
    const instructions: FillInstruction[] = [
      { ...base, ref: "r1", selector: "#fn", kind: "text", payload: { type: "text", value: "Ada" } },
      { ...base, ref: "r2", selector: "#c", kind: "select", payload: { type: "option", optionText: "United States", optionValue: "US" } },
      {
        ...base, ref: "r3", selector: 'input[name="s"][value="1"]',
        memberSelectors: ['input[name="s"][value="1"]', 'input[name="s"][value="0"]'],
        kind: "radio_group", payload: { type: "option", optionText: "Yes", optionValue: "1" },
      },
      { ...base, ref: "r4", selector: "#cb", kind: "checkbox", payload: { type: "check", checked: true } },
    ];
    const d = deps();
    const outcomes = await executeInstructions(instructions, d);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("Ada");
    expect((document.getElementById("c") as HTMLSelectElement).value).toBe("US");
    expect((document.querySelector('input[value="1"]') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("cb") as HTMLInputElement).checked).toBe(true);

    const restored = await undoLastFill(d);
    expect(restored).toBe(4);
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("Old Name");
    expect((document.getElementById("c") as HTMLSelectElement).value).toBe("");
    expect((document.querySelector('input[value="1"]') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('input[value="0"]') as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById("cb") as HTMLInputElement).checked).toBe(false);
  });

  it("second undo is a no-op (receipt consumed)", async () => {
    document.body.innerHTML = `<input id="fn" type="text" />`;
    const d = deps();
    await executeInstructions(
      [{ ...base, ref: "r1", selector: "#fn", kind: "text", payload: { type: "text", value: "x" } }],
      d,
    );
    expect(await undoLastFill(d)).toBe(1);
    expect(await undoLastFill(d)).toBe(0);
  });
});

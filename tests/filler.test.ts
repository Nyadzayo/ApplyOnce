// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { executeInstructions } from "../src/content/fill/filler";
import { b64encode } from "@shared/messages";
import type { FillInstruction } from "@shared/types";

const deps = () => ({
  registry: new Map<string, Element>(),
  pauseObserver: () => {},
  resumeObserver: () => {},
});

const base = {
  ref: "top:f0",
  framePath: "top",
  amber: false,
  widgetHint: "native" as const,
};

describe("filler", () => {
  it("fills text inputs via native setter and verifies readback", async () => {
    document.body.innerHTML = `<input id="fn" type="text" />`;
    const inst: FillInstruction = {
      ...base,
      selector: "#fn",
      kind: "text",
      payload: { type: "text", value: "Ada" },
    };
    const [o] = await executeInstructions([inst], deps());
    expect(o?.ok).toBe(true);
    expect(o?.verified).toBe(true);
    expect((document.getElementById("fn") as HTMLInputElement).value).toBe("Ada");
  });

  it("dispatches input/change events (framework compatibility)", async () => {
    document.body.innerHTML = `<input id="fn" type="text" />`;
    const el = document.getElementById("fn") as HTMLInputElement;
    const events: string[] = [];
    for (const t of ["input", "change", "blur"]) el.addEventListener(t, () => events.push(t));
    await executeInstructions(
      [{ ...base, selector: "#fn", kind: "text", payload: { type: "text", value: "x" } }],
      deps(),
    );
    expect(events).toContain("input");
    expect(events).toContain("change");
  });

  it("selects options by value with change event, fails on unknown option", async () => {
    document.body.innerHTML = `
      <select id="c"><option value="">Pick</option><option value="US">United States</option></select>`;
    const ok = await executeInstructions(
      [{
        ...base,
        selector: "#c",
        kind: "select",
        payload: { type: "option", optionText: "United States", optionValue: "US" },
      }],
      deps(),
    );
    expect(ok[0]?.verified).toBe(true);
    expect((document.getElementById("c") as HTMLSelectElement).value).toBe("US");

    const bad = await executeInstructions(
      [{
        ...base,
        selector: "#c",
        kind: "select",
        payload: { type: "option", optionText: "France", optionValue: "FR" },
      }],
      deps(),
    );
    expect(bad[0]?.ok).toBe(false);
  });

  it("clicks the matching radio in a group", async () => {
    document.body.innerHTML = `
      <label><input type="radio" name="s" value="1" /> Yes</label>
      <label><input type="radio" name="s" value="0" /> No</label>`;
    const [o] = await executeInstructions(
      [{
        ...base,
        selector: 'input[name="s"][value="1"]',
        memberSelectors: ['input[name="s"][value="1"]', 'input[name="s"][value="0"]'],
        kind: "radio_group",
        payload: { type: "option", optionText: "No", optionValue: "0" },
      }],
      deps(),
    );
    expect(o?.verified).toBe(true);
    const no = document.querySelector('input[value="0"]') as HTMLInputElement;
    expect(no.checked).toBe(true);
  });

  it("attaches files through DataTransfer", async () => {
    document.body.innerHTML = `<input type="file" id="resume" />`;
    const data = b64encode(new TextEncoder().encode("PDFBYTES").buffer as ArrayBuffer);
    const [o] = await executeInstructions(
      [{
        ...base,
        selector: "#resume",
        kind: "file",
        payload: { type: "file", fileName: "ada.pdf", mime: "application/pdf", dataB64: data },
      }],
      deps(),
    );
    expect(o?.ok).toBe(true);
    expect(o?.verified).toBe(true);
    const input = document.getElementById("resume") as HTMLInputElement;
    expect(input.files?.[0]?.name).toBe("ada.pdf");
  });

  it("checkboxes toggle only when needed", async () => {
    document.body.innerHTML = `<input type="checkbox" id="cb" checked />`;
    const [o] = await executeInstructions(
      [{ ...base, selector: "#cb", kind: "checkbox", payload: { type: "check", checked: true } }],
      deps(),
    );
    expect(o?.verified).toBe(true);
    expect((document.getElementById("cb") as HTMLInputElement).checked).toBe(true);
  });

  it("reports missing fields instead of throwing", async () => {
    document.body.innerHTML = ``;
    const [o] = await executeInstructions(
      [{ ...base, selector: "#nope", kind: "text", payload: { type: "text", value: "x" } }],
      deps(),
    );
    expect(o?.ok).toBe(false);
    expect(o?.error).toBe("field not found");
  });
});

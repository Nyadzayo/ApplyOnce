// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { scanDocument } from "../src/content/scan/scanner";

function scan(html: string) {
  document.body.innerHTML = html;
  return scanDocument(document, { ats: "generic", framePath: "top", assumeLayout: true });
}

describe("scanner", () => {
  it("extracts label via <label for>", () => {
    const { signals } = scan(`
      <label for="fn">First Name *</label>
      <input id="fn" type="text" required />
    `);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.label).toBe("First Name");
    expect(signals[0]?.labelSource).toBe("label-for");
    expect(signals[0]?.required).toBe(true);
    expect(signals[0]?.selector).toBe("#fn");
  });

  it("falls back to aria-label, then placeholder, then geometric", () => {
    const { signals } = scan(`
      <input aria-label="Email address" />
      <input placeholder="Phone number" />
      <div><div>LinkedIn Profile</div><input id="li" /></div>
    `);
    expect(signals.map((s) => [s.label, s.labelSource])).toEqual([
      ["Email address", "aria-label"],
      ["Phone number", "placeholder"],
      ["LinkedIn Profile", "geometric"],
    ]);
  });

  it("collapses radio groups into one logical field with options", () => {
    const { signals } = scan(`
      <fieldset>
        <legend>Will you require sponsorship?</legend>
        <label><input type="radio" name="spons" value="1" /> Yes</label>
        <label><input type="radio" name="spons" value="0" /> No</label>
      </fieldset>
    `);
    expect(signals).toHaveLength(1);
    const g = signals[0]!;
    expect(g.kind).toBe("radio_group");
    expect(g.label).toBe("Will you require sponsorship?");
    expect(g.options?.map((o) => o.text)).toEqual(["Yes", "No"]);
    expect(g.memberSelectors).toHaveLength(2);
  });

  it("captures select options verbatim", () => {
    const { signals } = scan(`
      <label for="c">Country</label>
      <select id="c"><option value="">Select…</option><option value="US">United States</option></select>
    `);
    expect(signals[0]?.kind).toBe("select");
    expect(signals[0]?.options).toEqual([
      { value: "", text: "Select…" },
      { value: "US", text: "United States" },
    ]);
  });

  it("captures autocomplete, maxlength and accept attributes", () => {
    const { signals } = scan(`
      <input autocomplete="given-name" maxlength="40" />
      <input type="file" accept=".pdf,.docx" id="resume" />
    `);
    expect(signals[0]?.autocomplete).toBe("given-name");
    expect(signals[0]?.maxLength).toBe(40);
    expect(signals[1]?.kind).toBe("file");
    expect(signals[1]?.accept).toBe(".pdf,.docx");
  });

  it("hidden file inputs behind dropzones remain fillable/visible", () => {
    const { signals } = scan(`
      <div class="dropzone">
        <input type="file" id="resume" style="display:none" />
      </div>
      <input type="text" id="gone" style="display:none" />
      <input type="hidden" name="csrf" value="x" />
    `);
    const byId = Object.fromEntries(signals.map((s) => [s.idAttr, s]));
    expect(byId["resume"]?.visible).toBe(true);
    expect(byId["gone"]?.visible).toBe(false);
    expect(byId["csrf"]).toBeUndefined(); // hidden inputs are not candidates
  });

  it("reads fields inside open shadow roots", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.getElementById("host")!;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<label for="sf">Shadow Field</label><input id="sf" />`;
    const { signals } = scanDocument(document, {
      ats: "generic",
      framePath: "top",
      assumeLayout: true,
    });
    expect(signals).toHaveLength(1);
    expect(signals[0]?.inShadow).toBe(true);
    expect(signals[0]?.label).toBe("Shadow Field");
  });

  it("detects ARIA comboboxes and section headings", () => {
    const { signals } = scan(`
      <h3>Work Experience</h3>
      <label for="cb">Current company</label>
      <input id="cb" role="combobox" aria-expanded="false" />
    `);
    expect(signals[0]?.kind).toBe("aria_combobox");
    expect(signals[0]?.sectionHeading).toBe("Work Experience");
  });
});

import { describe, expect, it } from "vitest";
import { countryKeyOf, dialForCountry, dialFromPhone, stateKeyOf } from "@shared/geo";
import { resolveOption, sameMeaning } from "@shared/normalize";

describe("country knowledge", () => {
  it("resolves spellings, codes and translations to one country", () => {
    expect(countryKeyOf("South Africa")).toBe("ZA");
    expect(countryKeyOf("za")).toBe("ZA");
    expect(countryKeyOf("U.S.A.")).toBe("US");
    expect(countryKeyOf("Deutschland")).toBe("DE");
    expect(countryKeyOf("Korea, South")).toBe("KR");
    expect(countryKeyOf("Narnia")).toBeUndefined();
  });
  it("sameMeaning handles parenthetical dropdown labels", () => {
    expect(sameMeaning("South Africa", "South Africa (ZA)")).toBe(true);
    expect(sameMeaning("United Kingdom", "United Kingdom (UK)")).toBe(true);
    expect(sameMeaning("United Kingdom", "ZA")).toBe(false);
  });
  it("states and provinces match abbreviations", () => {
    expect(stateKeyOf("California")).toBe("US:CA");
    expect(sameMeaning("Western Cape", "Western Cape (WC)")).toBe(true);
    expect(sameMeaning("Ontario", "ON")).toBe(true);
  });
  it("dial codes derive from phone or country", () => {
    expect(dialFromPhone("+27 76 189 1101")).toBe("27");
    expect(dialFromPhone("0044 20 7946 0958")).toBe("44");
    expect(dialFromPhone("076 189 1101")).toBeUndefined();
    expect(dialForCountry("South Africa")).toBe("27");
  });
});

describe("option resolution with intl dropdowns", () => {
  const countries = [
    { value: "DE", text: "Germany (DE)" },
    { value: "GB", text: "United Kingdom (UK)" },
    { value: "ZA", text: "South Africa (ZA)" },
  ];
  it("matches country by name against tagged labels and ISO values", () => {
    expect(resolveOption("South Africa", countries)?.option.value).toBe("ZA");
    expect(resolveOption("United Kingdom", countries)?.option.value).toBe("GB");
    expect(resolveOption("UK", countries)?.option.value).toBe("GB");
  });
  it("matches dial codes by token containment", () => {
    const dials = [
      { value: "1", text: "United States (+1)" },
      { value: "44", text: "United Kingdom (+44)" },
      { value: "27", text: "South Africa (+27)" },
    ];
    expect(resolveOption("+27", dials)?.option.value).toBe("27");
    expect(resolveOption("+44", dials)?.option.value).toBe("44");
  });
  it("still refuses countries not in the list", () => {
    expect(resolveOption("France", countries)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { nameFromEmail, nameFromHeaderAndEmail, parseCvText } from "@shared/cvparse";

// Name recovery when the header is unreadable (scans with stylised fonts):
// the email address is the second signal (PLAN.md Part 9 section 5b).
describe("name from email", () => {
  it("splits a separated local part", () => {
    expect(nameFromEmail("amara.okafor@gmail.com")).toBe("Amara Okafor");
    expect(nameFromEmail("rob_vance99@fastmail.com")).toBe("Rob Vance");
    expect(nameFromEmail("darcieabimola@gmail.com")).toBeUndefined();
    expect(nameFromEmail("info.desk@acme.com")).toBeUndefined();
  });

  it("rebuilds a garbled OCR header from its capitals and the email", () => {
    expect(nameFromHeaderAndEmail("D arc i e A bi mo a", "darcieabimola@gmail.com")).toBe("Darcie Abimola");
    expect(nameFromHeaderAndEmail("Highly creative architect", "darcieabimola@gmail.com")).toBeUndefined();
  });

  it("falls back to the email when no header line reads as a name", () => {
    const { profile, evidence } = parseCvText(
      "Senior Product Manager\namara.okafor@gmail.com | +234 803 555 0147\n\nExperience\nPayFlow Technologies, Lagos\nSenior Product Manager\nMar 2021 - Present\n- Owned the roadmap.\n",
    );
    expect(profile.basics.firstName).toBe("Amara");
    expect(profile.basics.lastName).toBe("Okafor");
    expect(evidence["basics.firstName"]?.confidence).toBe("medium");
  });
});

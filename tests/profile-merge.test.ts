import { describe, expect, it } from "vitest";
import { mergeImportedProfile } from "@shared/profile-merge";
import { emptyProfile } from "@shared/types";

describe("mergeImportedProfile", () => {
  it("takes the new resume's entries and keeps user-only data", () => {
    const existing = emptyProfile();
    existing.basics.firstName = "Ada";
    existing.basics.phone = "+44 20 7946 0000";
    existing.links.github = "https://github.com/ada";
    existing.work = [{ company: "Old Co", title: "Old Role", start: "2019-01", end: "2020-01", current: false, location: "", description: "" }];
    existing.explicit = { ...existing.explicit, workAuth: "Yes" };
    const imported = emptyProfile();
    imported.basics.firstName = "Ada";
    imported.basics.lastName = "Lovelace";
    imported.basics.email = "ada@example.com";
    imported.work = [{ company: "New Co", title: "Staff Engineer", start: "2021-03", end: "", current: true, location: "London", description: "" }];
    imported.skills = ["Compilers"];
    const merged = mergeImportedProfile(existing, imported);
    expect(merged.basics).toMatchObject({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "+44 20 7946 0000" });
    expect(merged.links.github).toBe("https://github.com/ada");
    expect(merged.work.map((w) => w.company)).toEqual(["New Co"]);
    expect(merged.skills).toEqual(["Compilers"]);
    expect(merged.explicit.workAuth).toBe("Yes");
  });

  it("keeps existing entries when the new parse found none", () => {
    const existing = emptyProfile();
    existing.education = [{ school: "Uni", degree: "BSc", field: "Maths", start: "", end: "", gpa: "" }];
    const merged = mergeImportedProfile(existing, emptyProfile());
    expect(merged.education).toHaveLength(1);
  });
});

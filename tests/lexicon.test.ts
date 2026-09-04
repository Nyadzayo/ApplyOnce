import { describe, expect, it } from "vitest";
import { lexiconLookup } from "@shared/lexicon";

// Seams measured on the 2,078-question corpus (PLAN.md Part 9 §1). Each case
// here was a wrong mapping or a high-traffic abstain before the expansion.
describe("lexiconLookup seams", () => {
  it("never maps a preferred/nick name onto the legal first name", () => {
    expect(lexiconLookup("Preferred First Name")).toBeUndefined();
    expect(lexiconLookup("Preferred Name")).toBeUndefined();
    expect(lexiconLookup("What is your legal first name?")).toBe("basics.firstName");
  });

  it("keeps sponsorship and work authorization apart", () => {
    expect(lexiconLookup("Will you now or in the future require sponsorship for employment visa status?"))
      .toBe("preferences.requiresSponsorship");
    expect(lexiconLookup("Would you need us to sponsor a work visa?")).toBe("preferences.requiresSponsorship");
    expect(lexiconLookup("Will you require U.S. work authorization (e.g., visa sponsorship) now or in the future?"))
      .toBe("preferences.requiresSponsorship");
    expect(lexiconLookup("Are you legally authorized to work in the United States?")).toBe("preferences.workAuth");
    // statements and detail requests are not the yes/no question
    expect(lexiconLookup("This position is not eligible for Visa Sponsorship. Applicants must be authorized to work."))
      .toBeUndefined();
    expect(lexiconLookup("Please provide additional detail about your sponsorship needs")).toBeUndefined();
  });

  it("splits camelCase attribute labels", () => {
    expect(lexiconLookup("DisabilityStatus")).toBe("eeo.disability");
    expect(lexiconLookup("VeteranStatus")).toBe("eeo.veteran");
  });

  it("trusts whole-word hits only on question-length labels", () => {
    expect(lexiconLookup("Share your Pronouns")).toBe("basics.pronouns");
    expect(lexiconLookup("Gender Pronouns (She/Her/Hers, He/Him/His, They/Them/Theirs, etc.)")).toBe("basics.pronouns");
    expect(lexiconLookup("At Acme, we encourage employees to bring their whole selves to work, and pronouns are one way we honor that. If you would like to share yours, please do so here, and feel free to add anything else."))
      .toBeUndefined();
    expect(lexiconLookup("Have you built a static or dynamic analysis tool, such as a data race detector, that was used in production by other engineers?"))
      .toBeUndefined();
  });

  it("does not turn consent text mentioning a phone number into the phone field", () => {
    expect(lexiconLookup("I acknowledge that by providing my phone number, I agree to receive text messages")).toBeUndefined();
    expect(lexiconLookup("Mobile Phone Number")).toBe("basics.phone");
    expect(lexiconLookup("Telefono")).toBe("basics.phone");
  });

  it("maps the measured high-traffic phrasings", () => {
    expect(lexiconLookup("How did you first hear about Acme?")).toBe("preferences.howHeard");
    expect(lexiconLookup("Where do you currently live?")).toBe("location.full");
    expect(lexiconLookup("What country are you based in?")).toBe("location.country");
    expect(lexiconLookup("Which state or province do you currently live in?")).toBe("location.region");
    expect(lexiconLookup("Home Address Zip Code")).toBe("location.postalCode");
    expect(lexiconLookup("Are you a veteran or active member of the United States Armed Forces?")).toBe("eeo.veteran");
    expect(lexiconLookup("How would you describe your racial/ethnic background? (mark all that apply)")).toBe("eeo.race");
    expect(lexiconLookup("Which university are you currently attending or did you last attend?")).toBe("education.school");
    expect(lexiconLookup("Please select your most advanced degree from this list")).toBe("education.degree");
    expect(lexiconLookup("Who is your current or previous employer?")).toBe("work.company");
    expect(lexiconLookup("Portfolio or Cover Letter")).toBe("attachments.coverLetter");
    expect(lexiconLookup("Do you have experience with Salesforce and LinkedIn Sales Navigator?")).toBeUndefined();
  });
});

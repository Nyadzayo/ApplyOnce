import { describe, expect, it } from "vitest";
import { mapField, retrieveAnswer, type MapperContext } from "@shared/mapper";
import { emptyProfile, type FieldSignal, type SavedAnswer } from "@shared/types";

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

function ctx(partial: Partial<MapperContext> = {}): MapperContext {
  const profile = emptyProfile();
  profile.basics.firstName = "Ada";
  profile.basics.lastName = "Lovelace";
  profile.basics.email = "ada@example.com";
  profile.basics.phone = "+1 555 0100";
  profile.links.linkedin = "https://linkedin.com/in/ada";
  profile.location.city = "London";
  profile.location.country = "United Kingdom";
  profile.work = [
    {
      company: "Analytical Engines Ltd",
      title: "Staff Engineer",
      start: "2021-03",
      end: "",
      current: true,
      location: "London",
      description: "Compilers.",
    },
  ];
  return {
    ats: "generic",
    profile,
    savedAnswers: [],
    documents: [],
    dateFormatHint: "MM/DD/YYYY",
    ...partial,
  };
}

const answer = (q: string, a: string, id = "a1"): SavedAnswer => ({
  id,
  questionText: q,
  normalizedKey: q.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim(),
  aliasKeys: [],
  answer: a,
  timesUsed: 0,
  lastUsedAt: 0,
  createdAt: 0,
});

describe("cascade order", () => {
  it("adapter rule beats lexicon", () => {
    const d = mapField(
      sig({ idAttr: "first_name", label: "Something Weird" }),
      ctx({ ats: "greenhouse" }),
    );
    expect(d.canonical).toBe("basics.firstName");
    expect(d.source).toBe("adapter");
    expect(d.value).toBe("Ada");
    expect(d.action).toBe("fill");
  });

  it("autocomplete token maps directly", () => {
    const d = mapField(sig({ autocomplete: "given-name", label: "???" }), ctx());
    expect(d.canonical).toBe("basics.firstName");
    expect(d.source).toBe("autocomplete");
    expect(d.action).toBe("fill");
  });

  it("lexicon matches the label", () => {
    const d = mapField(sig({ label: "LinkedIn Profile" }), ctx());
    expect(d.canonical).toBe("links.linkedin");
    expect(d.value).toBe("https://linkedin.com/in/ada");
  });

  it("abstains when nothing matches", () => {
    const d = mapField(sig({ label: "Favorite dinosaur" }), ctx());
    expect(d.action).toBe("abstain");
  });

  it("abstains when the profile has no value", () => {
    const d = mapField(sig({ label: "GitHub" }), ctx());
    expect(d.action).toBe("abstain");
    expect(d.canonical).toBe("links.github");
  });
});

describe("risk gates", () => {
  it("EEO without an explicit setting → review, never fill", () => {
    const d = mapField(
      sig({
        kind: "select",
        label: "Gender",
        options: [
          { value: "m", text: "Male" },
          { value: "f", text: "Female" },
          { value: "d", text: "Decline To Self Identify" },
        ],
      }),
      ctx(),
    );
    expect(d.action).toBe("review");
  });

  it("EEO with an explicit setting fills amber via alias", () => {
    const c = ctx();
    c.profile.explicit.gender = "Prefer not to say";
    const d = mapField(
      sig({
        kind: "select",
        label: "Gender",
        options: [
          { value: "m", text: "Male" },
          { value: "d", text: "Decline To Self Identify" },
        ],
      }),
      c,
    );
    expect(d.action).toBe("fill-amber");
    expect(d.option?.value).toBe("d");
  });

  it("sponsorship radio group resolves yes/no aliases from explicit settings", () => {
    const c = ctx();
    c.profile.explicit.requiresSponsorship = "No";
    const d = mapField(
      sig({
        kind: "radio_group",
        label: "Will you now or in the future require sponsorship for employment visa status?",
        options: [
          { value: "1", text: "Yes" },
          { value: "0", text: "No" },
        ],
      }),
      c,
    );
    expect(d.canonical).toBe("preferences.requiresSponsorship");
    expect(d.option?.value).toBe("0");
    expect(d.action).toBe("fill-amber");
  });

  it("salary without explicit setting or saved answer → review", () => {
    const d = mapField(sig({ label: "Salary expectations" }), ctx());
    expect(d.action).toBe("review");
  });

  it("salary from a saved answer is allowed (amber)", () => {
    const c = ctx({ savedAnswers: [answer("Salary expectations", "$180,000")] });
    const d = mapField(sig({ label: "Salary expectations" }), c);
    expect(d.value).toBe("$180,000");
    expect(d.action).toBe("fill-amber");
    expect(d.canonical).toBe("preferences.salary");
  });

  it("consent checkboxes always go to review", () => {
    const d = mapField(
      sig({ kind: "checkbox", label: "I agree to the terms and conditions" }),
      ctx(),
    );
    expect(d.action).toBe("review");
  });
});

describe("options", () => {
  it("never picks an option that is not in the list", () => {
    const c = ctx();
    c.profile.explicit.workAuth = "Yes";
    const d = mapField(
      sig({
        kind: "select",
        label: "Are you legally authorized to work in the United States?",
        options: [{ value: "x", text: "Maybe" }],
      }),
      c,
    );
    expect(d.action).toBe("review");
    expect(d.option).toBeUndefined();
  });

  it("country select resolves via aliases", () => {
    const d = mapField(
      sig({
        kind: "select",
        label: "Country",
        options: [
          { value: "US", text: "United States of America" },
          { value: "GB", text: "United Kingdom" },
        ],
      }),
      ctx(),
    );
    expect(d.option?.value).toBe("GB");
  });
});

describe("saved answers", () => {
  it("exact retrieval", () => {
    const c = ctx({ savedAnswers: [answer("Why do you want to work here?", "Because compilers.")] });
    const d = mapField(sig({ kind: "textarea", label: "Why do you want to work here?" }), c);
    expect(d.source).toBe("answer-exact");
    expect(d.value).toBe("Because compilers.");
    expect(d.action).toBe("fill");
  });

  it("fuzzy retrieval lands in amber, below-threshold does not match", () => {
    const c = ctx({
      savedAnswers: [answer("Why do you want to work here?", "Because compilers.")],
    });
    const d = mapField(
      sig({ kind: "textarea", label: "Why do you really want to work here?" }),
      c,
    );
    expect(d.source).toBe("answer-fuzzy");
    expect(d.action).toBe("fill-amber");

    const none = retrieveAnswer("Describe your leadership style", c.savedAnswers);
    expect(none).toBeNull();
  });

  it("greenhouse custom questions fall through to saved answers when the lexicon has no match", () => {
    const c = ctx({
      ats: "greenhouse",
      savedAnswers: [answer("Describe a project you are proud of", "The compiler.")],
    });
    const d = mapField(
      sig({
        nameAttr: "job_application[answers_attributes][0][text_value]",
        label: "Describe a project you are proud of",
      }),
      c,
    );
    expect(d.source).toBe("answer-exact");
    expect(d.value).toBe("The compiler.");
  });

  it("greenhouse custom questions that are standard questions still hit the lexicon", () => {
    const c = ctx({ ats: "greenhouse" });
    c.profile.explicit.noticePeriod = "4 weeks";
    const d = mapField(
      sig({
        nameAttr: "job_application[answers_attributes][1][text_value]",
        label: "What is your notice period?",
      }),
      c,
    );
    expect(d.canonical).toBe("preferences.noticePeriod");
    expect(d.value).toBe("4 weeks");
  });
});

describe("files", () => {
  const doc = {
    id: "d1",
    role: "resume" as const,
    fileName: "ada-lovelace.pdf",
    mime: "application/pdf",
    size: 120_000,
    addedAt: 0,
  };

  it("attaches the stored resume, never silently", () => {
    const d = mapField(
      sig({ kind: "file", label: "Resume/CV", idAttr: "resume" }),
      ctx({ ats: "greenhouse", documents: [doc] }),
    );
    expect(d.documentId).toBe("d1");
    expect(d.action).toBe("fill-amber");
  });

  it("abstains without a stored resume", () => {
    const d = mapField(sig({ kind: "file", label: "Resume/CV" }), ctx());
    expect(d.action).toBe("abstain");
  });

  it("flags accept-attribute mismatches", () => {
    const docx = { ...doc, fileName: "ada.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
    const d = mapField(
      sig({ kind: "file", label: "Resume/CV", accept: ".pdf" }),
      ctx({ documents: [docx] }),
    );
    expect(d.action).toBe("review");
  });
});

describe("constraints", () => {
  it("maxLength overflow → review", () => {
    const c = ctx({ savedAnswers: [answer("Tell us about yourself", "x".repeat(500))] });
    const d = mapField(
      sig({ kind: "textarea", label: "Tell us about yourself", maxLength: 100 }),
      c,
    );
    expect(d.action).toBe("review");
  });

  it("invisible fields are never filled", () => {
    const d = mapField(sig({ label: "Email", visible: false }), ctx());
    expect(d.action).toBe("abstain");
  });

  it("dates format to the detected placeholder", () => {
    const d = mapField(
      sig({
        label: "Start date",
        sectionHeading: "Work Experience",
        placeholder: "MM/YYYY",
      }),
      ctx(),
    );
    expect(d.canonical).toBe("work.start");
    expect(d.value).toBe("03/2021");
  });
});

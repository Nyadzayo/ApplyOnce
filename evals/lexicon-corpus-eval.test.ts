// Lexicon corpus eval (PLAN.md Part 9 §1): runs mapField over the 2,078
// harvested-question corpus (finetune/data in the autofill-api repo) and
// reports traffic-weighted correct / wrong / abstain rates. Skips when the
// corpus is not on this machine. Floors ratchet upward only.
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

const CORPUS = process.env.APPLYONCE_QUESTION_CORPUS
  ?? "/Users/mnyadzayo/projects/autofill-api/finetune/data/labeled_full.jsonl";
import { mapField, type MapperContext } from "@shared/mapper";
import { emptyProfile, type FieldSignal } from "@shared/types";

const MAP: Record<string, string[] | null> = {
  first_name: ["basics.firstName"], last_name: ["basics.lastName"], full_name: ["basics.fullName"],
  email: ["basics.email"], phone: ["basics.phone", "basics.phoneCountryCode"], pronouns: ["basics.pronouns"],
  preferred_name: null,
  current_location: ["location.full", "location.city", "location.region", "location.country"],
  address: ["location.street", "location.full", "location.city", "location.region", "location.country", "location.postalCode"],
  resume_upload: ["attachments.resume"], cover_letter: ["attachments.coverLetter"],
  linkedin_url: ["links.linkedin"], github_url: ["links.github"], portfolio_url: ["links.portfolio", "links.website"],
  other_url: ["links.website", "links.other", "links.portfolio"],
  visa_sponsorship: ["preferences.requiresSponsorship"], work_authorization: ["preferences.workAuth"],
  eeo_gender: ["eeo.gender"], eeo_race_ethnicity: ["eeo.race", "eeo.hispanic"],
  eeo_disability_status: ["eeo.disability"], eeo_veteran_status: ["eeo.veteran"], eeo_sexual_orientation: null,
  referral_source: ["preferences.howHeard"], remote_onsite_preference: ["preferences.remote"],
  relocation_willingness: ["preferences.relocation"],
  salary_expectation: ["preferences.salary", "preferences.salaryMin", "preferences.salaryMax"],
  availability_start_date: ["preferences.startDate"], notice_period: ["preferences.noticePeriod"],
  gpa: ["education.gpa"], school_name: ["education.school"], education_level: ["education.degree"],
  graduation_date: ["education.end"], employment_history: ["work.company", "work.title"],
};
const KIND: Record<string, FieldSignal["kind"]> = {
  input_text: "text", input_email: "email", input_tel: "tel", input_url: "url", input_number: "number",
  input_date: "date", textarea: "textarea", select: "select", multiselect: "multiselect",
  checkbox: "checkbox", radio: "radio_group", file: "file", input_file: "file", input_checkbox: "checkbox", input_radio: "radio_group",
};

it.skipIf(!existsSync(CORPUS))("lexicon corpus eval", () => {
  const rows = readFileSync(CORPUS, "utf8")
    .trim().split("\n").map((l) => JSON.parse(l));
  const profile = emptyProfile();
  const ctx: MapperContext = { ats: "generic", profile, savedAnswers: [], documents: [], dateFormatHint: "" };
  const kinds = new Set<string>();
  let correct = 0, wrong = 0, absMap = 0, absNoKey = 0, tot = 0;
  const wrongs: [number, string, string, string][] = [];
  const misses: [number, string, string][] = [];
  for (const r of rows) {
    kinds.add(r.input_type);
    const sig: FieldSignal = {
      ref: "top:f0", framePath: "top", selector: "#x", kind: KIND[r.input_type] ?? "text", label: r.text,
      labelSource: "label-for", required: false, visible: true, inShadow: false, widgetHint: "native",
      options: (r.options ?? []).map((o: string) => ({ value: o, text: o })),
      sectionHeading: r.sections?.[0],
    };
    const d = mapField(sig, ctx);
    const got = d.canonical && !d.canonical.startsWith("custom.") ? d.canonical : undefined;
    const want = MAP[r.intent] ?? null;
    tot += r.freq;
    if (got && want && want.includes(got)) correct += r.freq;
    else if (got) { wrong += r.freq; wrongs.push([r.freq, r.intent, got, r.text.slice(0, 70)]); }
    else if (want) { absMap += r.freq; misses.push([r.freq, r.intent, r.text.slice(0, 80)]); }
    else absNoKey += r.freq;
  }
  const pct = (n: number) => `${((n / tot) * 100).toFixed(1)}%`;
  console.log(`kinds=${[...kinds].join(",")}`);
  console.log(`correct ${pct(correct)}  wrong ${pct(wrong)}  abstain-on-mappable ${pct(absMap)}  abstain-no-key ${pct(absNoKey)}`);
  console.log("WRONG (freq intent got label):");
  wrongs.sort((a, b) => b[0] - a[0]).slice(0, 25).forEach((w) => console.log("  ", w.join(" | ")));
  console.log("ABSTAIN-ON-MAPPABLE (freq intent label):");
  misses.sort((a, b) => b[0] - a[0]).slice(0, 30).forEach((m) => console.log("  ", m.join(" | ")));
  expect(correct / tot).toBeGreaterThanOrEqual(0.69); // was 0.571 before Part 9 §1
  expect(wrong / tot).toBeLessThanOrEqual(0.01); // was 0.037
});

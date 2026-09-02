import type { CanonicalKey } from "./canonical-fields";

// Intent classifier label space (finetune/taxonomy.json v0.3) and the subset
// that maps onto a canonical key. The label order itself ships with the model
// assets (label_map.json) so a retrained model never silently disagrees with
// the code. Every intent without an entry here abstains: the model may
// recognize "previous employment here" or "security clearance", but the
// profile has no value for it, so the field goes to the user (PLAN.md
// Part 9 section 4, rule 3).

/** Intents the profile can answer. Yes/no willingness phrasings that would
 *  need a boolean the profile does not hold stay unmapped on purpose. */
export const INTENT_TO_KEY: Record<string, CanonicalKey> = {
  first_name: "basics.firstName",
  last_name: "basics.lastName",
  full_name: "basics.fullName",
  pronouns: "basics.pronouns",
  email: "basics.email",
  phone: "basics.phone",
  current_location: "location.full",
  linkedin_url: "links.linkedin",
  github_url: "links.github",
  portfolio_url: "links.portfolio",
  other_url: "links.website",
  resume_upload: "attachments.resume",
  cover_letter: "attachments.coverLetter",
  work_authorization: "preferences.workAuth",
  visa_sponsorship: "preferences.requiresSponsorship",
  salary_expectation: "preferences.salary",
  availability_start_date: "preferences.startDate",
  notice_period: "preferences.noticePeriod",
  relocation_willingness: "preferences.relocation",
  education_level: "education.degree",
  school_name: "education.school",
  graduation_date: "education.end",
  gpa: "education.gpa",
  referral_source: "preferences.howHeard",
  eeo_gender: "eeo.gender",
  eeo_race_ethnicity: "eeo.race",
  eeo_veteran_status: "eeo.veteran",
  eeo_disability_status: "eeo.disability",
};

/** Kept-accuracy 0.998 (traffic-weighted) at this threshold on the held-out test split. */
export const CLASSIFIER_THRESHOLD = 0.8;

/** Greenhouse-style input type vocabulary the model was trained on. */
export const KIND_TO_INPUT_TYPE: Record<string, string> = {
  text: "input_text", email: "input_text", tel: "input_text", url: "input_text", number: "input_text",
  date: "input_text", textarea: "textarea", select: "multi_value_single_select",
  multiselect: "multi_value_multi_select", checkbox: "checkbox", radio_group: "multi_value_single_select",
  file: "input_file",
};

/** Exactly the training-time serialization (finetune kernel `serialize`):
 *  "label [TYPE=t] [OPTIONS=a | b | ...]" with at most 8 options. */
export function serializeForClassifier(label: string, kind?: string, options?: readonly string[]): string {
  const parts = [label];
  const type = kind ? KIND_TO_INPUT_TYPE[kind] ?? kind : "";
  if (type) parts.push(`[TYPE=${type}]`);
  if (options && options.length > 0) parts.push(`[OPTIONS=${options.slice(0, 8).join(" | ")}]`);
  return parts.join(" ");
}

/** A model prediction for one field label, before the cascade applies it. */
export interface ClassifierHint {
  intent: string;
  score: number;
  key?: CanonicalKey;
}

export function softmax(logits: ArrayLike<number>): number[] {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i]! > max) max = logits[i]!;
  const exps = Array.from({ length: logits.length }, (_, i) => Math.exp(logits[i]! - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Top intent with its probability, mapped to a canonical key where one exists. */
export function hintFromLogits(logits: ArrayLike<number>, labels: readonly string[]): ClassifierHint {
  const probs = softmax(logits);
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i]! > probs[best]!) best = i;
  const intent = labels[best] ?? "other";
  return { intent, score: probs[best]!, key: INTENT_TO_KEY[intent] };
}

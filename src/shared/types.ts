import { z } from "zod";

// ---------------------------------------------------------------------------
// Field signals — what the scanner reports (PLAN.md §2.6)
// ---------------------------------------------------------------------------

export const FieldKind = z.enum([
  "text",
  "email",
  "tel",
  "url",
  "number",
  "date",
  "textarea",
  "select",
  "multiselect",
  "checkbox",
  "radio_group",
  "file",
  "contenteditable",
  "aria_combobox",
  "aria_listbox",
]);
export type FieldKind = z.infer<typeof FieldKind>;

export const WidgetHint = z.enum([
  "native",
  "react_select",
  "greenhouse_select",
  "lever_native",
  "ashby_combobox",
  "unknown",
]);
export type WidgetHint = z.infer<typeof WidgetHint>;

export const LabelSource = z.enum([
  "autocomplete",
  "label-for",
  "aria-labelledby",
  "aria-label",
  "placeholder",
  "geometric",
  "name-attr",
  "none",
]);
export type LabelSource = z.infer<typeof LabelSource>;

export const FieldOption = z.object({
  value: z.string(),
  text: z.string(),
});
export type FieldOption = z.infer<typeof FieldOption>;

export const FieldSignal = z.object({
  /** Stable within one scan: `${framePath}:f${n}` */
  ref: z.string(),
  /** e.g. "top" or "top/0/1" — index path of frames from the top document */
  framePath: z.string(),
  /** Best-effort CSS selector usable from within the owning frame */
  selector: z.string(),
  /** For radio_group / checkbox clusters: selectors of every member input */
  memberSelectors: z.array(z.string()).optional(),
  kind: FieldKind,
  label: z.string(),
  labelSource: LabelSource,
  placeholder: z.string().optional(),
  nameAttr: z.string().optional(),
  idAttr: z.string().optional(),
  autocomplete: z.string().optional(),
  required: z.boolean(),
  options: z.array(FieldOption).optional(),
  currentValue: z.string().optional(),
  sectionHeading: z.string().optional(),
  visible: z.boolean(),
  inShadow: z.boolean(),
  /** joins radios / checkbox clusters sharing name or fieldset */
  groupId: z.string().optional(),
  widgetHint: WidgetHint,
  /** file inputs: the accept attribute */
  accept: z.string().optional(),
  maxLength: z.number().optional(),
});
export type FieldSignal = z.infer<typeof FieldSignal>;

// ---------------------------------------------------------------------------
// Candidate profile (vault singleton)
// ---------------------------------------------------------------------------

export const WorkEntry = z.object({
  company: z.string().default(""),
  title: z.string().default(""),
  start: z.string().default(""), // "YYYY-MM" where known
  end: z.string().default(""), // "" while current
  current: z.boolean().default(false),
  location: z.string().default(""),
  description: z.string().default(""),
});
export type WorkEntry = z.infer<typeof WorkEntry>;

export const EducationEntry = z.object({
  school: z.string().default(""),
  degree: z.string().default(""),
  field: z.string().default(""),
  start: z.string().default(""),
  end: z.string().default(""),
  gpa: z.string().default(""),
});
export type EducationEntry = z.infer<typeof EducationEntry>;

/**
 * Explicit settings: answers the user chose deliberately during onboarding.
 * `null` = not set → the mapper abstains (hard gate; PLAN.md §3.4).
 * The string is the user's chosen answer text (e.g. "Yes", "Decline to
 * self-identify") and is matched against form options via the alias tables.
 */
export const ExplicitSettings = z.object({
  workAuth: z.string().nullable().default(null),
  requiresSponsorship: z.string().nullable().default(null),
  salary: z.string().nullable().default(null),
  salaryMin: z.string().nullable().default(null),
  salaryMax: z.string().nullable().default(null),
  startDate: z.string().nullable().default(null),
  relocation: z.string().nullable().default(null),
  remote: z.string().nullable().default(null),
  noticePeriod: z.string().nullable().default(null),
  gender: z.string().nullable().default(null),
  race: z.string().nullable().default(null),
  hispanic: z.string().nullable().default(null),
  veteran: z.string().nullable().default(null),
  disability: z.string().nullable().default(null),
});
export type ExplicitSettings = z.infer<typeof ExplicitSettings>;

export const CandidateProfile = z.object({
  version: z.literal(1),
  basics: z.object({
    firstName: z.string().default(""),
    lastName: z.string().default(""),
    email: z.string().default(""),
    phone: z.string().default(""),
    pronouns: z.string().default(""),
  }),
  location: z.object({
    street: z.string().default(""),
    city: z.string().default(""),
    region: z.string().default(""),
    country: z.string().default(""),
    postalCode: z.string().default(""),
  }),
  links: z.object({
    linkedin: z.string().default(""),
    github: z.string().default(""),
    portfolio: z.string().default(""),
    website: z.string().default(""),
  }),
  work: z.array(WorkEntry).default([]),
  education: z.array(EducationEntry).default([]),
  skills: z.array(z.string()).default([]),
  explicit: ExplicitSettings,
});
export type CandidateProfile = z.infer<typeof CandidateProfile>;

export function emptyProfile(): CandidateProfile {
  return CandidateProfile.parse({
    version: 1,
    basics: {},
    location: {},
    links: {},
    work: [],
    education: [],
    skills: [],
    explicit: {},
  });
}

/** Parse result from CV import: values plus where each one was found. */
export const Evidence = z.object({
  page: z.number().optional(),
  snippet: z.string(),
});
export const ProfilePatch = z.object({
  profile: CandidateProfile,
  evidence: z.record(z.string(), Evidence).default({}),
  warnings: z.array(z.string()).default([]),
});
export type ProfilePatch = z.infer<typeof ProfilePatch>;

// ---------------------------------------------------------------------------
// Documents / saved answers / fill log (vault tables)
// ---------------------------------------------------------------------------

export const StoredDocument = z.object({
  id: z.string(),
  role: z.enum(["resume", "coverLetter"]),
  fileName: z.string(),
  mime: z.string(),
  size: z.number(),
  addedAt: z.number(),
});
export type StoredDocument = z.infer<typeof StoredDocument>;

export const SavedAnswer = z.object({
  id: z.string(),
  /** Question exactly as last seen on a form */
  questionText: z.string(),
  /** lexicon-normalized question — primary retrieval key */
  normalizedKey: z.string(),
  /** grown when the user confirms a fuzzy match (learning without a model) */
  aliasKeys: z.array(z.string()).default([]),
  answer: z.string(),
  timesUsed: z.number().default(0),
  lastUsedAt: z.number().default(0),
  createdAt: z.number(),
});
export type SavedAnswer = z.infer<typeof SavedAnswer>;

/** Diagnostics: structure only — never field values (PLAN.md Phase 8). */
export const FillLogEntry = z.object({
  id: z.string(),
  at: z.number(),
  domain: z.string(),
  ats: z.string(),
  fieldCount: z.number(),
  filled: z.number(),
  reviewed: z.number(),
  abstained: z.number(),
  failed: z.number(),
  durationMs: z.number(),
  outcomes: z.array(
    z.object({
      canonical: z.string().optional(),
      kind: FieldKind,
      source: z.string().optional(),
      confidence: z.number().optional(),
      outcome: z.enum(["filled", "review", "abstain", "failed"]),
      error: z.string().optional(),
    }),
  ),
});
export type FillLogEntry = z.infer<typeof FillLogEntry>;

export const VaultSettings = z.object({
  passphraseEnabled: z.boolean().default(false),
  /** present only when passphraseEnabled */
  kdfSaltB64: z.string().optional(),
  workEverywhere: z.boolean().default(false),
  dateFormatHint: z.string().default("MM/DD/YYYY"),
  /** auto-detect application forms on granted sites and show the widget */
  autoDetect: z.boolean().default(true),
});
export type VaultSettings = z.infer<typeof VaultSettings>;

export const JobStatus = z.enum(["saved", "applied", "interviewing", "offer", "rejected"]);
export type JobStatus = z.infer<typeof JobStatus>;

/** Application history — job metadata + fill stats, never field values. */
export const JobHistoryEntry = z.object({
  id: z.string(),
  /** canonical page URL (query/hash stripped) — upsert key */
  url: z.string(),
  domain: z.string(),
  ats: z.string(),
  /** best-effort page title / job title */
  title: z.string(),
  firstSeenAt: z.number(),
  lastFilledAt: z.number().optional(),
  timesFilled: z.number().default(0),
  fieldCount: z.number().default(0),
  filled: z.number().default(0),
  reviewed: z.number().default(0),
  failed: z.number().default(0),
  status: JobStatus.default("saved"),
  /** follow-up reminder (chrome.alarms), epoch ms */
  reminderAt: z.number().optional(),
  /** snapshot of the job description text (postings vanish once closed) */
  jdSnippet: z.string().optional(),
});
export type JobHistoryEntry = z.infer<typeof JobHistoryEntry>;

// ---------------------------------------------------------------------------
// Mapping decisions and fill plans
// ---------------------------------------------------------------------------

export const MappingSource = z.enum([
  "adapter",
  "autocomplete",
  "lexicon",
  "answer-exact",
  "answer-fuzzy",
]);
export type MappingSource = z.infer<typeof MappingSource>;

export const DecisionAction = z.enum(["fill", "fill-amber", "review", "abstain"]);
export type DecisionAction = z.infer<typeof DecisionAction>;

export const FieldDecision = z.object({
  ref: z.string(),
  canonical: z.string().optional(),
  source: MappingSource.optional(),
  /** value to type, or the option text to pick, or document id for files */
  value: z.string().optional(),
  /** for option fields: the exact option (verbatim) that was resolved */
  option: FieldOption.optional(),
  /** for multiselect fields: every verbatim option to pick */
  optionsMulti: z.array(FieldOption).optional(),
  /** for checkbox / boolean radio groups */
  checked: z.boolean().optional(),
  documentId: z.string().optional(),
  confidence: z.number(),
  action: DecisionAction,
  reason: z.string(),
  /** id of the saved answer used, for usage bookkeeping + alias learning */
  savedAnswerId: z.string().optional(),
});
export type FieldDecision = z.infer<typeof FieldDecision>;

export const FillInstruction = z.object({
  ref: z.string(),
  framePath: z.string(),
  selector: z.string(),
  memberSelectors: z.array(z.string()).optional(),
  kind: FieldKind,
  widgetHint: WidgetHint,
  payload: z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), value: z.string() }),
    z.object({ type: z.literal("option"), optionText: z.string(), optionValue: z.string() }),
    z.object({ type: z.literal("multi"), options: z.array(FieldOption) }),
    z.object({ type: z.literal("check"), checked: z.boolean() }),
    z.object({
      type: z.literal("file"),
      fileName: z.string(),
      mime: z.string(),
      dataB64: z.string(),
    }),
  ]),
  amber: z.boolean().default(false),
});
export type FillInstruction = z.infer<typeof FillInstruction>;

export const FillOutcome = z.object({
  ref: z.string(),
  ok: z.boolean(),
  verified: z.boolean(),
  error: z.string().optional(),
});
export type FillOutcome = z.infer<typeof FillOutcome>;

// ---------------------------------------------------------------------------
// Jobs (PLAN.md Phase 1) — persisted in chrome.storage.session
// ---------------------------------------------------------------------------

export const Job = z.object({
  id: z.string(),
  kind: z.enum(["SCAN", "FILL", "PARSE_CV"]),
  state: z.enum(["pending", "running", "done", "failed"]),
  createdAt: z.number(),
  tabId: z.number().optional(),
  error: z.string().optional(),
});
export type Job = z.infer<typeof Job>;

export const AtsId = z.enum(["greenhouse", "lever", "ashby", "generic"]);
export type AtsId = z.infer<typeof AtsId>;

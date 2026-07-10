import type {
  AtsId,
  CandidateProfile,
  FieldDecision,
  FieldSignal,
  MappingSource,
  SavedAnswer,
  StoredDocument,
} from "./types";
import { type CanonicalKey, riskClassOf } from "./canonical-fields";
import { adapterLookup } from "./ats";
import { autocompleteToCanonical } from "./autocomplete-map";
import { lexiconLookup } from "./lexicon";
import { fuzzyScore, normalizeLabel, resolveOption, tokenSet } from "./normalize";
import {
  actionForConfidence,
  applyGates,
  confidence,
  looksLikeConsent,
  type OptionQuality,
} from "./scoring";
import { formatForField, resolveProfileValue } from "./profile-values";
import {
  hasTemplatePlaceholders,
  substituteTemplate,
  type PageContext,
} from "./page-context";

// The deterministic mapping cascade (PLAN.md §3.2). Per field, first hit wins:
//   1 ATS adapter rule → 2 autocomplete token → 3 label lexicon
//   → 4 saved-answer exact → 5 saved-answer fuzzy → 6 abstain
// Pure function: FieldSignal[] in, FieldDecision[] out. No DOM, no storage.

export interface MapperContext {
  ats: AtsId;
  profile: CandidateProfile;
  savedAnswers: SavedAnswer[];
  documents: StoredDocument[];
  dateFormatHint: string;
  /** detected {company, role} for template answers */
  pageContext?: PageContext;
}

export const FUZZY_THRESHOLD = 0.85;

interface AnswerHit {
  answer: SavedAnswer;
  source: Extract<MappingSource, "answer-exact" | "answer-fuzzy">;
  score: number;
}

export function retrieveAnswer(
  label: string,
  savedAnswers: readonly SavedAnswer[],
): AnswerHit | null {
  const key = normalizeLabel(label);
  if (!key) return null;
  for (const a of savedAnswers) {
    if (a.normalizedKey === key || a.aliasKeys.includes(key)) {
      return { answer: a, source: "answer-exact", score: 1 };
    }
  }
  let best: AnswerHit | null = null;
  for (const a of savedAnswers) {
    const s = fuzzyScore(key, a.normalizedKey);
    if (s >= FUZZY_THRESHOLD && (!best || s > best.score)) {
      best = { answer: a, source: "answer-fuzzy", score: s };
    }
  }
  return best;
}

function abstain(sig: FieldSignal, reason: string, canonical?: string): FieldDecision {
  return {
    ref: sig.ref,
    canonical,
    confidence: 0,
    action: "abstain",
    reason,
  };
}

function review(
  sig: FieldSignal,
  reason: string,
  partial: Partial<FieldDecision> = {},
): FieldDecision {
  return {
    ref: sig.ref,
    confidence: 0,
    action: "review",
    reason,
    ...partial,
  };
}

export function mapField(sig: FieldSignal, ctx: MapperContext): FieldDecision {
  if (!sig.visible) return abstain(sig, "field not visible");

  // consent/certification is a hard gate regardless of mapping
  if (sig.kind === "checkbox" && looksLikeConsent(sig.label)) {
    return review(sig, "consent checkboxes always need you");
  }

  // -- cascade tiers 1–3: find a canonical key ------------------------------
  // ATS "custom question" fields (Greenhouse answers_attributes, Lever cards)
  // still go through the lexicon: they are frequently standard questions
  // (work auth, sponsorship, salary, LinkedIn). Genuinely custom questions
  // simply fall through to saved answers.
  let canonical: CanonicalKey | undefined;
  let source: MappingSource | undefined;

  canonical = adapterLookup(ctx.ats, sig);
  if (canonical) source = "adapter";
  if (!canonical) {
    canonical = autocompleteToCanonical(sig.autocomplete);
    if (canonical) source = "autocomplete";
  }
  if (!canonical) {
    canonical = lexiconLookup(sig.label, sig.sectionHeading);
    if (canonical) source = "lexicon";
  }
  if (!canonical && sig.kind === "file") {
    // "cv" is too short for substring patterns — token-match file inputs
    const tokens = tokenSet(sig.label);
    if (tokens.has("cover")) canonical = "attachments.coverLetter";
    else if (tokens.has("resume") || tokens.has("cv") || tokens.has("résumé"))
      canonical = "attachments.resume";
    if (canonical) source = "lexicon";
  }

  if (canonical && source) {
    return decideForCanonical(sig, canonical, source, ctx);
  }

  // -- tiers 4–5: saved answers ---------------------------------------------
  const hit = retrieveAnswer(sig.label, ctx.savedAnswers);
  if (hit) return decideForAnswer(sig, hit, ctx);

  // -- tier 6 ----------------------------------------------------------------
  return abstain(sig, "no rule, token, lexicon or saved answer matched");
}

function decideForCanonical(
  sig: FieldSignal,
  canonical: CanonicalKey,
  source: MappingSource,
  ctx: MapperContext,
): FieldDecision {
  const risk = riskClassOf(canonical);

  // attachments resolve against stored documents
  if (risk === "file" || sig.kind === "file") {
    return decideForFile(sig, canonical, source, ctx);
  }

  const resolved = resolveProfileValue(canonical, ctx.profile);
  if (!resolved) {
    // mapped but no value → salary may still come from a saved answer;
    // keep the canonical so the salary gate still applies
    if (risk === "salary") {
      const hit = retrieveAnswer(sig.label, ctx.savedAnswers);
      if (hit) return decideForAnswer(sig, hit, ctx, canonical);
    }
    if (risk === "eeo" || risk === "legal" || risk === "salary") {
      return review(sig, "set this in Settings → Explicit answers to autofill it", {
        canonical,
        source,
      });
    }
    return abstain(sig, `no profile value for ${canonical}`, canonical);
  }

  return scoreAndGate(sig, {
    canonical,
    source,
    desired: formatForField(canonical, resolved.text, sig.kind, sig.placeholder, ctx.dateFormatHint),
    values: resolved.values,
    boolValue: resolved.boolValue,
    fromExplicitSetting: resolved.fromExplicitSetting,
    fromSavedAnswer: false,
    retrievalScore: 1,
  });
}

function decideForAnswer(
  sig: FieldSignal,
  hit: { answer: SavedAnswer; source: MappingSource; score: number },
  ctx: MapperContext,
  overrideCanonical?: CanonicalKey,
): FieldDecision {
  const canonical = overrideCanonical ?? `custom.${hit.answer.normalizedKey}`;

  // template answers: substitute {company}/{role} from the page context;
  // if we couldn't detect them, never fill a literal placeholder
  let desired = hit.answer.answer;
  if (hasTemplatePlaceholders(desired)) {
    const substituted = substituteTemplate(desired, ctx.pageContext ?? {});
    if (substituted === null) {
      return review(sig, "couldn't detect the company/role for your template answer", {
        canonical,
        source: hit.source,
        value: desired,
        savedAnswerId: hit.answer.id,
      });
    }
    desired = substituted;
  }

  return scoreAndGate(sig, {
    canonical,
    source: hit.source,
    desired,
    fromExplicitSetting: false,
    fromSavedAnswer: true,
    retrievalScore: hit.score,
    savedAnswerId: hit.answer.id,
  });
}

function decideForFile(
  sig: FieldSignal,
  canonical: CanonicalKey,
  source: MappingSource,
  ctx: MapperContext,
): FieldDecision {
  const role = canonical === "attachments.coverLetter" ? "coverLetter" : "resume";
  const doc = ctx.documents.find((d) => d.role === role);
  if (!doc) return abstain(sig, `no ${role} stored in your vault`, canonical);
  if (sig.accept && !acceptAllows(sig.accept, doc.fileName, doc.mime)) {
    return review(sig, `form wants ${sig.accept} but your ${role} is ${doc.fileName}`, {
      canonical,
      source,
      documentId: doc.id,
    });
  }
  const c = confidence(source, "not-applicable", 1);
  const gated = applyGates(actionForConfidence(c), {
    riskClass: "file",
    fromExplicitSetting: false,
    fromSavedAnswer: false,
    isConsent: false,
  });
  return {
    ref: sig.ref,
    canonical,
    source,
    documentId: doc.id,
    value: doc.fileName,
    confidence: c,
    action: gated.action,
    reason: `will attach ${doc.fileName}`,
  };
}

interface ScoreInput {
  canonical: string;
  source: MappingSource;
  desired: string;
  /** multi-valued canonicals (skills) — matched per entry on multiselects */
  values?: string[];
  boolValue?: boolean;
  fromExplicitSetting: boolean;
  fromSavedAnswer: boolean;
  retrievalScore: number;
  savedAnswerId?: string;
}

function scoreAndGate(sig: FieldSignal, input: ScoreInput): FieldDecision {
  const risk = riskClassOf(input.canonical as CanonicalKey);
  let optionQuality: OptionQuality = "not-applicable";
  let option: { value: string; text: string } | undefined;
  let optionsMulti: { value: string; text: string }[] | undefined;
  let checked: boolean | undefined;
  let desired = input.desired;

  const hasOptions =
    (sig.kind === "select" ||
      sig.kind === "radio_group" ||
      sig.kind === "aria_combobox" ||
      sig.kind === "aria_listbox") &&
    (sig.options?.length ?? 0) > 0;

  if (sig.kind === "multiselect" && (sig.options?.length ?? 0) > 0) {
    // match each of our values independently; pick only verbatim options
    const wanted = input.values ?? [desired];
    const seen = new Set<string>();
    const matched: { value: string; text: string }[] = [];
    let allExact = true;
    for (const w of wanted) {
      const m = resolveOption(w, sig.options ?? []);
      if (!m) continue;
      if (m.quality !== "exact") allExact = false;
      if (!seen.has(m.option.value)) {
        seen.add(m.option.value);
        matched.push(m.option);
      }
    }
    if (matched.length === 0) {
      return review(sig, "none of your values match this field's options", {
        canonical: input.canonical,
        source: input.source,
        value: desired,
        savedAnswerId: input.savedAnswerId,
      });
    }
    optionsMulti = matched;
    optionQuality = allExact ? "exact" : "substring";
    desired = matched.map((m) => m.text).join(", ");
  } else if (hasOptions) {
    const match = resolveOption(input.desired, sig.options ?? []);
    if (!match) {
      return review(sig, `"${truncate(input.desired)}" is not among this field's options`, {
        canonical: input.canonical,
        source: input.source,
        value: input.desired,
        savedAnswerId: input.savedAnswerId,
      });
    }
    option = match.option;
    optionQuality = match.quality;
  } else if (sig.kind === "checkbox") {
    if (input.boolValue === undefined) {
      return review(sig, "checkbox needs a yes/no answer", {
        canonical: input.canonical,
        source: input.source,
        value: input.desired,
      });
    }
    checked = input.boolValue;
  } else if (sig.kind === "number") {
    // number inputs silently reject "$150,000" — strip to digits
    const numeric = desired.replace(/[^\d.]/g, "");
    if (!numeric) {
      return review(sig, "this field needs a number", {
        canonical: input.canonical,
        source: input.source,
        value: desired,
        savedAnswerId: input.savedAnswerId,
      });
    }
    desired = numeric;
  } else if (sig.maxLength && desired.length > sig.maxLength) {
    return review(sig, `answer exceeds the field's ${sig.maxLength}-character limit`, {
      canonical: input.canonical,
      source: input.source,
      value: desired,
      savedAnswerId: input.savedAnswerId,
    });
  }

  const c = confidence(input.source, optionQuality, input.retrievalScore);
  const gated = applyGates(actionForConfidence(c), {
    riskClass: risk,
    fromExplicitSetting: input.fromExplicitSetting,
    fromSavedAnswer: input.fromSavedAnswer,
    isConsent: false,
  });

  return {
    ref: sig.ref,
    canonical: input.canonical,
    source: input.source,
    value: desired,
    option,
    optionsMulti,
    checked,
    confidence: c,
    action: gated.action,
    reason: gated.gateReason ?? reasonFor(input.source, optionQuality),
    savedAnswerId: input.savedAnswerId,
  };
}

function reasonFor(source: MappingSource, oq: OptionQuality): string {
  const base: Record<MappingSource, string> = {
    adapter: "matched a known field on this job board",
    autocomplete: "matched the field's autocomplete token",
    lexicon: "matched the field label",
    "answer-exact": "you answered this exact question before",
    "answer-fuzzy": "similar to a question you answered before",
  };
  return oq === "substring" ? `${base[source]} (closest option)` : base[source];
}

function truncate(s: string, n = 60): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function acceptAllows(accept: string, fileName: string, mime: string): boolean {
  const parts = accept.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return true;
  const ext = `.${(fileName.split(".").pop() ?? "").toLowerCase()}`;
  return parts.some((p) => {
    if (p.startsWith(".")) return p === ext;
    if (p.endsWith("/*")) return mime.toLowerCase().startsWith(p.slice(0, -1));
    return p === mime.toLowerCase();
  });
}

export function mapFields(signals: FieldSignal[], ctx: MapperContext): FieldDecision[] {
  return signals.map((s) => mapField(s, ctx));
}

import type { DecisionAction, MappingSource } from "./types";
import type { RiskClass } from "./canonical-fields";

// Confidence + risk gates (PLAN.md §3.4).
// base = 0.45*rule_tier + 0.30*option_match + 0.25*retrieval_score
// ≥0.90 fill silently · 0.70–0.89 fill + amber · 0.5–0.69 review · <0.5 abstain
// Gates are hard, not score-based.

export const RULE_TIER: Record<MappingSource, number> = {
  adapter: 1.0,
  autocomplete: 0.95,
  lexicon: 0.8,
  "answer-exact": 0.9,
  "answer-fuzzy": 0.65,
};

export type OptionQuality = "exact" | "substring" | "none" | "not-applicable";

export function optionMatchScore(q: OptionQuality): number {
  switch (q) {
    case "exact":
    case "not-applicable":
      return 1.0;
    case "substring":
      return 0.5;
    case "none":
      return 0;
  }
}

export function confidence(
  source: MappingSource,
  optionQuality: OptionQuality,
  retrievalScore: number,
): number {
  const base =
    0.45 * (RULE_TIER[source] ?? 0) +
    0.3 * optionMatchScore(optionQuality) +
    0.25 * retrievalScore;
  return Math.round(base * 1000) / 1000;
}

export function actionForConfidence(c: number): DecisionAction {
  if (c >= 0.9) return "fill";
  if (c >= 0.7) return "fill-amber";
  if (c >= 0.5) return "review";
  return "abstain";
}

export interface GateContext {
  riskClass: RiskClass;
  /** value came from the explicit-settings step of onboarding */
  fromExplicitSetting: boolean;
  /** value came from a saved answer the user authored/confirmed */
  fromSavedAnswer: boolean;
  /** consent/certification checkbox — never auto-act */
  isConsent: boolean;
}

/**
 * Applies the hard gates on top of the score-derived action.
 * Returns the final action plus a reason suffix when a gate downgraded it.
 */
export function applyGates(
  scored: DecisionAction,
  ctx: GateContext,
): { action: DecisionAction; gateReason?: string } {
  if (ctx.isConsent) {
    return { action: "review", gateReason: "consent checkboxes always need you" };
  }
  switch (ctx.riskClass) {
    case "eeo":
    case "legal": {
      if (!ctx.fromExplicitSetting) {
        return {
          action: "review",
          gateReason:
            ctx.riskClass === "eeo"
              ? "EEO answers fill only from your explicit settings"
              : "legal answers fill only from your explicit settings",
        };
      }
      // explicit source: allowed, but never silent
      if (scored === "fill") return { action: "fill-amber" };
      return { action: scored };
    }
    case "salary": {
      if (!ctx.fromExplicitSetting && !ctx.fromSavedAnswer) {
        return {
          action: "review",
          gateReason: "salary fills only from an explicit setting or saved answer",
        };
      }
      if (scored === "fill") return { action: "fill-amber" };
      return { action: scored };
    }
    case "file": {
      // always show what will be attached — never silent
      if (scored === "fill") return { action: "fill-amber" };
      return { action: scored };
    }
    case "normal":
      return { action: scored };
  }
}

const CONSENT_RE =
  /\b(i (agree|consent|certify|acknowledge|confirm|accept)|terms (and|&) conditions|privacy (policy|notice)|by (checking|submitting))\b/i;

export function looksLikeConsent(label: string): boolean {
  return CONSENT_RE.test(label);
}

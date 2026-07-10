import type { SavedAnswer } from "@shared/types";
import { normalizeLabel, trigramSimilarity } from "@shared/normalize";
import { loadAnswers, putAnswer } from "./vault";

// Saved-answer lifecycle (PLAN.md Phase 7): save on user edit/confirm, dedup
// by trigram similarity, grow aliasKeys when the user confirms a fuzzy match —
// the system gets smarter without a model.

export const DEDUP_THRESHOLD = 0.92;

/** Pure: find an existing answer the new question should merge into. */
export function findDuplicate(
  question: string,
  existing: readonly SavedAnswer[],
): SavedAnswer | null {
  const key = normalizeLabel(question);
  let best: SavedAnswer | null = null;
  let bestScore = 0;
  for (const a of existing) {
    if (a.normalizedKey === key || a.aliasKeys.includes(key)) return a;
    const s = trigramSimilarity(key, a.normalizedKey);
    if (s >= DEDUP_THRESHOLD && s > bestScore) {
      best = a;
      bestScore = s;
    }
  }
  return best;
}

/** Pure: merge a confirmed question variant into an answer as an alias. */
export function withAlias(answer: SavedAnswer, question: string): SavedAnswer {
  const key = normalizeLabel(question);
  if (answer.normalizedKey === key || answer.aliasKeys.includes(key)) return answer;
  return { ...answer, aliasKeys: [...answer.aliasKeys, key] };
}

/**
 * Save (or merge) an answer after the user edited/confirmed a value.
 * Returns the stored record.
 */
export async function saveAnswer(question: string, answerText: string): Promise<SavedAnswer> {
  const existing = await loadAnswers();
  const dup = findDuplicate(question, existing);
  const now = Date.now();
  if (dup) {
    const merged: SavedAnswer = {
      ...withAlias(dup, question),
      answer: answerText,
      questionText: question,
      lastUsedAt: now,
    };
    await putAnswer(merged);
    return merged;
  }
  const created: SavedAnswer = {
    id: crypto.randomUUID(),
    questionText: question,
    normalizedKey: normalizeLabel(question),
    aliasKeys: [],
    answer: answerText,
    timesUsed: 0,
    lastUsedAt: now,
    createdAt: now,
  };
  await putAnswer(created);
  return created;
}

/**
 * After a fill where a fuzzy-matched answer was accepted unchanged: learn the
 * new phrasing as an alias and bump usage.
 */
export async function recordAnswerUse(
  answerId: string,
  questionAsSeen: string,
  confirmedFuzzy: boolean,
): Promise<void> {
  const all = await loadAnswers();
  const a = all.find((x) => x.id === answerId);
  if (!a) return;
  const updated: SavedAnswer = {
    ...(confirmedFuzzy ? withAlias(a, questionAsSeen) : a),
    timesUsed: a.timesUsed + 1,
    lastUsedAt: Date.now(),
  };
  await putAnswer(updated);
}

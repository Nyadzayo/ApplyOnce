import type { AtsId, FieldSignal } from "@shared/types";
import type { AutoDecisionsResponse, FilePrepResponse } from "@shared/messages";
import { b64encode } from "@shared/messages";
import { mapFields } from "@shared/mapper";
import {
  getSettings,
  listDocuments,
  loadAnswers,
  loadDocumentBytes,
  loadProfile,
} from "@storage/vault";
import { isUnlocked, restoreSessionKey } from "@storage/crypto";
import type { PageContext } from "@shared/page-context";
import { ClassifyResponse } from "@shared/messages";
import type { ClassifierHint } from "@shared/intent-map";
import type { ClassifyField } from "@shared/classifier-assets";
import { offscreenRequest } from "./offscreen-bridge";

// SW-side mapping service: lets the in-page widget work without the side
// panel being open. Uses the exact same pure mapper as the panel — one
// cascade, one set of gates. The SW stays stateless: everything is read from
// the vault per request.

export async function computeDecisions(
  ats: AtsId,
  signals: FieldSignal[],
  pageContext?: PageContext,
): Promise<AutoDecisionsResponse> {
  const settings = await getSettings();
  if (!settings.autoDetect) return { enabled: false, locked: false, decisions: [] };

  if (settings.passphraseEnabled && !isUnlocked()) {
    const restored = await restoreSessionKey();
    if (!restored) return { enabled: true, locked: true, decisions: [] };
  }

  try {
    const [profile, savedAnswers, documents] = await Promise.all([
      loadProfile(),
      loadAnswers(),
      listDocuments(),
    ]);
    // no profile yet → nothing useful to suggest
    if (!profile.basics.email && !profile.basics.firstName) {
      return { enabled: false, locked: false, decisions: [] };
    }
    const ctx = {
      ats,
      profile,
      savedAnswers,
      documents,
      dateFormatHint: settings.dateFormatHint,
      pageContext,
    };
    let decisions = mapFields(signals, ctx);
    if (settings.classifierEnabled) {
      // v0.2 tier 5.5: only the fields nothing else could map go to the model
      const unmapped = unmappedFields(signals, decisions);
      const hints = await classifyViaOffscreen(unmapped);
      if (hints.size > 0) decisions = mapFields(signals, { ...ctx, classifier: hints });
    }
    return { enabled: true, locked: false, decisions };
  } catch (e) {
    if (e instanceof Error && e.name === "VaultLockedError") {
      return { enabled: true, locked: true, decisions: [] };
    }
    throw e;
  }
}

/** Visible fields the deterministic cascade abstained on without a key. */
export function unmappedFields(
  signals: FieldSignal[],
  decisions: { ref: string; action: string; canonical?: string }[],
): ClassifyField[] {
  const abstained = new Set(decisions.filter((d) => d.action === "abstain" && !d.canonical).map((d) => d.ref));
  return signals
    .filter((s) => abstained.has(s.ref) && s.visible && s.label && s.kind !== "file")
    .map((s) => ({ ref: s.ref, label: s.label, kind: s.kind, options: s.options?.map((o) => o.text).slice(0, 8) }));
}

/** Run the offscreen classifier over the given fields; empty on any failure. */
export async function classifyViaOffscreen(fields: ClassifyField[]): Promise<Map<string, ClassifierHint>> {
  const out = new Map<string, ClassifierHint>();
  if (fields.length === 0) return out;
  try {
    const parsed = ClassifyResponse.safeParse(await offscreenRequest({ kind: "CLASSIFY_REQUEST", fields }, 10));
    if (!parsed.success || !parsed.data.ok) return out;
    for (const h of parsed.data.hints) out.set(h.ref, { intent: h.intent, score: h.score, key: h.key as ClassifierHint["key"] });
  } catch {
    // classifier is best-effort; the deterministic decisions stand
  }
  return out;
}

export async function prepareFiles(
  requests: { ref: string; documentId: string }[],
): Promise<FilePrepResponse> {
  const files: FilePrepResponse["files"] = [];
  for (const r of requests) {
    const doc = await loadDocumentBytes(r.documentId);
    if (doc) {
      files.push({
        ref: r.ref,
        fileName: doc.meta.fileName,
        mime: doc.meta.mime,
        dataB64: b64encode(doc.data),
      });
    }
  }
  return { files };
}

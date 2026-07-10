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
    const decisions = mapFields(signals, {
      ats,
      profile,
      savedAnswers,
      documents,
      dateFormatHint: settings.dateFormatHint,
      pageContext,
    });
    return { enabled: true, locked: false, decisions };
  } catch (e) {
    if (e instanceof Error && e.name === "VaultLockedError") {
      return { enabled: true, locked: true, decisions: [] };
    }
    throw e;
  }
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

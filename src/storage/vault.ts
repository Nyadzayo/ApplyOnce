import {
  CandidateProfile,
  SavedAnswer,
  StoredDocument,
  VaultSettings,
  emptyProfile,
} from "@shared/types";
import { b64decode, b64encode } from "@shared/messages";
import { db } from "./db";
import { open, seal } from "./crypto";

// Vault access: every record zod-validated on read AND write; profile keeps a
// last-good snapshot; JSON export/import from day one (PLAN.md Phase 5).

async function settings(): Promise<VaultSettings> {
  const row = await db().settings.get("settings");
  return VaultSettings.parse(row?.value ?? {});
}

export async function saveSettings(patch: Partial<VaultSettings>): Promise<VaultSettings> {
  const cur = await settings();
  const next = VaultSettings.parse({ ...cur, ...patch });
  await db().settings.put({ id: "settings", value: next });
  return next;
}

export const getSettings = settings;

async function encryptionOn(): Promise<boolean> {
  return (await settings()).passphraseEnabled;
}

// -- profile -----------------------------------------------------------------

export async function loadProfile(): Promise<CandidateProfile> {
  const row = await db().profile.get("profile");
  if (!row) return emptyProfile();
  const raw = await open(row.envelope);
  const parsed = CandidateProfile.safeParse(raw);
  if (parsed.success) return parsed.data;
  // corrupted current record → try the last-good snapshot
  if (row.previous) {
    const prev = CandidateProfile.safeParse(await open(row.previous));
    if (prev.success) return prev.data;
  }
  return emptyProfile();
}

export async function saveProfile(profile: CandidateProfile): Promise<void> {
  const valid = CandidateProfile.parse(profile);
  const enc = await encryptionOn();
  const envelope = await seal(valid, enc);
  const existing = await db().profile.get("profile");
  await db().profile.put({
    id: "profile",
    envelope,
    updatedAt: Date.now(),
    previous: existing?.envelope,
  });
}

// -- documents ---------------------------------------------------------------

export async function saveDocument(
  role: StoredDocument["role"],
  fileName: string,
  mime: string,
  data: ArrayBuffer,
): Promise<StoredDocument> {
  const meta = StoredDocument.parse({
    id: crypto.randomUUID(),
    role,
    fileName,
    mime,
    size: data.byteLength,
    addedAt: Date.now(),
  });
  const enc = await encryptionOn();
  // one document per role in v1
  const olds = await db().documents.where("meta.role").equals(role).toArray();
  await db().documents.bulkDelete(olds.map((o) => o.id));
  await db().documents.put({
    id: meta.id,
    meta,
    bytes: await seal(b64encode(data), enc),
  });
  return meta;
}

export async function listDocuments(): Promise<StoredDocument[]> {
  const rows = await db().documents.toArray();
  return rows.map((r) => StoredDocument.parse(r.meta));
}

export async function loadDocumentBytes(id: string): Promise<{ meta: StoredDocument; data: ArrayBuffer } | null> {
  const row = await db().documents.get(id);
  if (!row) return null;
  const b64 = (await open(row.bytes)) as string;
  return { meta: StoredDocument.parse(row.meta), data: b64decode(b64) };
}

export async function deleteDocument(id: string): Promise<void> {
  await db().documents.delete(id);
}

// -- saved answers (persistence; retrieval logic lives in shared/mapper) -----

export async function loadAnswers(): Promise<SavedAnswer[]> {
  const rows = await db().savedAnswers.toArray();
  const out: SavedAnswer[] = [];
  for (const r of rows) {
    const parsed = SavedAnswer.safeParse(await open(r.envelope));
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export async function putAnswer(answer: SavedAnswer): Promise<void> {
  const valid = SavedAnswer.parse(answer);
  const enc = await encryptionOn();
  await db().savedAnswers.put({
    id: valid.id,
    envelope: await seal(valid, enc),
    updatedAt: Date.now(),
  });
}

export async function deleteAnswer(id: string): Promise<void> {
  await db().savedAnswers.delete(id);
}

// -- export / import ----------------------------------------------------------

export interface VaultExport {
  format: "fastapply-vault";
  version: 1;
  exportedAt: number;
  profile: CandidateProfile;
  savedAnswers: SavedAnswer[];
  documents: { meta: StoredDocument; dataB64: string }[];
  settings: VaultSettings;
}

export async function exportVault(): Promise<VaultExport> {
  const docs = await listDocuments();
  const withBytes = [];
  for (const meta of docs) {
    const loaded = await loadDocumentBytes(meta.id);
    if (loaded) withBytes.push({ meta, dataB64: b64encode(loaded.data) });
  }
  return {
    format: "fastapply-vault",
    version: 1,
    exportedAt: Date.now(),
    profile: await loadProfile(),
    savedAnswers: await loadAnswers(),
    documents: withBytes,
    settings: await settings(),
  };
}

export async function importVault(raw: unknown): Promise<void> {
  const data = raw as VaultExport;
  if (data?.format !== "fastapply-vault" || data.version !== 1) {
    throw new Error("Not an ApplyOnce vault export file.");
  }
  await saveProfile(CandidateProfile.parse(data.profile));
  for (const a of data.savedAnswers ?? []) await putAnswer(SavedAnswer.parse(a));
  for (const d of data.documents ?? []) {
    const meta = StoredDocument.parse(d.meta);
    await saveDocument(meta.role, meta.fileName, meta.mime, b64decode(d.dataB64));
  }
}

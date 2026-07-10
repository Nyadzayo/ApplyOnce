import Dexie, { type EntityTable } from "dexie";
import type { Envelope } from "./crypto";
import type {
  FillLogEntry,
  JobHistoryEntry,
  StoredDocument,
  VaultSettings,
} from "@shared/types";

// Dexie schema (PLAN.md Phase 5).
// Sensitive values (profile, saved answers, document bytes) are stored inside
// envelopes so optional passphrase encryption wraps them transparently.
// fillLog and settings hold structure only — never values.

export interface ProfileRow {
  id: string; // "profile"
  envelope: Envelope;
  updatedAt: number;
  /** last-good snapshot for rollback */
  previous?: Envelope;
}

export interface DocumentRow {
  id: string;
  meta: StoredDocument;
  /** file bytes, base64 inside the envelope */
  bytes: Envelope;
}

export interface AnswerRow {
  id: string;
  /** plaintext retrieval keys (needed for matching while locked = no) —
   *  when passphrase mode is on these are inside the envelope instead */
  envelope: Envelope;
  updatedAt: number;
}

export interface SettingsRow {
  id: string; // "settings"
  value: VaultSettings;
}

export interface FillLogRow extends FillLogEntry {}

export interface JobRow extends JobHistoryEntry {}

export class ApplyOnceDB extends Dexie {
  profile!: EntityTable<ProfileRow, "id">;
  documents!: EntityTable<DocumentRow, "id">;
  savedAnswers!: EntityTable<AnswerRow, "id">;
  fillLog!: EntityTable<FillLogRow, "id">;
  settings!: EntityTable<SettingsRow, "id">;
  jobs!: EntityTable<JobRow, "id">;

  constructor() {
    super("fastapply");
    this.version(1).stores({
      profile: "id",
      documents: "id, meta.role",
      savedAnswers: "id, updatedAt",
      fillLog: "id, at",
      settings: "id",
    });
    this.version(2).stores({
      jobs: "id, url, firstSeenAt, domain",
    });
  }
}

let _db: ApplyOnceDB | null = null;
export function db(): ApplyOnceDB {
  if (!_db) _db = new ApplyOnceDB();
  return _db;
}

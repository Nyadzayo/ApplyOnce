import { useCallback, useEffect, useState } from "react";
import type { CandidateProfile, SavedAnswer, StoredDocument, VaultSettings } from "@shared/types";
import {
  getSettings,
  listDocuments,
  loadAnswers,
  loadProfile,
  saveProfile,
} from "@storage/vault";

export function useVaultData() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [settings, setSettings] = useState<VaultSettings | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [p, a, d, s] = await Promise.all([
        loadProfile(),
        loadAnswers(),
        listDocuments(),
        getSettings(),
      ]);
      setProfile(p);
      setAnswers(a);
      setDocuments(d);
      setSettings(s);
      setLocked(false);
      setError(null);
    } catch (e) {
      if (e instanceof Error && e.name === "VaultLockedError") setLocked(true);
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persistProfile = useCallback(
    async (p: CandidateProfile) => {
      await saveProfile(p);
      setProfile(p);
    },
    [],
  );

  return {
    profile,
    answers,
    documents,
    settings,
    locked,
    error,
    refresh,
    persistProfile,
  };
}

export async function activeTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

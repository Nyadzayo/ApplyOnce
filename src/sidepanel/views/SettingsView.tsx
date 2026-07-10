import { useState } from "react";
import type { VaultHook } from "../App";
import {
  exportVault,
  importVault,
  loadAnswers,
  loadDocumentBytes,
  listDocuments,
  loadProfile,
  putAnswer,
  saveDocument,
  saveProfile,
  saveSettings,
} from "@storage/vault";
import { lock, makeSalt, unlock } from "@storage/crypto";

// Settings: passphrase encryption, work-everywhere permission, date format,
// vault export/import (PLAN.md Phase 5 + Part 1).

export function SettingsView({ vault }: { vault: VaultHook }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const s = vault.settings;
  if (!s) return null;

  async function rewriteAllRecords() {
    // re-seal every sensitive record under the new encryption mode
    const profile = await loadProfile();
    await saveProfile(profile);
    for (const a of await loadAnswers()) await putAnswer(a);
    for (const meta of await listDocuments()) {
      const doc = await loadDocumentBytes(meta.id);
      if (doc) await saveDocument(meta.role, meta.fileName, meta.mime, doc.data);
    }
  }

  async function enablePassphrase() {
    setBusy(true);
    try {
      const salt = makeSalt();
      await unlock(pass, salt);
      await saveSettings({ passphraseEnabled: true, kdfSaltB64: salt });
      await rewriteAllRecords();
      setNote("Passphrase encryption enabled.");
      setPass("");
      await vault.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disablePassphrase() {
    setBusy(true);
    try {
      await saveSettings({ passphraseEnabled: false, kdfSaltB64: undefined });
      await rewriteAllRecords();
      lock();
      setNote("Passphrase encryption disabled. Data is stored in plain IndexedDB.");
      await vault.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function doExport() {
    const data = await exportVault();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fastapply-vault-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1>Settings</h1>

      <h2>Privacy</h2>
      <p className="hint">
        Your data never leaves your device. Without a passphrase it's stored in
        plain IndexedDB, protected by your OS user account. That's the honest
        description, not marketing.
      </p>
      {!s.passphraseEnabled ? (
        <div className="card">
          <div className="q">Enable passphrase encryption</div>
          <p className="hint">
            Encrypts your profile, answers and documents (AES-GCM). You'll
            unlock once per browser session. If you forget the passphrase, the
            data is unrecoverable.
          </p>
          <div className="field-row">
            <label>Choose a passphrase</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <button
            className="primary"
            disabled={busy || pass.length < 8}
            onClick={() => void enablePassphrase()}
          >
            {busy ? "Encrypting…" : "Enable (min 8 chars)"}
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="q">Passphrase encryption is on</div>
          <div className="btn-row">
            <button className="secondary" disabled={busy} onClick={() => void disablePassphrase()}>
              Disable
            </button>
            <button className="secondary" onClick={() => { lock(); location.reload(); }}>
              Lock now
            </button>
          </div>
        </div>
      )}

      <h2>Filling</h2>
      <div className="checkline">
        <input
          type="checkbox"
          id="ad"
          checked={s.autoDetect}
          onChange={async (e) => {
            await saveSettings({ autoDetect: e.target.checked });
            await chrome.runtime.sendMessage({ kind: "SETTINGS_CHANGED" });
            await vault.refresh();
          }}
        />
        <label htmlFor="ad">
          Auto-detect application forms on sites you've allowed (shows the
          floating ApplyOnce button)
        </label>
      </div>
      <div className="btn-row">
        <button
          className="secondary"
          onClick={async () => {
            const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
            let host = "";
            try {
              host = tab?.url ? new URL(tab.url).hostname : "";
            } catch {
              host = "";
            }
            if (!host) {
              setNote("Couldn't read the current tab's site.");
              return;
            }
            await chrome.storage.local.set({ [`fa.hide.${host}`]: Date.now() });
            setNote(`Widget hidden on ${host} for a week. Refresh the page.`);
          }}
        >
          Hide widget on the current site (1 week)
        </button>
        <button
          className="secondary"
          onClick={async () => {
            const all = await chrome.storage.local.get(null);
            const keys = Object.keys(all).filter(
              (k) =>
                k.startsWith("fa.hide.") ||
                k.startsWith("fa.dismiss.") || // legacy namespace
                k.startsWith("fa.pos."),
            );
            if (keys.length > 0) await chrome.storage.local.remove(keys);
            const hidden = keys.filter((k) => !k.startsWith("fa.pos.")).length;
            setNote(
              hidden > 0
                ? `Widget re-enabled on ${hidden} hidden site(s); positions reset. Refresh the page.`
                : "No hidden sites. The widget wasn't hidden anywhere.",
            );
          }}
        >
          Reset hidden sites & widget positions
        </button>
      </div>
      <div className="field-row">
        <label>Date format to type into text fields</label>
        <select
          value={s.dateFormatHint}
          onChange={(e) => void saveSettings({ dateFormatHint: e.target.value }).then(vault.refresh)}
        >
          <option>MM/DD/YYYY</option>
          <option>DD/MM/YYYY</option>
          <option>YYYY-MM-DD</option>
          <option>MM/YYYY</option>
        </select>
      </div>
      <h2>Backup</h2>
      <div className="btn-row">
        <button className="secondary" onClick={() => void doExport()}>
          Export vault (JSON)
        </button>
        <label className="file-btn">
          Import vault
          <input
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await importVault(JSON.parse(await f.text()));
                setNote("Vault imported.");
                await vault.refresh();
              } catch (err) {
                setNote(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </label>
      </div>
      {note && <p className="ok">{note}</p>}
    </div>
  );
}

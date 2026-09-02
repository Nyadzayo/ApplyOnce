import { useEffect, useState } from "react";
import type { VaultHook } from "../App";
import { getTelemetryEnabled, setTelemetryEnabled, track } from "../telemetry";
import { ClassifierStatus } from "@shared/messages";
import { CLASSIFIER_DOWNLOAD_MB } from "@shared/classifier-assets";
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
import { hasAllSitesAccess, requestAllSitesAccess } from "@shared/platform";

// Settings: passphrase encryption, work-everywhere permission, date format,
// vault export/import (PLAN.md Phase 5 + Part 1).

export function SettingsView({ vault }: { vault: VaultHook }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState(true);
  const [allSites, setAllSites] = useState(true);
  const [classifierNote, setClassifierNote] = useState<string | null>(null);

  // status of the on-device model; `warm` also downloads/loads it
  async function refreshClassifier(warm: boolean) {
    setClassifierNote("Checking the model...");
    const status = ClassifierStatus.safeParse(await chrome.runtime.sendMessage({ kind: "CLASSIFIER_STATUS" }).catch(() => null));
    if (!status.success || !status.data.available) {
      setClassifierNote("The model is not available on this browser. Everything else keeps working.");
      return;
    }
    if (status.data.cached && !warm) {
      setClassifierNote("Model ready. It runs entirely on this device.");
      return;
    }
    setClassifierNote(status.data.cached ? "Loading the model..." : `Downloading the model (${CLASSIFIER_DOWNLOAD_MB} MB, once)...`);
    const result = (await chrome.runtime.sendMessage({ kind: "CLASSIFIER_WARMUP" }).catch(() => null)) as { ok?: boolean; error?: string } | null;
    setClassifierNote(result?.ok ? "Model ready. It runs entirely on this device." : `Couldn't load the model: ${result?.error ?? "unknown error"}`);
  }
  useEffect(() => {
    if (vault.settings?.classifierEnabled) void refreshClassifier(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.settings?.classifierEnabled]);
  useEffect(() => {
    void getTelemetryEnabled().then(setTelemetry);
    void hasAllSitesAccess().then(setAllSites);
  }, []);
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

      {!allSites && (
        <div className="callout">
          <p className="hint">
            Auto-detection is off: this browser hasn't granted ApplyOnce access
            to websites yet, so application pages won't be recognised until
            you allow it. Everything still runs on your device.
          </p>
          <button
            onClick={async () => {
              const ok = await requestAllSitesAccess();
              setAllSites(ok);
              if (ok) setNote("Site access granted. Reload any open application page.");
            }}
          >
            Allow ApplyOnce on all sites
          </button>
        </div>
      )}

      <h2>Privacy</h2>
      <p className="hint">
        Your data never leaves your device. Without a passphrase it's stored in
        plain IndexedDB, protected by your OS user account. That's the honest
        description, not marketing.
      </p>
      <div className="checkline">
        <input
          type="checkbox"
          id="telemetry"
          checked={telemetry}
          onChange={async (e) => {
            const on = e.target.checked;
            setTelemetry(on);
            await setTelemetryEnabled(on);
          }}
        />
        <label htmlFor="telemetry">
          Share anonymous usage statistics (event counts and which job platform
          a fill ran on — never form values, resume content, or page addresses;
          see the privacy policy)
        </label>
      </div>
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
            track("settings_changed", { field: `auto_detect_${e.target.checked ? "on" : "off"}` });
            await vault.refresh();
          }}
        />
        <label htmlFor="ad">
          Auto-detect application forms on sites you've allowed (shows the
          floating ApplyOnce button)
        </label>
      </div>
      <div className="checkline">
        <input
          type="checkbox"
          id="clf"
          checked={s.classifierEnabled}
          onChange={async (e) => {
            const on = e.target.checked;
            await saveSettings({ classifierEnabled: on });
            track("settings_changed", { field: `classifier_${on ? "on" : "off"}` });
            await vault.refresh();
            if (!on) setClassifierNote("Off. Fields the rules can't map are left for you.");
            // turning it on: the effect above downloads and loads the model
          }}
        />
        <label htmlFor="clf">
          On-device question classifier for fields the rules can't map (on by
          default; downloads a {CLASSIFIER_DOWNLOAD_MB} MB model once, runs
          locally, and its suggestions are always amber for you to check)
        </label>
      </div>
      {classifierNote && <p className="hint">{classifierNote}</p>}
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

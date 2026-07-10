import { useEffect, useState } from "react";
import { useVaultData } from "./hooks";
import { FillView } from "./views/FillView";
import { OnboardView } from "./views/OnboardView";
import { ProfileView } from "./views/ProfileView";
import { SettingsView } from "./views/SettingsView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { HistoryView } from "./views/HistoryView";
import { isUnlocked, restoreSessionKey, unlock } from "@storage/crypto";

type Tab = "fill" | "profile" | "history" | "settings" | "diagnostics" | "onboard";

export function App() {
  const vault = useVaultData();
  const [tab, setTab] = useState<Tab | null>(null);
  const [unlockNeeded, setUnlockNeeded] = useState(false);

  useEffect(() => {
    void (async () => {
      if (vault.settings?.passphraseEnabled && !isUnlocked()) {
        const restored = await restoreSessionKey();
        if (!restored) {
          setUnlockNeeded(true);
          return;
        }
        await vault.refresh();
      }
      setUnlockNeeded(false);
    })();
  }, [vault.settings?.passphraseEnabled]);

  // first run → onboarding
  useEffect(() => {
    if (tab === null && vault.profile) {
      const empty = !vault.profile.basics.email && !vault.profile.basics.firstName;
      setTab(empty ? "onboard" : "fill");
    }
  }, [vault.profile, tab]);

  if (unlockNeeded && vault.settings) {
    return <UnlockScreen salt={vault.settings.kdfSaltB64 ?? ""} onUnlocked={() => {
      setUnlockNeeded(false);
      void vault.refresh();
    }} />;
  }

  if (!vault.profile || tab === null) {
    return <main className="view"><p className="hint">Loading…</p></main>;
  }

  return (
    <>
      <header className="brand">
        <BrandMark />
        <span className="name">
          Apply<b>Once</b>
        </span>
      </header>
      <nav className="tabs" aria-label="Sections">
        {(
          [
            ["fill", "Fill"],
            ["profile", "Profile"],
            ["history", "Applications"],
            ["settings", "Settings"],
            ["diagnostics", "Diagnostics"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
        {tab === "onboard" && <button className="active">Set up</button>}
      </nav>
      <main className="view">
        {tab === "onboard" && (
          <OnboardView vault={vault} onDone={() => setTab("fill")} />
        )}
        {tab === "fill" && <FillView vault={vault} />}
        {tab === "profile" && <ProfileView vault={vault} />}
        {tab === "history" && <HistoryView />}
        {tab === "settings" && <SettingsView vault={vault} />}
        {tab === "diagnostics" && <DiagnosticsView />}
      </main>
    </>
  );
}

function UnlockScreen({ salt, onUnlocked }: { salt: string; onUnlocked: () => void }) {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="view">
      <h1>Unlock your vault</h1>
      <p className="hint">Your profile is encrypted with your passphrase.</p>
      <div className="field-row">
        <label htmlFor="pp">Passphrase</label>
        <input
          id="pp"
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void tryUnlock()}
        />
      </div>
      {err && <p className="error">{err}</p>}
      <div className="btn-row">
        <button className="primary" disabled={busy || !pass} onClick={() => void tryUnlock()}>
          Unlock
        </button>
      </div>
    </main>
  );

  async function tryUnlock() {
    setBusy(true);
    setErr(null);
    try {
      await unlock(pass, salt);
      onUnlocked();
    } catch {
      setErr("That passphrase didn't work.");
    } finally {
      setBusy(false);
    }
  }
}

function BrandMark() {
  return (
    <svg className="mark" viewBox="0 0 128 128" aria-hidden="true">
      <rect x="6" y="6" width="116" height="116" rx="30" fill="#0065AD" />
      <rect
        x="13" y="13" width="102" height="102" rx="24"
        fill="none" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="3"
      />
      <path
        d="M 38 66 L 57 86 L 92 42"
        fill="none" stroke="#FFFFFF" strokeWidth="14"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export type VaultHook = ReturnType<typeof useVaultData>;

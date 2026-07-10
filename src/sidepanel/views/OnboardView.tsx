import { useEffect, useRef, useState } from "react";
import type { CandidateProfile, ProfilePatch } from "@shared/types";
import { b64encode, parseMsg } from "@shared/messages";
import { saveDocument } from "@storage/vault";
import { parseCvText } from "@shared/cvparse";
import type { VaultHook } from "../App";
import { ExplicitSettingsForm, ProfileForm } from "./ProfileForm";

// Onboarding (PLAN.md Phase 6): drop resume → parse → side-by-side review →
// explicit-settings step → done. Target < 3 minutes to first fill.

type Step = "drop" | "review" | "explicit";

export function OnboardView({ vault, onDone }: { vault: VaultHook; onDone: () => void }) {
  const [step, setStep] = useState<Step>("drop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patch, setPatch] = useState<ProfilePatch | null>(null);
  const [rawText, setRawText] = useState("");
  const [draft, setDraft] = useState<CandidateProfile | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<{ name: string; mime: string; data: ArrayBuffer } | null>(null);
  const jobRef = useRef<string | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const listener = (raw: unknown) => {
      const msg = parseMsg(raw);
      if (!msg || msg.kind !== "PARSE_CV_RESULT" || msg.jobId !== jobRef.current) return;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      setBusy(false);
      if (!msg.ok || !msg.patch) {
        setError(msg.error ?? "Couldn't parse that file.");
        return;
      }
      setPatch(msg.patch);
      setRawText(msg.rawText ?? "");
      setDraft(msg.patch.profile);
      setStep("review");
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const data = await file.arrayBuffer();
      fileRef.current = { name: file.name, mime: file.type, data };
      const jobId = crypto.randomUUID();
      jobRef.current = jobId;
      watchdogRef.current = setTimeout(() => {
        setBusy(false);
        setError(
          "Parsing timed out. Try reloading the extension (chrome://extensions → ⟳), or use “Paste text instead”.",
        );
      }, 45_000);
      const resp: unknown = await chrome.runtime.sendMessage({
        kind: "PARSE_CV_REQUEST",
        jobId,
        fileName: file.name,
        mime: file.type,
        dataB64: b64encode(data),
      });
      const ok = Boolean((resp as { ok?: boolean } | { kind?: string } | undefined));
      if (!ok) throw new Error("The parser didn't respond.");
    } catch (e) {
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      setBusy(false);
      setError(
        `Couldn't start parsing: ${e instanceof Error ? e.message : String(e)}. ` +
          "Reload the extension and retry, or use “Paste text instead”.",
      );
    }
  }

  function handlePaste() {
    const p = parseCvText(pasted);
    setPatch(p);
    setRawText(pasted);
    setDraft(p.profile);
    setStep("review");
  }

  async function finishReview() {
    if (!draft) return;
    if (fileRef.current) {
      await saveDocument("resume", fileRef.current.name, fileRef.current.mime, fileRef.current.data);
    }
    await vault.persistProfile(draft);
    setStep("explicit");
  }

  async function finishExplicit() {
    if (draft) await vault.persistProfile(draft);
    await vault.refresh();
    onDone();
  }

  if (step === "drop") {
    return (
      <div>
        <h1>Set up ApplyOnce</h1>
        <p className="hint">
          Drop your resume. It's parsed on your device and never uploaded
          anywhere. You'll review everything before it's saved. No resume
          handy? LinkedIn → your profile → More → "Save to PDF" works too.
        </p>
        {!pasteMode ? (
          <>
            <label
              className={`drop ${dragging ? "active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
            >
              {busy ? "Parsing…" : "Drop your resume here or click to choose (PDF/DOCX)"}
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
            <div className="btn-row">
              <button className="secondary" onClick={() => setPasteMode(true)}>
                Paste text instead
              </button>
              <button className="secondary" onClick={() => { setDraft(vault.profile); setPatch({ profile: vault.profile!, evidence: {}, warnings: [] }); setStep("review"); }}>
                Skip, type it in manually
              </button>
            </div>
          </>
        ) : (
          <>
            <textarea
              rows={12}
              placeholder="Paste your resume text here"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <div className="btn-row">
              <button className="primary" disabled={pasted.length < 50} onClick={handlePaste}>
                Parse pasted text
              </button>
              <button className="secondary" onClick={() => setPasteMode(false)}>Back</button>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (step === "review" && draft) {
    return (
      <div>
        <h1>Check what we extracted</h1>
        <p className="hint">
          Fix anything that's wrong. Parsing is imperfect on purpose; you're
          the source of truth. The original text is on the right.
        </p>
        {patch?.warnings.map((w) => (
          <p className="warn" key={w}>⚠ {w}</p>
        ))}
        <div className={rawText ? "split" : ""}>
          <ProfileForm profile={draft} onChange={setDraft} />
          {rawText && (
            <div>
              <h2>Source document</h2>
              <div className="rawtext">{rawText.slice(0, 20000)}</div>
            </div>
          )}
        </div>
        <div className="btn-row">
          <button className="primary" onClick={() => void finishReview()}>
            Looks right, continue
          </button>
        </div>
      </div>
    );
  }

  if (step === "explicit" && draft) {
    return (
      <div>
        <h1>Your explicit answers</h1>
        <ExplicitSettingsForm profile={draft} onChange={setDraft} />
        <div className="btn-row">
          <button className="primary" onClick={() => void finishExplicit()}>
            Finish setup
          </button>
        </div>
      </div>
    );
  }

  return null;
}

import { useEffect, useRef, useState } from "react";
import type { CandidateProfile, ProfilePatch } from "@shared/types";
import { b64encode, parseMsg } from "@shared/messages";
import { deleteDocument, saveDocument } from "@storage/vault";
import { parseCvText } from "@shared/cvparse";
import { mergeImportedProfile } from "@shared/profile-merge";
import type { VaultHook } from "../App";
import { track } from "../telemetry";
import { ExplicitSettingsForm, ProfileForm } from "./ProfileForm";

function importMethod(fileName: string, mime: string): string {
  if (mime.includes("pdf") || /\.pdf$/i.test(fileName)) return "file_pdf";
  if (mime.includes("word") || /\.docx$/i.test(fileName)) return "file_docx";
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(fileName)) return "file_image";
  return "file_txt";
}

const ACCEPT = ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp";

// Onboarding (PLAN.md Phase 6): drop resume → parse → side-by-side review →
// explicit-settings step → done. Target < 3 minutes to first fill.

type Step = "drop" | "review" | "explicit";

export function OnboardView({
  vault,
  onDone,
  mode = "onboard",
  onCancel,
}: {
  vault: VaultHook;
  onDone: () => void;
  /** "reimport": replace the resume of an existing profile (Profile tab) */
  mode?: "onboard" | "reimport";
  onCancel?: () => void;
}) {
  const reimport = mode === "reimport";
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
  const methodRef = useRef("manual");

  useEffect(() => {
    if (!reimport) track("onboarding_started", { surface: "panel" }, true);
  }, [reimport]);

  useEffect(() => {
    const listener = (raw: unknown) => {
      const msg = parseMsg(raw);
      if (!msg || msg.kind !== "PARSE_CV_RESULT" || msg.jobId !== jobRef.current) return;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      setBusy(false);
      if (!msg.ok || !msg.patch) {
        setError(msg.error ?? "Couldn't parse that file.");
        track("resume_import_failed", {
          method: methodRef.current,
          reason: msg.error ?? "unknown",
        });
        return;
      }
      track("resume_imported", { method: methodRef.current, reimport, ...parseCoverage(msg.patch) });
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
      methodRef.current = importMethod(file.name, file.type);
      track("resume_import_started", { method: methodRef.current, reimport });
      const jobId = crypto.randomUUID();
      jobRef.current = jobId;
      watchdogRef.current = setTimeout(() => {
        setBusy(false);
        setError(
          "Parsing timed out. Try reloading the extension (chrome://extensions → ⟳), or use “Paste text instead”.",
        );
      }, 120_000); // OCR of a scan can take a minute in wasm
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
    methodRef.current = "paste";
    track("resume_import_started", { method: "paste", reimport });
    const p = parseCvText(pasted);
    track("resume_imported", { method: "paste", reimport, ...parseCoverage(p) });
    setPatch(p);
    setRawText(pasted);
    setDraft(p.profile);
    setStep("review");
  }

  async function finishReview() {
    if (!draft) return;
    if (fileRef.current) {
      // the form filler attaches the first stored resume, so a re-import
      // replaces the old file rather than adding a second one
      if (reimport) {
        for (const d of vault.documents.filter((x) => x.role === "resume")) await deleteDocument(d.id);
      }
      await saveDocument("resume", fileRef.current.name, fileRef.current.mime, fileRef.current.data);
    }
    if (patch) track("resume_reviewed", { method: methodRef.current, reimport, ...reviewEdits(patch, draft) });
    if (reimport && vault.profile) {
      await vault.persistProfile(mergeImportedProfile(vault.profile, draft));
      await vault.refresh();
      onDone();
      return;
    }
    await vault.persistProfile(draft);
    setStep("explicit");
  }

  async function finishExplicit() {
    if (draft) await vault.persistProfile(draft);
    await vault.refresh();
    try {
      const stored = await chrome.storage.local.get("fa.telemetry.installedAt");
      const at = stored["fa.telemetry.installedAt"] as number | undefined;
      track(
        "onboarding_completed",
        {
          method: methodRef.current,
          ...(at ? { hours_since_install: Math.round(((Date.now() - at) / 36e5) * 10) / 10 } : {}),
        },
        true,
      );
    } catch {
      track("onboarding_completed", { method: methodRef.current }, true);
    }
    onDone();
  }

  if (step === "drop") {
    return (
      <div>
        <h1>{reimport ? "Import a new resume" : "Set up ApplyOnce"}</h1>
        <p className="hint">
          {reimport
            ? "Drop your updated resume. Work history, education and skills are replaced by what it says; your explicit answers and anything the new resume leaves out are kept. The stored resume file used for uploads is replaced too."
            : "Drop your resume. It's parsed on your device and never uploaded anywhere. You'll review everything before it's saved. No resume handy? LinkedIn → your profile → More → \"Save to PDF\" works too."}
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
              {busy ? "Parsing…" : "Drop your resume here or click to choose (PDF, DOCX, or a scan/photo)"}
              <input
                type="file"
                accept={ACCEPT}
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
              {!reimport && (
                <button className="secondary" onClick={() => { methodRef.current = "manual"; track("resume_import_started", { method: "manual" }); setDraft(vault.profile); setPatch({ profile: vault.profile!, evidence: {}, warnings: [] }); setStep("review"); }}>
                  Skip, type it in manually
                </button>
              )}
              {reimport && onCancel && (
                <button className="secondary" onClick={onCancel}>Cancel</button>
              )}
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
        {patch && flaggedPaths(patch).size > 0 && (
          <p className="hint">Fields marked “check this” were read with lower confidence.</p>
        )}
        <div className={rawText ? "split" : ""}>
          <ProfileForm profile={draft} onChange={setDraft} flags={patch ? flaggedPaths(patch) : undefined} />
          {rawText && (
            <div>
              <h2>Source document</h2>
              <div className="rawtext">{rawText.slice(0, 20000)}</div>
            </div>
          )}
        </div>
        <div className="btn-row">
          <button className="primary" onClick={() => void finishReview()}>
            {reimport ? "Looks right, replace my resume" : "Looks right, continue"}
          </button>
          {reimport && onCancel && (
            <button className="secondary" onClick={onCancel}>Cancel</button>
          )}
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

/** Evidence keys the parser marked below high confidence (PLAN.md Part 9 §5b). */
function flaggedPaths(patch: ProfilePatch): Set<string> {
  const out = new Set<string>();
  for (const [key, ev] of Object.entries(patch.evidence)) {
    if (ev.confidence && ev.confidence !== "high" && /\./.test(key)) out.add(key);
  }
  return out;
}

/** Structure-only parse coverage for resume_imported (rule 9: counts only). */
function parseCoverage(patch: ProfilePatch): Record<string, number> {
  const p = patch.profile;
  return {
    warnings: patch.warnings.length,
    work_entries: p.work.length,
    education_entries: p.education.length,
    skills_count: p.skills.length,
    contact_fields: [p.basics.firstName, p.basics.email, p.basics.phone].filter(Boolean).length,
    link_fields: Object.values(p.links).filter(Boolean).length,
    flagged_fields: flaggedPaths(patch).size,
  };
}

/** Which field groups the user changed at review, as counts of edited fields. */
function reviewEdits(patch: ProfilePatch, draft: CandidateProfile): Record<string, number> {
  const before = patch.profile;
  const diffCount = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Object.keys({ ...a, ...b }).filter((k) => String(a[k] ?? "") !== String(b[k] ?? "")).length;
  const listDiff = (a: Record<string, unknown>[], b: Record<string, unknown>[]) => {
    let n = Math.abs(a.length - b.length) * 2; // added/removed entries count as edits
    for (let i = 0; i < Math.min(a.length, b.length); i++) n += diffCount(a[i]!, b[i]!);
    return n;
  };
  const basics = diffCount(before.basics, draft.basics) + diffCount(before.location, draft.location);
  const links = diffCount(before.links, draft.links);
  const work = listDiff(before.work, draft.work);
  const education = listDiff(before.education, draft.education);
  const skills = before.skills.join("|") === draft.skills.join("|") ? 0 : 1;
  const flagged = flaggedPaths(patch);
  let flaggedEdited = 0;
  for (const path of flagged) {
    const read = (obj: CandidateProfile) =>
      path.split(/[.[\]]+/).filter(Boolean).reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
    if (String(read(before) ?? "") !== String(read(draft) ?? "")) flaggedEdited++;
  }
  return {
    edited_basics: basics,
    edited_links: links,
    edited_work: work,
    edited_education: education,
    edited_skills: skills,
    edited_groups: [basics, links, work, education, skills].filter((n) => n > 0).length,
    flagged_fields: flagged.size,
    flagged_edited: flaggedEdited,
  };
}

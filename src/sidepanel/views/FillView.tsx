import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AtsId,
  FieldDecision,
  FieldSignal,
  FillInstruction,
  FillOutcome,
} from "@shared/types";
import { b64encode, parseMsg, type Msg } from "@shared/messages";
import { mapFields } from "@shared/mapper";
import { resolveOption } from "@shared/normalize";
import { ATS_IFRAME_PATTERNS } from "@shared/ats";
import { loadDocumentBytes } from "@storage/vault";
import { saveAnswer, recordAnswerUse } from "@storage/answers";
import { appendFillLog } from "@storage/filllog";
import { setStatusByUrl, upsertJob } from "@storage/history";
import { parseJobPageTitle } from "@shared/page-context";
import type { VaultHook } from "../App";
import { activeTabId } from "../hooks";

// The review-and-fill loop (PLAN.md Phases 4 & 7): scan → map (deterministic)
// → review panel → apply → verify outcomes → save corrections as answers.
// Max 2 fill rounds (rescan catches conditionally revealed fields), hard stop.

interface FrameScan {
  ats: AtsId;
  signals: FieldSignal[];
}

type Phase = "idle" | "scanning" | "review" | "filling" | "done";

export function FillView({ vault }: { vault: VaultHook }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [frames, setFrames] = useState<Record<string, FrameScan>>({});
  const [blocked, setBlocked] = useState<{ src: string; ats: AtsId }[]>([]);
  const [closedShadow, setClosedShadow] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, FillOutcome>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [saveFlags, setSaveFlags] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [applied, setApplied] = useState(false);
  const jobRef = useRef<string | null>(null);
  const tabRef = useRef<number | null>(null);
  const roundRef = useRef(0);
  const startedAtRef = useRef(0);
  const attemptedRef = useRef(new Set<string>());
  const scanWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- message plumbing -----------------------------------------------------

  useEffect(() => {
    const listener = (raw: unknown) => {
      const msg = parseMsg(raw);
      if (!msg) return;
      if (msg.kind === "SCAN_STARTED") {
        jobRef.current = msg.jobId;
        tabRef.current = msg.tabId;
        setPageUrl(msg.url);
        setPageTitle(msg.title);
        setApplied(false);
      } else if (msg.kind === "SCAN_RESULT" && msg.jobId === jobRef.current) {
        if (scanWatchdogRef.current) clearTimeout(scanWatchdogRef.current);
        setFrames((prev) => ({
          ...prev,
          [msg.framePath]: { ats: msg.ats, signals: msg.signals },
        }));
        if (msg.framePath === "top") {
          setBlocked(msg.blockedIframes);
          setClosedShadow(msg.closedShadowRoots);
        }
        setPhase("review");
      } else if (msg.kind === "FILL_RESULT" && msg.jobId === jobRef.current) {
        setOutcomes((prev) => {
          const next = { ...prev };
          for (const o of msg.outcomes) next[o.ref] = o;
          return next;
        });
        setPhase("done");
      } else if (msg.kind === "JOB_FAILED") {
        // accept even when the jobId is unknown — never leave the UI hanging
        if (scanWatchdogRef.current) clearTimeout(scanWatchdogRef.current);
        setError(msg.error);
        setPhase((p) => (p === "scanning" || p === "filling" ? "idle" : p));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // ---- deterministic mapping ------------------------------------------------

  const decisions = useMemo<FieldDecision[]>(() => {
    if (!vault.profile || !vault.settings) return [];
    const all: FieldDecision[] = [];
    for (const frame of Object.values(frames)) {
      all.push(
        ...mapFields(frame.signals, {
          ats: frame.ats,
          profile: vault.profile,
          savedAnswers: vault.answers,
          documents: vault.documents,
          dateFormatHint: vault.settings.dateFormatHint,
          pageContext: parseJobPageTitle(pageTitle, frame.ats),
        }),
      );
    }
    return all;
  }, [frames, pageTitle, vault.profile, vault.answers, vault.documents, vault.settings]);

  const signalByRef = useMemo(() => {
    const m = new Map<string, FieldSignal>();
    for (const f of Object.values(frames)) for (const s of f.signals) m.set(s.ref, s);
    return m;
  }, [frames]);

  const groups = useMemo(() => {
    const fill = decisions.filter((d) => d.action === "fill" || d.action === "fill-amber");
    const review = decisions.filter((d) => d.action === "review");
    const abstain = decisions.filter(
      (d) => d.action === "abstain" && signalByRef.get(d.ref)?.visible,
    );
    return { fill, review, abstain };
  }, [decisions, signalByRef]);

  // ---- actions ----------------------------------------------------------------

  async function startScan() {
    setError(null);
    setFrames({});
    setOutcomes({});
    setOverrides({});
    setIncluded({});
    roundRef.current = 0;
    attemptedRef.current.clear();
    setPhase("scanning");
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.id === undefined) {
      setError("No active tab.");
      setPhase("idle");
      return;
    }
    // preflight: ask for site access while we still have the click gesture
    // (tab.url is only readable when we already have some access — else we
    // rely on activeTab and the SW's error message guides the user).
    // NOTE: match patterns must NOT contain a port — use hostname, not origin.
    if (tab.url && /^https?:/.test(tab.url)) {
      try {
        const u = new URL(tab.url);
        const pattern = `${u.protocol}//${u.hostname}/*`;
        const has = await chrome.permissions.contains({ origins: [pattern] });
        if (!has) await chrome.permissions.request({ origins: [pattern] });
      } catch {
        // pattern not requestable — activeTab may still cover it
      }
    }
    scanWatchdogRef.current = setTimeout(() => {
      setPhase((p) => {
        if (p !== "scanning") return p;
        setError(
          "Scan timed out. Click the ApplyOnce toolbar icon while on the form's tab to grant access, then scan again.",
        );
        return "idle";
      });
    }, 12_000);
    await chrome.runtime.sendMessage({ kind: "START_SCAN", tabId: tab.id } satisfies Msg);
  }

  async function buildInstruction(d: FieldDecision): Promise<FillInstruction | null> {
    const sig = signalByRef.get(d.ref);
    if (!sig) return null;
    const key = `${sig.framePath}|${sig.selector}`;
    if (attemptedRef.current.has(key)) return null;

    let payload: FillInstruction["payload"] | null = null;
    const overridden = overrides[d.ref];

    if (d.documentId) {
      const doc = await loadDocumentBytes(d.documentId);
      if (!doc) return null;
      payload = {
        type: "file",
        fileName: doc.meta.fileName,
        mime: doc.meta.mime,
        dataB64: b64encode(doc.data),
      };
    } else if (d.checked !== undefined) {
      payload = { type: "check", checked: d.checked };
    } else if (d.optionsMulti && d.optionsMulti.length > 0) {
      payload = { type: "multi", options: d.optionsMulti };
    } else if ((sig.options?.length ?? 0) > 0 && sig.kind !== "checkbox") {
      const desired = overridden ?? d.option?.text ?? d.value ?? "";
      const match = d.option && !overridden
        ? { option: d.option }
        : resolveOption(desired, sig.options ?? []);
      if (!match) return null; // never pick an option not in the list
      payload = {
        type: "option",
        optionText: match.option.text,
        optionValue: match.option.value,
      };
    } else {
      const value = overridden ?? d.value ?? "";
      if (!value) return null;
      payload = { type: "text", value };
    }

    attemptedRef.current.add(key);
    return {
      ref: d.ref,
      framePath: sig.framePath,
      selector: sig.selector,
      memberSelectors: sig.memberSelectors,
      kind: sig.kind,
      widgetHint: sig.widgetHint,
      payload,
      amber: d.action !== "fill",
    };
  }

  async function applyFill() {
    if (!jobRef.current || tabRef.current === null) return;
    setPhase("filling");
    startedAtRef.current = startedAtRef.current || Date.now();
    const targets: FieldDecision[] = [
      ...groups.fill,
      ...groups.review.filter((d) => included[d.ref] && (overrides[d.ref] ?? d.value)),
    ];
    const instructions = (
      await Promise.all(targets.map((d) => buildInstruction(d)))
    ).filter((x): x is FillInstruction => x !== null);
    if (instructions.length === 0) {
      setPhase("review");
      setError("Nothing to fill yet. Include some fields or edit values.");
      return;
    }
    roundRef.current += 1;
    await chrome.runtime.sendMessage({
      kind: "START_FILL",
      tabId: tabRef.current,
      jobId: jobRef.current,
      instructions,
    } satisfies Msg);
  }

  async function rescanRound() {
    // catch conditionally revealed fields; hard stop after 2 rounds (§4.4)
    if (roundRef.current >= 2 || tabRef.current === null) return;
    await chrome.runtime.sendMessage({ kind: "START_SCAN", tabId: tabRef.current } satisfies Msg);
  }

  async function persistLogAndAnswers() {
    // save-answer capture (Phase 7)
    for (const d of decisions) {
      const sig = signalByRef.get(d.ref);
      if (!sig) continue;
      const finalValue = overrides[d.ref] ?? d.value ?? "";
      const wasApplied = outcomes[d.ref]?.ok;
      if (saveFlags[d.ref] && finalValue && sig.label) {
        await saveAnswer(sig.label, finalValue);
      } else if (wasApplied && d.savedAnswerId && !overrides[d.ref]) {
        await recordAnswerUse(d.savedAnswerId, sig.label, d.source === "answer-fuzzy");
      }
    }
    const oc = Object.values(outcomes);
    await upsertJob(pageUrl, Object.values(frames)[0]?.ats ?? "generic", pageTitle, {
      fieldCount: decisions.length,
      filled: oc.filter((o) => o.ok && o.verified).length,
      reviewed: groups.review.length,
      failed: oc.filter((o) => !o.ok).length,
    });
    await appendFillLog({
      id: crypto.randomUUID(),
      at: Date.now(),
      domain: safeHost(pageUrl),
      ats: Object.values(frames)[0]?.ats ?? "generic",
      fieldCount: decisions.length,
      filled: oc.filter((o) => o.ok && o.verified).length,
      reviewed: groups.review.length,
      abstained: groups.abstain.length,
      failed: oc.filter((o) => !o.ok).length,
      durationMs: startedAtRef.current ? Date.now() - startedAtRef.current : 0,
      outcomes: decisions.map((d) => ({
        canonical: d.canonical,
        kind: signalByRef.get(d.ref)?.kind ?? "text",
        source: d.source,
        confidence: d.confidence,
        outcome: outcomes[d.ref]
          ? outcomes[d.ref]!.ok
            ? ("filled" as const)
            : ("failed" as const)
          : d.action === "review"
            ? ("review" as const)
            : ("abstain" as const),
        error: outcomes[d.ref]?.error,
      })),
    });
    await vault.refresh();
  }

  async function allowSiteAndRescan() {
    setError(null);
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    let origins: string[];
    if (tab?.url && /^https?:/.test(tab.url)) {
      const u = new URL(tab.url);
      origins = [`${u.protocol}//${u.hostname}/*`];
    } else {
      // URL unreadable (no access at all yet) — offer the declared job-board
      // hosts + local dev in one prompt
      origins = [
        "https://boards.greenhouse.io/*",
        "https://job-boards.greenhouse.io/*",
        "https://jobs.lever.co/*",
        "https://jobs.ashbyhq.com/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
      ];
    }
    try {
      const granted = await chrome.permissions.request({ origins });
      if (granted) await startScan();
      else setError("Access wasn't granted. Chrome's prompt was dismissed.");
    } catch (e) {
      setError(
        `Couldn't request access (${e instanceof Error ? e.message : String(e)}). ` +
          "Click the ApplyOnce toolbar icon while on the form's tab, then scan again.",
      );
    }
  }

  async function requestIframeAccess() {
    const origins = new Set<string>();
    for (const b of blocked) {
      for (const p of ATS_IFRAME_PATTERNS) {
        if (b.ats === p.ats) origins.add(p.origin);
      }
    }
    const granted = await chrome.permissions.request({ origins: [...origins] });
    if (granted) await startScan();
  }

  // ---- render -----------------------------------------------------------------

  if (!vault.profile?.basics.email && !vault.profile?.basics.firstName) {
    return <p className="hint">Set up your profile first (Profile tab).</p>;
  }

  const filledCount = Object.values(outcomes).filter((o) => o.ok && o.verified).length;
  const failedCount = Object.values(outcomes).filter((o) => !o.ok).length;
  const attachedResume = decisions.some(
    (d) => d.documentId && outcomes[d.ref]?.ok,
  );

  return (
    <div>
      <h1>Fill this application</h1>
      {phase === "idle" && (
        <>
          <p className="hint">
            Scans the form on the current tab, fills what it's sure about,
            and asks you about the rest. Nothing is ever submitted for you.
          </p>
          <button className="primary" onClick={() => void startScan()}>
            Scan this page
          </button>
        </>
      )}
      {phase === "scanning" && <p className="hint">Scanning the page…</p>}
      {error && (
        <>
          <p className="error">{error}</p>
          <div className="btn-row">
            <button className="primary" onClick={() => void allowSiteAndRescan()}>
              Allow this site & rescan
            </button>
          </div>
        </>
      )}

      {blocked.length > 0 && (
        <div className="card">
          <div className="q">This form is embedded from {blocked[0]?.ats}</div>
          <p className="hint">
            Allow ApplyOnce on that domain to fill inside the embedded form.
          </p>
          <button className="primary" onClick={() => void requestIframeAccess()}>
            Allow and rescan
          </button>
        </div>
      )}

      {(phase === "review" || phase === "filling" || phase === "done") && (
        <>
          {phase === "done" && (
            <div className="summary">
              ✅ {filledCount} filled · {groups.review.length} need review
              {failedCount > 0 && <> · <span className="error">{failedCount} failed</span></>}
              {attachedResume && <> · resume attached</>}
              {closedShadow > 0 && <> · {closedShadow} {closedShadow === 1 ? "field" : "fields"} couldn't be read</>}
              <div className="btn-row">
                <button
                  className="secondary"
                  onClick={() => {
                    if (tabRef.current !== null) {
                      void chrome.tabs
                        .sendMessage(tabRef.current, { kind: "UNDO_REQUEST" } satisfies Msg)
                        .then(() => setOutcomes({}));
                    }
                  }}
                >
                  ↩ Undo fill
                </button>
                <button
                  className="secondary"
                  disabled={applied}
                  onClick={() =>
                    void setStatusByUrl(pageUrl, "applied").then(() => setApplied(true))
                  }
                >
                  {applied ? "Applied ✓" : "Mark applied"}
                </button>
                {roundRef.current < 2 && (
                  <button className="secondary" onClick={() => void rescanRound()}>
                    Rescan for new fields
                  </button>
                )}
                <button className="secondary" onClick={() => void persistLogAndAnswers()}>
                  Save answers
                </button>
              </div>
            </div>
          )}

          <h2>
            Will fill <span className="badge green">{groups.fill.length}</span>
          </h2>
          {groups.fill.map((d) => (
            <DecisionCard
              key={d.ref}
              d={d}
              sig={signalByRef.get(d.ref)}
              outcome={outcomes[d.ref]}
              override={overrides[d.ref]}
              onOverride={(v) => setOverrides((p) => ({ ...p, [d.ref]: v }))}
            />
          ))}

          <h2>
            Needs you <span className="badge amber">{groups.review.length}</span>
          </h2>
          {groups.review.map((d) => {
            const sig = signalByRef.get(d.ref);
            return (
              <div className="card" key={d.ref}>
                <div className="q">{sig?.label || sig?.nameAttr || d.ref}</div>
                <div className="meta">
                  <SourceBadge d={d} /> {d.reason}
                </div>
                <div className="inline-edit">
                  <input
                    type="text"
                    placeholder="Your answer"
                    value={overrides[d.ref] ?? d.value ?? ""}
                    onChange={(e) =>
                      setOverrides((p) => ({ ...p, [d.ref]: e.target.value }))
                    }
                  />
                  <button
                    className="secondary"
                    title="Copy to clipboard"
                    onClick={() =>
                      void navigator.clipboard.writeText(overrides[d.ref] ?? d.value ?? "")
                    }
                  >
                    Copy
                  </button>
                </div>
                {(sig?.options?.length ?? 0) > 0 && (
                  <div className="meta">
                    Options: {sig?.options?.map((o) => o.text).join(" · ").slice(0, 200)}
                  </div>
                )}
                <div className="checkline">
                  <input
                    type="checkbox"
                    id={`inc-${d.ref}`}
                    checked={included[d.ref] ?? false}
                    onChange={(e) =>
                      setIncluded((p) => ({ ...p, [d.ref]: e.target.checked }))
                    }
                  />
                  <label htmlFor={`inc-${d.ref}`}>Fill this</label>
                  <input
                    type="checkbox"
                    id={`sv-${d.ref}`}
                    checked={saveFlags[d.ref] ?? true}
                    onChange={(e) =>
                      setSaveFlags((p) => ({ ...p, [d.ref]: e.target.checked }))
                    }
                  />
                  <label htmlFor={`sv-${d.ref}`}>Save answer for next time</label>
                </div>
                {outcomes[d.ref] && <OutcomeLine o={outcomes[d.ref]!} />}
              </div>
            );
          })}

          {groups.abstain.length > 0 && (
            <details>
              <summary>Skipped ({groups.abstain.length}): no confident answer</summary>
              {groups.abstain.map((d) => (
                <div className="card" key={d.ref}>
                  <div className="q">{signalByRef.get(d.ref)?.label || d.ref}</div>
                  <div className="meta">{d.reason}</div>
                </div>
              ))}
            </details>
          )}

          <div className="btn-row">
            <button
              className="primary"
              disabled={phase === "filling"}
              onClick={() => void applyFill()}
            >
              {phase === "filling"
                ? "Filling…"
                : roundRef.current > 0
                  ? "Fill again"
                  : `Fill ${groups.fill.length} ${groups.fill.length === 1 ? "field" : "fields"}`}
            </button>
            <button className="secondary" onClick={() => void startScan()}>
              Rescan
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DecisionCard({
  d,
  sig,
  outcome,
  override,
  onOverride,
}: {
  d: FieldDecision;
  sig: FieldSignal | undefined;
  outcome: FillOutcome | undefined;
  override: string | undefined;
  onOverride: (v: string) => void;
}) {
  const display = override ?? d.option?.text ?? d.value ?? "";
  const isFile = Boolean(d.documentId);
  return (
    <div className="card">
      <div className="q">{sig?.label || sig?.nameAttr || d.ref}</div>
      <div className="meta">
        <SourceBadge d={d} />
        {d.action === "fill-amber" && <span className="badge amber">check me</span>}
        {d.reason} · confidence {(d.confidence * 100).toFixed(0)}%
      </div>
      {isFile ? (
        <div className="meta">📎 {d.value}</div>
      ) : d.checked !== undefined ? (
        <div className="meta">{d.checked ? "☑ will check" : "☐ will uncheck"}</div>
      ) : (
        <div className="inline-edit">
          <input type="text" value={display} onChange={(e) => onOverride(e.target.value)} />
        </div>
      )}
      {outcome && <OutcomeLine o={outcome} />}
    </div>
  );
}

function SourceBadge({ d }: { d: FieldDecision }) {
  const label: Record<string, string> = {
    adapter: "Rule",
    autocomplete: "Autofill token",
    lexicon: "Label",
    "answer-exact": "Saved",
    "answer-fuzzy": "Saved (similar)",
  };
  return d.source ? <span className="badge grey">{label[d.source] ?? d.source}</span> : null;
}

function OutcomeLine({ o }: { o: FillOutcome }) {
  if (o.ok && o.verified) return <p className="ok">✓ filled & verified</p>;
  if (o.ok) return <p className="warn">△ filled. Please verify on the page</p>;
  return <p className="error">✕ {o.error ?? "failed"}</p>;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

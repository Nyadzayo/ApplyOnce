import { useEffect, useState } from "react";
import type { FillLogEntry } from "@shared/types";
import { clearFillLog, exportDiagnostics, listFillLog } from "@storage/filllog";

// Local diagnostics (PLAN.md Phase 8): last 50 fills, structure only.

const ISSUES_URL = "https://github.com/Nyadzayo/ApplyOnce/issues/new";

export function DiagnosticsView() {
  const [entries, setEntries] = useState<FillLogEntry[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => void listFillLog().then(setEntries);
  useEffect(refresh, []);

  async function reportBug() {
    // nothing is transmitted automatically: the diagnostics JSON goes to the
    // user's clipboard, and THEY choose to paste it into the issue they file
    const diagnostics = await exportDiagnostics();
    await navigator.clipboard.writeText(diagnostics);
    const manifest = chrome.runtime.getManifest();
    const body = [
      "## What happened",
      "",
      "(describe the page and what went wrong — which fields were wrong, skipped, or failed)",
      "",
      "## Environment",
      `- ApplyOnce ${manifest.version}`,
      `- ${navigator.userAgent}`,
      "",
      "## Diagnostics",
      "Structure-only fill log (no form values) — copied to your clipboard, paste below:",
      "",
      "```json",
      "(paste here)",
      "```",
    ].join("\n");
    // prefill the plain issue body; the repo's bug_report.yml form is offered
    // to users who arrive at the tracker directly
    const url = `${ISSUES_URL}?title=${encodeURIComponent("[bug] ")}&body=${encodeURIComponent(body)}`;
    await chrome.tabs.create({ url });
    setNote("Diagnostics copied to clipboard. Paste them into the issue that just opened.");
  }

  async function doExport() {
    const json = await exportDiagnostics();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "applyonce-diagnostics.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h1>Diagnostics</h1>
      <p className="hint">
        Structure only — no form values or profile data are ever recorded.
        Attach the export to a bug report.
      </p>
      <div className="btn-row">
        <button className="primary" onClick={() => void reportBug()}>
          Report a bug
        </button>
        <button className="secondary" onClick={() => void doExport()}>
          Export log
        </button>
        <button className="danger" onClick={() => void clearFillLog().then(refresh)}>
          Clear log
        </button>
      </div>
      {note && <p className="ok">{note}</p>}
      {entries.map((e) => (
        <div className="card" key={e.id}>
          <div className="q">{e.domain} <span className="badge grey">{e.ats}</span></div>
          <div className="meta">
            {new Date(e.at).toLocaleString()} · {e.fieldCount} fields ·{" "}
            <span className="ok">{e.filled} filled</span> · {e.reviewed} review ·{" "}
            {e.abstained} skipped
            {e.failed > 0 && <> · <span className="error">{e.failed} failed</span></>}
            {" "}· {(e.durationMs / 1000).toFixed(1)}s
          </div>
        </div>
      ))}
      {entries.length === 0 && <p className="hint">No fills recorded yet.</p>}
    </div>
  );
}

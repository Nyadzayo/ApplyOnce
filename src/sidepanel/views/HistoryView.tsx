import { useEffect, useMemo, useState } from "react";
import type { JobHistoryEntry, JobStatus } from "@shared/types";
import {
  clearJobs,
  deleteJob,
  jobsToCsv,
  listJobs,
  setReminder,
  setStatus,
} from "@storage/history";

// Application tracker: search, status filters, pagination, follow-up
// reminders, JD snapshots, CSV/JSON export of the current view.
// Metadata + stats only. Never field values.

const STATUSES: { key: JobStatus; label: string }[] = [
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
];

const REMIND_PREFIX = "fa.remind.";
const PAGE_SIZE = 15;

export function HistoryView() {
  const [jobs, setJobs] = useState<JobHistoryEntry[]>([]);
  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const refresh = () => void listJobs().then(setJobs);
  useEffect(refresh, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (filter !== "all" && j.status !== filter) return false;
      if (!q) return true;
      return (
        j.title.toLowerCase().includes(q) ||
        j.domain.toLowerCase().includes(q) ||
        j.ats.toLowerCase().includes(q) ||
        (j.jdSnippet?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [jobs, filter, query]);

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = shown.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const resetPage = () => setPage(0);

  async function changeStatus(job: JobHistoryEntry, status: JobStatus) {
    await setStatus(job.id, status);
    refresh();
  }

  async function remind(job: JobHistoryEntry, days: number) {
    const name = `${REMIND_PREFIX}${job.id}`;
    if (days === 0) {
      await chrome.alarms.clear(name);
      await setReminder(job.id, undefined);
    } else {
      const when = Date.now() + days * 24 * 3600 * 1000;
      await chrome.alarms.create(name, { when });
      await setReminder(job.id, when);
    }
    refresh();
  }

  function download(name: string, data: string, type: string) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`fastapply-applications-${stamp}.csv`, await jobsToCsv(shown), "text/csv");
  }

  function exportJson() {
    const stamp = new Date().toISOString().slice(0, 10);
    download(
      `fastapply-applications-${stamp}.json`,
      JSON.stringify(shown, null, 2),
      "application/json",
    );
  }

  const countBy = (s: JobStatus) => jobs.filter((j) => j.status === s).length;

  return (
    <div>
      <h1>Applications</h1>
      <p className="hint">
        Your pipeline: statuses, follow-up reminders, and a snapshot of each
        posting. Stored locally; no answer values are kept here.
      </p>

      <div className="field-row">
        <input
          type="text"
          placeholder="Search title, company, site, or job description…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            resetPage();
          }}
        />
      </div>

      <div className="btn-row">
        <button
          className={filter === "all" ? "chip on" : "chip"}
          aria-pressed={filter === "all"}
          onClick={() => {
            setFilter("all");
            resetPage();
          }}
        >
          All ({jobs.length})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            className={filter === s.key ? "chip on" : "chip"}
            aria-pressed={filter === s.key}
            onClick={() => {
              setFilter(s.key);
              resetPage();
            }}
          >
            {s.label} ({countBy(s.key)})
          </button>
        ))}
      </div>

      {jobs.length > 0 && (
        <div className="btn-row">
          <button className="secondary" onClick={() => void exportCsv()}>
            Export CSV ({shown.length})
          </button>
          <button className="secondary" onClick={exportJson}>
            Export JSON ({shown.length})
          </button>
          <button className="danger" onClick={() => void clearJobs().then(refresh)}>
            Clear history
          </button>
        </div>
      )}

      {pageItems.map((j) => (
        <div className="card" key={j.id}>
          <div className="q">
            <a href={j.url} target="_blank" rel="noreferrer">
              {j.title || j.domain}
            </a>{" "}
            <span className="badge grey">{j.ats}</span>
          </div>
          <div className="meta">
            {j.domain} · first seen {new Date(j.firstSeenAt).toLocaleDateString()}
            {j.lastFilledAt && (
              <>
                {" "}· filled {j.timesFilled}× · <span className="ok">{j.filled} fields</span>
                {j.failed > 0 && <> · <span className="error">{j.failed} failed</span></>}
              </>
            )}
          </div>

          <div className="btn-row">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                className={j.status === s.key ? "chip on" : "chip"}
                aria-pressed={j.status === s.key}
                onClick={() => void changeStatus(j, s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="checkline">
            <label htmlFor={`rem-${j.id}`}>Follow up:</label>
            <select
              id={`rem-${j.id}`}
              className="select-inline"
              value=""
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v)) void remind(j, v);
              }}
            >
              <option value="">
                {j.reminderAt
                  ? `⏰ ${new Date(j.reminderAt).toLocaleDateString()}`
                  : "no reminder"}
              </option>
              <option value="2">in 2 days</option>
              <option value="3">in 3 days</option>
              <option value="7">in 1 week</option>
              {j.reminderAt && <option value="0">clear reminder</option>}
            </select>
          </div>

          {j.jdSnippet && (
            <details>
              <summary>Job description snapshot</summary>
              <div className="rawtext">
                {j.jdSnippet}
              </div>
            </details>
          )}

          <button className="danger" onClick={() => void deleteJob(j.id).then(refresh)}>
            Remove
          </button>
        </div>
      ))}

      {shown.length === 0 && (
        <p className="hint">
          {jobs.length === 0 ? "Nothing yet. Scan a job page." : "No matches for this filter/search."}
        </p>
      )}

      {pageCount > 1 && (
        <div className="pager">
          <button
            className="secondary"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ← Prev
          </button>
          <span className="count">
            Page {safePage + 1} of {pageCount} · {shown.length}{" "}
            {shown.length === 1 ? "application" : "applications"}
          </span>
          <button
            className="secondary"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

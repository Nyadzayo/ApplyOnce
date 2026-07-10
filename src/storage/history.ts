import { JobHistoryEntry } from "@shared/types";
import { db } from "./db";

// Application history: job metadata + fill stats per page. Never field
// values. Upserted by canonical URL so refills update one entry.

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch {
    return raw;
  }
}

export interface FillStats {
  fieldCount: number;
  filled: number;
  reviewed: number;
  failed: number;
}

export async function upsertJob(
  rawUrl: string,
  ats: string,
  title: string,
  stats?: FillStats,
  jdSnippet?: string,
): Promise<void> {
  const url = canonicalUrl(rawUrl);
  const existing = await db().jobs.where("url").equals(url).first();
  const now = Date.now();
  const base: JobHistoryEntry = existing
    ? JobHistoryEntry.parse(existing)
    : {
        id: crypto.randomUUID(),
        url,
        domain: safeHost(rawUrl),
        ats,
        title: title.slice(0, 200),
        firstSeenAt: now,
        timesFilled: 0,
        fieldCount: 0,
        filled: 0,
        reviewed: 0,
        failed: 0,
        status: "saved" as const,
      };
  const next: JobHistoryEntry = {
    ...base,
    title: title ? title.slice(0, 200) : base.title,
    ...(jdSnippet && !base.jdSnippet ? { jdSnippet: jdSnippet.slice(0, 6000) } : {}),
    ...(stats
      ? {
          lastFilledAt: now,
          timesFilled: base.timesFilled + 1,
          fieldCount: stats.fieldCount,
          filled: stats.filled,
          reviewed: stats.reviewed,
          failed: stats.failed,
        }
      : {}),
  };
  await db().jobs.put(JobHistoryEntry.parse(next));
}

export async function getJob(id: string): Promise<JobHistoryEntry | null> {
  const row = await db().jobs.get(id);
  const parsed = row ? JobHistoryEntry.safeParse(row) : null;
  return parsed?.success ? parsed.data : null;
}

export async function setStatus(id: string, status: JobHistoryEntry["status"]): Promise<void> {
  await db().jobs.update(id, { status });
}

export async function setStatusByUrl(
  rawUrl: string,
  status: JobHistoryEntry["status"],
): Promise<void> {
  const row = await db().jobs.where("url").equals(canonicalUrl(rawUrl)).first();
  if (row) await db().jobs.update(row.id, { status });
}

export async function setReminder(id: string, reminderAt: number | undefined): Promise<void> {
  await db().jobs.update(id, { reminderAt });
}

/** CSV export — the spreadsheet escape hatch. Pass a filtered list to export
 *  exactly what's on screen; omit to export everything. */
export async function jobsToCsv(subset?: JobHistoryEntry[]): Promise<string> {
  const jobs = subset ?? (await listJobs());
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = [
    "title", "company_domain", "url", "ats", "status",
    "first_seen", "last_filled", "times_filled", "fields_filled", "reminder",
  ].join(",");
  const rows = jobs.map((j) =>
    [
      esc(j.title),
      esc(j.domain),
      esc(j.url),
      esc(j.ats),
      esc(j.status),
      esc(new Date(j.firstSeenAt).toISOString()),
      esc(j.lastFilledAt ? new Date(j.lastFilledAt).toISOString() : ""),
      esc(j.timesFilled),
      esc(j.filled),
      esc(j.reminderAt ? new Date(j.reminderAt).toISOString() : ""),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export async function listJobs(): Promise<JobHistoryEntry[]> {
  const rows = await db().jobs.orderBy("firstSeenAt").reverse().toArray();
  return rows.map((r) => JobHistoryEntry.parse(r));
}

export async function deleteJob(id: string): Promise<void> {
  await db().jobs.delete(id);
}

export async function clearJobs(): Promise<void> {
  await db().jobs.clear();
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

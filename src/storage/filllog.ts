import { FillLogEntry } from "@shared/types";
import { db } from "./db";

// Local diagnostics ring buffer — last 50 fills, structure only, never values
// (PLAN.md Phase 8).

const MAX_ENTRIES = 50;

export async function appendFillLog(entry: FillLogEntry): Promise<void> {
  const valid = FillLogEntry.parse(entry);
  await db().fillLog.put(valid);
  const count = await db().fillLog.count();
  if (count > MAX_ENTRIES) {
    const oldest = await db()
      .fillLog.orderBy("at")
      .limit(count - MAX_ENTRIES)
      .toArray();
    await db().fillLog.bulkDelete(oldest.map((o) => o.id));
  }
}

export async function listFillLog(): Promise<FillLogEntry[]> {
  const rows = await db().fillLog.orderBy("at").reverse().toArray();
  return rows.map((r) => FillLogEntry.parse(r));
}

export async function clearFillLog(): Promise<void> {
  await db().fillLog.clear();
}

/** Diagnostic report the user can attach to a bug report. */
export async function exportDiagnostics(): Promise<string> {
  const entries = await listFillLog();
  return JSON.stringify(
    {
      format: "fastapply-diagnostics",
      version: 1,
      exportedAt: new Date().toISOString(),
      note: "Structure only. No form values or profile data are included.",
      entries,
    },
    null,
    2,
  );
}

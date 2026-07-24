// Anonymous-usage telemetry schema (added 2026-07-24; see CLAUDE.md rule 9
// amendment and site/privacy.html). Pure module — no browser APIs — so the
// allowlist itself is unit-testable. The sender lives in
// src/background/telemetry.ts; UI surfaces emit TELEMETRY_EVENT messages
// through the service-worker router, which re-sanitizes here.
//
// Principles (mirrors the fillLog "structure only" rule):
// - Per-event param allowlists; unknown events and unknown params are dropped.
// - Never a form value, profile field, resume fragment, URL, hostname, page
//   title, company or question text. ATS ids ("greenhouse", "lever") are the
//   only site-shaped signal permitted.
// - Error messages are URL-stripped and truncated before leaving the device.

export const MAX_STRING_LENGTH = 100;

/** Keys that must never appear in a payload, regardless of schema. */
export const FORBIDDEN_PARAM_KEYS: ReadonlySet<string> = new Set([
  "url", "href", "hostname", "origin", "domain", "page", "title",
  "company", "question", "label", "answer", "value", "text", "content",
  "resume", "cv", "name", "email", "phone", "address", "salary", "jd",
  "notes", "profile", "passphrase", "api_key",
]);

// Add events deliberately, with the minimum params that answer a real
// product question. No vanity events.
export const EVENT_SCHEMA: Record<string, readonly string[]> = {
  // lifecycle
  extension_installed: ["version"],
  extension_updated: ["version"],

  // onboarding / activation funnel
  onboarding_started: ["surface"],
  resume_import_started: ["method"], // file_pdf | file_docx | file_txt | paste | manual
  resume_imported: ["method", "warnings"],
  resume_import_failed: ["method", "reason"],
  onboarding_completed: ["method", "hours_since_install"],

  // core loop
  application_page_detected: ["ats"],
  first_application_detected: ["ats", "hours_since_install"],
  fill_completed: [
    "ats", "via", // widget | panel | shortcut
    "field_count", "filled", "reviewed", "abstained", "failed", "duration_ms",
  ],
  first_fill_completed: ["ats", "hours_since_install"],
  fill_failed: ["ats", "reason"],
  fill_undone: ["ats"],
  panel_opened: ["surface"],
  shortcut_used: ["command"],

  // outcomes / retention
  application_marked_applied: ["ats"],
  first_application_marked: ["hours_since_install"],
  saved_answer_created: ["count"],
  saved_answer_reused: ["count"],
  followup_reminder_set: ["days_ahead"],
  followup_notification_sent: [],
  followup_notification_clicked: [],
  heartbeat: [
    "jobs_total", "jobs_applied", "answers_total", "documents_total",
    "days_since_install", "version",
  ],

  // settings & health
  settings_changed: ["field"],
  telemetry_opt_out: [],
  extension_error: ["context", "message"],
};

export type TelemetryParams = Record<string, string | number | boolean>;

/** Replace anything URL-shaped so error messages can't leak page addresses. */
export function stripUrls(message: string): string {
  return message.replace(/(https?|chrome(-extension)?|file):\/\/\S+/gi, "<url>");
}

/**
 * Reduce arbitrary params to the event's allowlist. Returns null for an
 * unknown event (caller must drop it). Strings are URL-stripped and
 * truncated; objects/arrays/functions are silently dropped.
 */
export function sanitizeParams(
  eventName: string,
  params: TelemetryParams | undefined,
): Record<string, string | number> | null {
  const allowed = EVENT_SCHEMA[eventName];
  if (!allowed) return null;
  const clean: Record<string, string | number> = {};
  for (const key of allowed) {
    if (FORBIDDEN_PARAM_KEYS.has(key)) continue;
    const value = params?.[key];
    if (value === undefined || value === null) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = value;
    } else if (typeof value === "boolean") {
      clean[key] = String(value);
    } else if (typeof value === "string") {
      clean[key] = stripUrls(value).slice(0, MAX_STRING_LENGTH);
    }
  }
  return clean;
}

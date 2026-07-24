import {
  sanitizeParams,
  stripUrls,
  MAX_STRING_LENGTH,
  type TelemetryParams,
} from "@shared/telemetry-schema";
import { db } from "@storage/db";

// GA4 Measurement Protocol sender (service worker only; the content script
// and side panel emit TELEMETRY_EVENT messages through the router instead).
// gtag.js cannot run in MV3 — remote scripts are CSP-blocked — so events go
// straight to the collection endpoint. Best-effort: never throws, never
// blocks callers, silently off when unconfigured or opted out.
//
// Credentials come from .env at the repo root (gitignored):
//   VITE_TELEMETRY_MEASUREMENT_ID / VITE_TELEMETRY_API_SECRET
// Release builds MUST be made on a machine with .env present or telemetry
// silently ships disabled.

const MEASUREMENT_ID = import.meta.env.VITE_TELEMETRY_MEASUREMENT_ID as
  | string
  | undefined;
const API_SECRET = import.meta.env.VITE_TELEMETRY_API_SECRET as
  | string
  | undefined;
const ENDPOINT = "https://www.google-analytics.com/mp/collect";

const CLIENT_ID_KEY = "fa.telemetry.clientId";
const ENABLED_KEY = "fa.telemetry.enabled";
const FIRSTS_KEY = "fa.telemetry.firsts";
const INSTALLED_AT_KEY = "fa.telemetry.installedAt";
const SESSION_KEY = "fa.telemetry.session";
const SESSION_EXPIRATION_MIN = 30;

export const HEARTBEAT_ALARM = "fa.telemetry.heartbeat";

export function isTelemetryConfigured(): boolean {
  return Boolean(MEASUREMENT_ID && API_SECRET);
}

export async function isTelemetryEnabled(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(ENABLED_KEY);
    return stored[ENABLED_KEY] !== false; // default on; opt-out in Settings
  } catch {
    return false;
  }
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  if (!enabled) await trackEvent("telemetry_opt_out", {});
  await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
}

async function getClientId(): Promise<string> {
  const stored = await chrome.storage.local.get(CLIENT_ID_KEY);
  let id = stored[CLIENT_ID_KEY] as string | undefined;
  if (!id) {
    id = crypto.randomUUID();
    await chrome.storage.local.set({ [CLIENT_ID_KEY]: id });
  }
  return id;
}

// GA4 only counts a user as "active" when events carry a session_id and a
// non-zero engagement time. Session state survives SW restarts in
// chrome.storage.session and dies with the browser.
function sessionArea() {
  return chrome.storage.session ?? chrome.storage.local;
}

async function getOrCreateSessionId(now = Date.now()): Promise<string> {
  const area = sessionArea();
  const stored = await area.get(SESSION_KEY);
  let session = stored[SESSION_KEY] as { id: string; ts: number } | undefined;
  if (!session || now - session.ts > SESSION_EXPIRATION_MIN * 60 * 1000) {
    session = { id: String(now), ts: now };
  } else {
    session = { ...session, ts: now };
  }
  await area.set({ [SESSION_KEY]: session });
  return session.id;
}

// User-scoped properties ride on every event: version enables error
// attribution across rollouts (a gap that bit PagePulse), and
// language/timezone are the only geo-shaped signals we send — Measurement
// Protocol events carry no IP-derived location by design.
function userProperties() {
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    // stays ""
  }
  return {
    app_version: { value: chrome.runtime.getManifest().version },
    language: { value: chrome.i18n?.getUILanguage?.() ?? "" },
    timezone: { value: timezone },
  };
}

/** Fire-and-forget analytics event. Returns true when a send was attempted. */
export async function trackEvent(
  eventName: string,
  params: TelemetryParams = {},
): Promise<boolean> {
  try {
    if (!isTelemetryConfigured()) return false;
    if (!(await isTelemetryEnabled())) return false;

    const clean = sanitizeParams(eventName, params);
    if (clean === null) {
      console.warn(`[ApplyOnce] telemetry: unknown event "${eventName}" dropped`);
      return false;
    }

    const [clientId, sessionId] = await Promise.all([
      getClientId(),
      getOrCreateSessionId(),
    ]);

    await fetch(
      `${ENDPOINT}?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId,
          user_properties: userProperties(),
          events: [
            {
              name: eventName,
              params: {
                ...clean,
                session_id: sessionId,
                engagement_time_msec: 100,
              },
            },
          ],
        }),
      },
    );
    return true;
  } catch {
    return false; // best-effort, never surface telemetry failures
  }
}

/**
 * Once-per-install milestone (first_fill_completed, onboarding_completed…).
 * Deduplicated via a persisted flag so retries, multiple surfaces, and SW
 * restarts can't double-fire.
 */
export async function trackOnce(
  eventName: string,
  params: TelemetryParams = {},
): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(FIRSTS_KEY);
    const firsts = (stored[FIRSTS_KEY] ?? {}) as Record<string, number>;
    if (firsts[eventName]) return false;
    firsts[eventName] = Date.now();
    await chrome.storage.local.set({ [FIRSTS_KEY]: firsts });
    return trackEvent(eventName, params);
  } catch {
    return false;
  }
}

const ERR_COUNT_KEY = "fa.telemetry.errcount";
const MAX_ERRORS_PER_CONTEXT_PER_DAY = 20;

/**
 * Record a runtime failure. Messages are URL-stripped and truncated; never
 * pass page content, field values, or profile data. Rate-limited per
 * context per day: a fault that repeats every event loop must not flood
 * analytics (field data: an unthrottled repeating error produced 15K
 * events in a sibling extension) — the first N occurrences carry all the
 * diagnostic signal.
 */
export async function trackError(
  context: string,
  error: unknown,
): Promise<boolean> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const stored = await chrome.storage.local.get(ERR_COUNT_KEY);
    let bucket = stored[ERR_COUNT_KEY] as
      | { date: string; counts: Record<string, number> }
      | undefined;
    if (!bucket || bucket.date !== today) bucket = { date: today, counts: {} };
    const n = (bucket.counts[context] ?? 0) + 1;
    bucket.counts[context] = n;
    await chrome.storage.local.set({ [ERR_COUNT_KEY]: bucket });
    if (n > MAX_ERRORS_PER_CONTEXT_PER_DAY) return false;
  } catch {
    // counting failed — still report the error itself
  }
  const raw =
    error instanceof Error ? error.message : String(error ?? "unknown");
  const message = stripUrls(raw).slice(0, MAX_STRING_LENGTH);
  return trackEvent("extension_error", { context, message });
}

/**
 * Catch-all crash reporting for a JS context. Call once at module init;
 * covers everything the wired try/catch sites miss.
 */
export function installGlobalErrorHandlers(prefix: string): void {
  try {
    self.addEventListener("error", (e) => {
      void trackError(`${prefix}_uncaught`, (e as ErrorEvent).error ?? (e as ErrorEvent).message);
    });
    self.addEventListener("unhandledrejection", (e) => {
      void trackError(`${prefix}_unhandled_rejection`, (e as PromiseRejectionEvent).reason);
    });
  } catch {
    // non-standard context — skip
  }
}

export async function markInstalledAt(now = Date.now()): Promise<void> {
  const stored = await chrome.storage.local.get(INSTALLED_AT_KEY);
  if (!stored[INSTALLED_AT_KEY]) {
    await chrome.storage.local.set({ [INSTALLED_AT_KEY]: now });
  }
}

/** Hours between install and now, for time-to-activation params. */
export async function getHoursSinceInstall(
  now = Date.now(),
): Promise<number | null> {
  try {
    const stored = await chrome.storage.local.get(INSTALLED_AT_KEY);
    const installedAt = stored[INSTALLED_AT_KEY] as number | undefined;
    if (!installedAt) return null;
    return Math.round(((now - installedAt) / 36e5) * 10) / 10;
  } catch {
    return null;
  }
}

/** Daily heartbeat: entity counts only — the retention denominator. */
export async function sendHeartbeat(): Promise<void> {
  try {
    const [jobsTotal, jobs, answersTotal, documentsTotal, hours] =
      await Promise.all([
        db().jobs.count(),
        db().jobs.toArray(),
        db().savedAnswers.count(),
        db().documents.count(),
        getHoursSinceInstall(),
      ]);
    await trackEvent("heartbeat", {
      jobs_total: jobsTotal,
      jobs_applied: jobs.filter((j) => j.status === "applied").length,
      answers_total: answersTotal,
      documents_total: documentsTotal,
      days_since_install: hours === null ? 0 : Math.floor(hours / 24),
      version: chrome.runtime.getManifest().version,
    });
  } catch (e) {
    void trackError("heartbeat", e);
  }
}

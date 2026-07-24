import type { Msg } from "@shared/messages";

// Thin fire-and-forget emitter for UI surfaces. Events route through the
// service-worker router (TELEMETRY_EVENT), which sanitizes against the
// allowlist in shared/telemetry-schema.ts — nothing sends from the panel
// directly. Never throws.

export function track(
  event: string,
  params: Record<string, string | number | boolean> = {},
  once = false,
): void {
  try {
    void chrome.runtime
      .sendMessage({ kind: "TELEMETRY_EVENT", event, params, once } satisfies Msg)
      .catch(() => {});
  } catch {
    // messaging unavailable (e.g. tests) — telemetry is best-effort
  }
}

/**
 * Catch-all crash reporting for the panel. URL-stripping, allowlisting and
 * rate-limiting happen in the service worker's trackError path; this only
 * forwards the message text.
 */
export function installPanelErrorHandlers(): void {
  const forward = (context: string, reason: unknown) => {
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "unknown");
    track("extension_error", { context, message: message.slice(0, 200) });
  };
  window.addEventListener("error", (e) => forward("panel_uncaught", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => forward("panel_unhandled_rejection", e.reason));
}

const ENABLED_KEY = "fa.telemetry.enabled";

export async function getTelemetryEnabled(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(ENABLED_KEY);
    return stored[ENABLED_KEY] !== false;
  } catch {
    return true;
  }
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  if (!enabled) track("telemetry_opt_out");
  await chrome.storage.local.set({ [ENABLED_KEY]: enabled });
}

// Browser-platform shim. Chrome and Firefox both expose the `chrome.*`
// namespace, but a few MV3 surfaces differ (PLAN.md Part 1, Firefox deviation
// 2026-08-25). Everything here is runtime feature-detection — one code base,
// one build per target, no compile-time forks.

// Firefox-only namespace (promise-based). Declared minimally; never used on
// Chrome, where `browser` is undefined.
declare const browser:
  | {
      sidebarAction?: { open(): Promise<void>; close(): Promise<void> };
    }
  | undefined;

/** True when the offscreen-document API exists (Chrome). */
export function hasOffscreen(): boolean {
  return typeof chrome !== "undefined" && typeof chrome.offscreen !== "undefined";
}

/** True when Chrome's side panel API exists. */
export function hasSidePanel(): boolean {
  return typeof chrome !== "undefined" && typeof chrome.sidePanel !== "undefined";
}

/** True when Firefox's sidebarAction API exists. */
export function hasSidebarAction(): boolean {
  return typeof browser !== "undefined" && typeof browser?.sidebarAction !== "undefined";
}

export function isFirefox(): boolean {
  return !hasSidePanel() && hasSidebarAction();
}

/**
 * Open the extension panel for a tab. Chrome: side panel (must be inside a
 * user-gesture window). Firefox: sidebar (same gesture rule; message handlers
 * do NOT count as a gesture, so callers outside a gesture fall back to a tab).
 */
export async function openPanel(tabId: number | undefined, fallbackToTab = true): Promise<void> {
  try {
    if (hasSidePanel()) {
      if (tabId !== undefined) await chrome.sidePanel.open({ tabId });
      return;
    }
    if (hasSidebarAction()) {
      await browser!.sidebarAction!.open();
      return;
    }
  } catch {
    // fall through to the tab fallback
  }
  if (fallbackToTab) {
    void chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
  }
}

// Firefox 140+ install-time data-collection consent (AMO requires the
// manifest key from 2025-11-03). "technicalAndInteraction" is declared as
// OPTIONAL, so Firefox shows an install checkbox and we must honour it: the
// GA4 telemetry may only run when the user ticked it. Chrome has no such API
// and returns true (the in-extension opt-out toggle still applies everywhere).
type DataCollectionPerms = { data_collection: string[] };
const TELEMETRY_DC: DataCollectionPerms = { data_collection: ["technicalAndInteraction"] };

export async function hasTelemetryConsent(): Promise<boolean> {
  if (!isFirefox()) return true;
  try {
    return await (
      chrome.permissions.contains as unknown as (p: DataCollectionPerms) => Promise<boolean>
    )(TELEMETRY_DC);
  } catch {
    return true; // Firefox < 140: no data-collection permissions API
  }
}

/** Must be called from a user gesture (the Settings checkbox click). */
export async function requestTelemetryConsent(): Promise<boolean> {
  if (!isFirefox()) return true;
  try {
    return await (
      chrome.permissions.request as unknown as (p: DataCollectionPerms) => Promise<boolean>
    )(TELEMETRY_DC);
  } catch {
    return true;
  }
}

/**
 * Firefox MV3 treats host_permissions as optional and does NOT inject
 * manifest content scripts until the user grants them, so auto-detection is
 * silent until then. Chrome grants them at install → always true.
 */
export async function hasAllSitesAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: ["<all_urls>"] });
  } catch {
    return false;
  }
}

export async function requestAllSitesAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: ["<all_urls>"] });
  } catch {
    return false;
  }
}

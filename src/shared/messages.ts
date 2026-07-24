import { z } from "zod";
import {
  AtsId,
  FieldDecision,
  FieldSignal,
  FillInstruction,
  FillOutcome,
  ProfilePatch,
} from "./types";

// One discriminated union for every chrome.runtime message. Zod-parsed on
// receipt at every boundary; unknown kinds are rejected (PLAN.md Phase 1).
// Binary payloads travel as base64 — chrome.runtime messaging is JSON-only.

export const Msg = z.discriminatedUnion("kind", [
  // panel/SW → content (per frame): scan your document
  z.object({ kind: z.literal("SCAN_REQUEST"), jobId: z.string() }),

  // content (per frame) → SW → panel
  z.object({
    kind: z.literal("SCAN_RESULT"),
    jobId: z.string(),
    framePath: z.string(),
    url: z.string(),
    ats: AtsId,
    signals: z.array(FieldSignal),
    /** cross-origin ATS iframes we could not enter (need host permission) */
    blockedIframes: z.array(z.object({ src: z.string(), ats: AtsId })),
    closedShadowRoots: z.number(),
  }),

  // panel → SW → content: execute fill plan (instructions pre-filtered per frame)
  z.object({
    kind: z.literal("FILL_REQUEST"),
    jobId: z.string(),
    instructions: z.array(FillInstruction),
  }),
  z.object({
    kind: z.literal("FILL_RESULT"),
    jobId: z.string(),
    framePath: z.string(),
    outcomes: z.array(FillOutcome),
  }),

  // panel ⇄ offscreen: CV parsing
  z.object({
    kind: z.literal("PARSE_CV_REQUEST"),
    jobId: z.string(),
    fileName: z.string(),
    mime: z.string(),
    dataB64: z.string(),
  }),
  z.object({
    kind: z.literal("PARSE_CV_RESULT"),
    jobId: z.string(),
    ok: z.boolean(),
    patch: ProfilePatch.optional(),
    rawText: z.string().optional(),
    error: z.string().optional(),
  }),

  // panel → SW: orchestration
  z.object({ kind: z.literal("START_SCAN"), tabId: z.number().optional() }),
  z.object({
    kind: z.literal("START_FILL"),
    tabId: z.number(),
    jobId: z.string(),
    instructions: z.array(FillInstruction),
  }),
  z.object({
    kind: z.literal("REQUEST_IFRAME_PERMISSION"),
    tabId: z.number(),
    origin: z.string(),
  }),

  // SW → panel: push updates
  z.object({
    kind: z.literal("SCAN_STARTED"),
    jobId: z.string(),
    tabId: z.number(),
    url: z.string(),
    title: z.string().default(""),
  }),
  z.object({ kind: z.literal("JOB_FAILED"), jobId: z.string(), error: z.string() }),

  // content → SW: auto-detection found (or ruled out) an application form.
  // The SW answers with AutoDecisionsResponse via sendResponse.
  z.object({
    kind: z.literal("AUTO_DETECTED"),
    framePath: z.string(),
    url: z.string(),
    title: z.string(),
    ats: AtsId,
    score: z.number(),
    isApplication: z.boolean(),
    signals: z.array(FieldSignal),
    /** snapshot of the job description text (capped) */
    jdText: z.string().optional(),
  }),

  // content → SW: widget fill needs document bytes for file fields.
  // Answered with FilePrepResponse.
  z.object({
    kind: z.literal("WIDGET_FILL_PREP"),
    requests: z.array(z.object({ ref: z.string(), documentId: z.string() })),
  }),

  // content → SW: widget fill finished — log it (structure only)
  z.object({
    kind: z.literal("WIDGET_FILLED"),
    url: z.string(),
    title: z.string(),
    ats: AtsId,
    fieldCount: z.number(),
    filled: z.number(),
    reviewed: z.number(),
    abstained: z.number(),
    failed: z.number(),
    durationMs: z.number(),
  }),

  // content → SW: user clicked "review in panel" on the widget
  z.object({ kind: z.literal("OPEN_PANEL") }),

  // content → SW: user marked this job as applied from the widget
  z.object({
    kind: z.literal("MARK_APPLIED"),
    url: z.string(),
    title: z.string(),
    ats: AtsId,
  }),

  // panel/SW → content (all frames): restore values from before the last fill
  z.object({ kind: z.literal("UNDO_REQUEST") }),

  // SW → content: keyboard shortcut asked for a fill (widget must exist)
  z.object({ kind: z.literal("SHORTCUT_FILL") }),

  // panel → SW: settings changed — re-sync auto-detect registrations
  z.object({ kind: z.literal("SETTINGS_CHANGED") }),

  // panel/content → SW: anonymous usage event. The SW re-sanitizes against
  // the telemetry allowlist (shared/telemetry-schema.ts); unknown events and
  // params are dropped there, so this stays a loose envelope by design.
  z.object({
    kind: z.literal("TELEMETRY_EVENT"),
    event: z.string(),
    params: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
    /** dedupe as a once-per-install milestone */
    once: z.boolean().optional(),
  }),

  z.object({ kind: z.literal("PING") }),
  z.object({ kind: z.literal("PONG") }),
]);
export type Msg = z.infer<typeof Msg>;

// -- request/response payloads (sendResponse) --------------------------------

export const AutoDecisionsResponse = z.object({
  enabled: z.boolean(),
  locked: z.boolean(),
  decisions: z.array(FieldDecision),
});
export type AutoDecisionsResponse = z.infer<typeof AutoDecisionsResponse>;

export const FilePrepResponse = z.object({
  files: z.array(
    z.object({
      ref: z.string(),
      fileName: z.string(),
      mime: z.string(),
      dataB64: z.string(),
    }),
  ),
});
export type FilePrepResponse = z.infer<typeof FilePrepResponse>;

/** Parse an incoming message; returns null for anything not ours. */
export function parseMsg(raw: unknown): Msg | null {
  const r = Msg.safeParse(raw);
  return r.success ? r.data : null;
}

export function b64encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function b64decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

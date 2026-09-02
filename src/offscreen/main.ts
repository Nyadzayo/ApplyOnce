import { parseMsg, type ClassifierStatus, type ClassifyResponse } from "@shared/messages";
import { handleParse } from "./parse";

// Offscreen document (Chrome): the only heavy-compute host (PLAN.md Part 1).
// Receives PARSE_CV_REQUEST from the service worker and runs the parser.

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = parseMsg(raw);
  if (!msg) return false;
  if (msg.kind === "PARSE_CV_REQUEST") {
    // ack immediately so the SW knows the parser is alive, then work async
    sendResponse({ kind: "PONG" });
    void handleParse(msg);
    return false;
  }
  if (msg.kind === "CLASSIFY_REQUEST") {
    void import("./classifier")
      .then(({ classifyFields }) => classifyFields(msg.fields))
      .then((hints) => sendResponse({ ok: true, hints } satisfies ClassifyResponse))
      .catch((e: unknown) =>
        sendResponse({ ok: false, hints: [], error: e instanceof Error ? e.message : String(e) } satisfies ClassifyResponse),
      );
    return true;
  }
  if (msg.kind === "CLASSIFIER_STATUS") {
    void import("./classifier")
      .then(async ({ classifierAvailable, classifierCached }) => {
        const cached = await classifierCached();
        sendResponse({ available: cached || (await classifierAvailable()), cached } satisfies ClassifierStatus);
      })
      .catch((e: unknown) =>
        sendResponse({ available: false, cached: false, error: e instanceof Error ? e.message : String(e) } satisfies ClassifierStatus),
      );
    return true;
  }
  if (msg.kind === "CLASSIFIER_WARMUP") {
    void import("./classifier")
      .then(({ loadClassifier }) => loadClassifier())
      .then(() => sendResponse({ ok: true }))
      .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }
  return false;
});

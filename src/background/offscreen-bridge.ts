import type { Msg } from "@shared/messages";
import { hasOffscreen } from "@shared/platform";

// Request/response bridge to the offscreen document (Chrome only). The SW
// stays stateless: it creates the document on demand and re-sends until the
// listener answers, because right after createDocument the module may still
// be evaluating and a single send would be lost.

export async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [
      chrome.offscreen.Reason.DOM_PARSER,
      chrome.offscreen.Reason.BLOBS,
      chrome.offscreen.Reason.WORKERS,
    ],
    justification: "Parses the user's resume file and runs the on-device question classifier locally.",
  });
}

/** Send a message to the offscreen document and return its response, or undefined. */
export async function offscreenRequest(msg: Msg, attempts = 15): Promise<unknown> {
  if (!hasOffscreen()) return undefined;
  await ensureOffscreen();
  for (let i = 0; i < attempts; i++) {
    try {
      const resp: unknown = await chrome.runtime.sendMessage(msg);
      if (resp !== undefined) return resp;
    } catch {
      // "receiving end does not exist": listener not registered yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}

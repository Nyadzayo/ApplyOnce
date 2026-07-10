import { parseMsg, type Msg } from "@shared/messages";
import { detectAts } from "@shared/ats";
import { scanDocument } from "./scan/scanner";
import { executeInstructions } from "./fill/filler";
import { computeFramePath, detectBlockedAtsIframes } from "./frames";
import { clearMarks } from "./highlighter";
import { initAutoDetect, triggerShortcutFill } from "./widget";
import { undoLastFill } from "./fill/filler";

// Content script entry. Injected programmatically with allFrames: true — this
// module runs once per frame. It is the ONLY code that touches page DOM.

declare global {
  interface Window {
    __fastapplyInjected?: boolean;
  }
}

function main(): void {
  if (window.__fastapplyInjected) return;
  window.__fastapplyInjected = true;

  const framePath = computeFramePath(window);
  let registry = new Map<string, Element>();
  let observer: MutationObserver | null = null;
  let observerPaused = false;

  const ensureObserver = () => {
    if (observer) return;
    const container = document.querySelector("form") ?? document.body;
    if (!container) return;
    observer = new MutationObserver(() => {
      if (observerPaused) return;
      // dynamic form changed — the panel re-scans after fill rounds; the
      // observer exists so those rescans are cheap and scoped (PLAN.md §2.5)
    });
    observer.observe(container, { childList: true, subtree: true });
  };

  const doScan = (jobId: string): void => {
    const ats = detectAts(location.href);
    const { signals, closedShadowRoots, registry: reg } = scanDocument(document, {
      ats,
      framePath,
    });
    registry = reg;
    ensureObserver();
    const result: Msg = {
      kind: "SCAN_RESULT",
      jobId,
      framePath,
      url: location.href,
      ats,
      signals,
      blockedIframes: framePath === "top" ? detectBlockedAtsIframes(document) : [],
      closedShadowRoots,
    };
    void chrome.runtime.sendMessage(result);
  };

  const doFill = async (msg: Extract<Msg, { kind: "FILL_REQUEST" }>): Promise<void> => {
    const mine = msg.instructions.filter((i) => i.framePath === framePath);
    if (mine.length === 0) return;
    clearMarks();
    const outcomes = await executeInstructions(mine, {
      registry,
      pauseObserver: () => {
        observerPaused = true;
      },
      resumeObserver: () => {
        observerPaused = false;
      },
    });
    const result: Msg = {
      kind: "FILL_RESULT",
      jobId: msg.jobId,
      framePath,
      outcomes,
    };
    void chrome.runtime.sendMessage(result);
  };

  chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
    const msg = parseMsg(raw);
    if (!msg) return false; // reject-by-default
    switch (msg.kind) {
      case "SCAN_REQUEST":
        doScan(msg.jobId);
        sendResponse({ kind: "PONG" });
        return false;
      case "FILL_REQUEST":
        void doFill(msg);
        sendResponse({ kind: "PONG" });
        return false;
      case "UNDO_REQUEST":
        void undoLastFill({
          registry,
          pauseObserver: () => {
            observerPaused = true;
          },
          resumeObserver: () => {
            observerPaused = false;
          },
        }).then((n) => sendResponse({ restored: n }));
        return true;
      case "SHORTCUT_FILL":
        triggerShortcutFill();
        sendResponse({ kind: "PONG" });
        return false;
      case "PING":
        sendResponse({ kind: "PONG" });
        return false;
      default:
        return false;
    }
  });

  // auto-detect + floating widget (runs when injected via the registered
  // content script on granted sites; harmless on manual injection — the SW
  // answers enabled:false when auto-detect is off or no profile exists)
  void initAutoDetect({
    ats: detectAts(location.href),
    framePath,
    fillerDeps: {
      get registry() {
        return registry;
      },
      pauseObserver: () => {
        observerPaused = true;
      },
      resumeObserver: () => {
        observerPaused = false;
      },
    },
    setRegistry: (r) => {
      registry = r;
    },
  });
}

main();

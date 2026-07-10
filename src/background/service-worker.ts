import { parseMsg, type Msg } from "@shared/messages";
import { createJob, updateJob } from "./jobs";
import { computeDecisions, prepareFiles } from "./mapping";
import { appendFillLog } from "@storage/filllog";
import { getJob, setStatusByUrl, upsertJob } from "@storage/history";
import { parseJobPageTitle } from "@shared/page-context";

// Stateless orchestrator (PLAN.md Part 1): message routing, job ids,
// content-script injection, offscreen lifecycle. No long-lived state here —
// the worker may be killed at any time.

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// ---------------------------------------------------------------------------
// follow-up reminders: alarm fires → local notification → click opens the job
// ---------------------------------------------------------------------------

const REMIND_PREFIX = "fa.remind.";

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(REMIND_PREFIX)) return;
  void (async () => {
    const job = await getJob(alarm.name.slice(REMIND_PREFIX.length));
    if (!job) return;
    chrome.notifications.create(job.id, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Time to follow up",
      message: `${job.title || job.domain}. You planned to follow up on this application today.`,
      priority: 1,
    });
  })();
});

chrome.notifications?.onClicked.addListener((notificationId) => {
  void (async () => {
    const job = await getJob(notificationId);
    if (job) void chrome.tabs.create({ url: job.url });
    chrome.notifications.clear(notificationId);
  })();
});

// keyboard shortcut → fill via the in-page widget
chrome.commands?.onCommand.addListener((command) => {
  if (command !== "fill-page") return;
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined) {
      chrome.tabs.sendMessage(tab.id, { kind: "SHORTCUT_FILL" } satisfies Msg).catch(() => {});
    }
  })();
});

// ---------------------------------------------------------------------------
// content-script injection (activeTab + optional host permissions)
// ---------------------------------------------------------------------------

async function injectContent(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ["content.js"],
  });
}

async function startScan(tabId: number): Promise<void> {
  const job = await createJob("SCAN", tabId);
  let url = "";
  let title = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    url = tab.url ?? "";
    title = tab.title ?? "";
  } catch {
    // url stays unknown without host access — cosmetic only
  }
  // announce the job BEFORE injection: if injection fails, the panel must
  // already know this jobId or it can't show the failure (it would hang)
  void chrome.runtime.sendMessage({
    kind: "SCAN_STARTED",
    jobId: job.id,
    tabId,
    url,
    title,
  } satisfies Msg);
  try {
    await injectContent(tabId);
    await updateJob(job.id, { state: "running" });
    await chrome.tabs.sendMessage(tabId, { kind: "SCAN_REQUEST", jobId: job.id } satisfies Msg);
  } catch (e) {
    let error = e instanceof Error ? e.message : String(e);
    if (/cannot access|must request permission|cannot be scripted|showErrorDialog/i.test(error)) {
      error =
        "ApplyOnce can't access this page. Click the ApplyOnce toolbar icon while on this tab " +
        "(that grants one-time access), or use “Allow this site”, then scan again.";
    }
    await updateJob(job.id, { state: "failed", error });
    void chrome.runtime.sendMessage({ kind: "JOB_FAILED", jobId: job.id, error } satisfies Msg);
  }
}

async function startFill(
  tabId: number,
  jobId: string,
  instructions: Extract<Msg, { kind: "START_FILL" }>["instructions"],
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      kind: "FILL_REQUEST",
      jobId,
      instructions,
    } satisfies Msg);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    void chrome.runtime.sendMessage({ kind: "JOB_FAILED", jobId, error } satisfies Msg);
  }
}

// ---------------------------------------------------------------------------
// offscreen document (single instance; created on demand for CV parsing)
// ---------------------------------------------------------------------------

async function ensureOffscreen(): Promise<void> {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [
      chrome.offscreen.Reason.DOM_PARSER,
      chrome.offscreen.Reason.BLOBS,
      chrome.offscreen.Reason.WORKERS,
    ],
    justification: "Parses the user's resume file (PDF/DOCX) locally.",
  });
}

// ---------------------------------------------------------------------------
// router — zod-parsed, reject-by-default
// ---------------------------------------------------------------------------

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = parseMsg(raw);
  if (!msg) return false;

  switch (msg.kind) {
    case "START_SCAN": {
      void (async () => {
        const tabId =
          msg.tabId ??
          (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (tabId !== undefined) await startScan(tabId);
        sendResponse({ ok: true });
      })();
      return true;
    }
    case "START_FILL": {
      void startFill(msg.tabId, msg.jobId, msg.instructions).then(() =>
        sendResponse({ ok: true }),
      );
      return true;
    }
    case "PARSE_CV_REQUEST": {
      // ensure the offscreen parser exists, then re-forward until it acks —
      // right after createDocument the module may still be evaluating and a
      // single fire-and-forget send would be lost
      void (async () => {
        let acked = false;
        try {
          await ensureOffscreen();
          for (let i = 0; i < 15 && !acked; i++) {
            try {
              const resp: unknown = await chrome.runtime.sendMessage(msg);
              acked = Boolean(resp);
            } catch {
              // "receiving end does not exist" — listener not registered yet
            }
            if (!acked) await new Promise((r) => setTimeout(r, 200));
          }
        } catch {
          acked = false;
        }
        sendResponse({ ok: acked });
      })();
      return true;
    }
    case "SCAN_RESULT":
    case "FILL_RESULT": {
      void updateJob(msg.jobId, { state: "done" });
      return false; // panel receives the broadcast directly
    }

    // ---- widget / auto-detect flow ---------------------------------------
    case "AUTO_DETECTED": {
      void (async () => {
        try {
          if (!msg.isApplication) {
            sendResponse({ enabled: false, locked: false, decisions: [] });
            return;
          }
          const result = await computeDecisions(
            msg.ats,
            msg.signals,
            parseJobPageTitle(msg.title, msg.ats),
          );
          if (result.enabled && msg.framePath === "top") {
            await upsertJob(msg.url, msg.ats, msg.title, undefined, msg.jdText);
          }
          sendResponse(result);
        } catch {
          sendResponse({ enabled: false, locked: false, decisions: [] });
        }
      })();
      return true;
    }
    case "WIDGET_FILL_PREP": {
      void prepareFiles(msg.requests)
        .then(sendResponse)
        .catch(() => sendResponse({ files: [] }));
      return true;
    }
    case "WIDGET_FILLED": {
      void (async () => {
        await upsertJob(msg.url, msg.ats, msg.title, {
          fieldCount: msg.fieldCount,
          filled: msg.filled,
          reviewed: msg.reviewed,
          failed: msg.failed,
        });
        await appendFillLog({
          id: crypto.randomUUID(),
          at: Date.now(),
          domain: safeHost(msg.url),
          ats: msg.ats,
          fieldCount: msg.fieldCount,
          filled: msg.filled,
          reviewed: msg.reviewed,
          abstained: msg.abstained,
          failed: msg.failed,
          durationMs: msg.durationMs,
          outcomes: [],
        });
      })();
      return false;
    }
    case "OPEN_PANEL": {
      const tabId = _sender.tab?.id;
      if (tabId !== undefined) {
        // valid within the user-gesture window of the widget click
        void chrome.sidePanel.open({ tabId }).catch(() => {});
      }
      return false;
    }
    case "MARK_APPLIED": {
      void (async () => {
        await upsertJob(msg.url, msg.ats, msg.title);
        await setStatusByUrl(msg.url, "applied");
      })();
      return false;
    }
    case "SETTINGS_CHANGED": {
      // auto-detect on/off is read per-request in computeDecisions
      return false;
    }
    case "PING": {
      sendResponse({ kind: "PONG" } satisfies Msg);
      return false;
    }
    default:
      return false;
  }
});

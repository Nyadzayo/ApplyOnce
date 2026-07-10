// @vitest-environment jsdom
//
// End-to-end (headless) test of the auto-detect → widget flow: fixture DOM in,
// mocked chrome APIs, real scanner/classifier/mapper — asserts the widget host
// actually lands in the page. If this passes, "no widget" in the field is an
// injection/permission problem, not a code problem.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyProfile } from "@shared/types";
import { mapFields } from "@shared/mapper";
import { scanDocument } from "../src/content/scan/scanner";

const fixtureHtml = readFileSync(
  join(__dirname, "..", "fixtures", "generic-basic", "page.html"),
  "utf8",
);

function installChromeMock(sentMessages: unknown[]) {
  const profile = emptyProfile();
  profile.basics = { firstName: "Ada", lastName: "L", email: "a@b.c", phone: "1", pronouns: "" };

  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      sendMessage: vi.fn(async (msg: { kind?: string; signals?: never[]; ats?: never }) => {
        sentMessages.push(msg);
        if (msg?.kind === "AUTO_DETECTED") {
          // behave like the SW: run the real mapper on the reported signals
          const decisions = mapFields((msg.signals ?? []) as never[], {
            ats: (msg.ats ?? "generic") as never,
            profile,
            savedAnswers: [],
            documents: [],
            dateFormatHint: "MM/DD/YYYY",
          });
          return { enabled: true, locked: false, decisions };
        }
        return { ok: true };
      }),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
  };
}

describe("widget auto-detect flow (headless)", () => {
  let getClientRectsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.documentElement.innerHTML = fixtureHtml;
    sessionStorage.clear();
    // jsdom has no layout — pretend everything has a box
    getClientRectsSpy = vi
      .spyOn(Element.prototype, "getClientRects")
      .mockReturnValue([{}] as unknown as DOMRectList);
    vi.useFakeTimers();
  });

  afterEach(() => {
    getClientRectsSpy.mockRestore();
    vi.useRealTimers();
    vi.resetModules();
    document.querySelector("[data-fastapply-ui]")?.remove();
  });

  it("renders the widget host on the generic fixture", async () => {
    const sent: unknown[] = [];
    installChromeMock(sent);
    const { initAutoDetect } = await import("../src/content/widget");

    const { registry } = scanDocument(document, { ats: "generic", framePath: "top" });
    await initAutoDetect({
      ats: "generic",
      framePath: "top",
      fillerDeps: {
        registry,
        pauseObserver: () => {},
        resumeObserver: () => {},
      },
      setRegistry: () => {},
    });

    // detection is delayed ~900ms for SPAs
    await vi.advanceTimersByTimeAsync(1200);

    const detected = sent.find(
      (m) => (m as { kind?: string }).kind === "AUTO_DETECTED",
    ) as { isApplication?: boolean } | undefined;
    expect(detected, "AUTO_DETECTED was never sent — detection failed").toBeDefined();
    expect(detected?.isApplication).toBe(true);

    const host = document.querySelector("[data-fastapply-ui]");
    expect(host, "widget host element missing from the page").not.toBeNull();
    expect(sessionStorage.getItem("fa.peeked")).toBe("1");
  });
});

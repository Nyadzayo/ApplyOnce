import type { AtsId } from "@shared/types";
import { ATS_IFRAME_PATTERNS } from "@shared/ats";

// Frame strategy (PLAN.md §2.2): every frame scans its own document; the top
// frame additionally reports cross-origin ATS iframes it cannot enter so the
// SW can trigger the optional-permission prompt.

/** Index path of this window from the top: "top", "top/0", "top/0/1"… */
export function computeFramePath(win: Window): string {
  const path: number[] = [];
  let cur: Window = win;
  let guard = 0;
  while (cur !== cur.top && guard++ < 32) {
    const parent: Window = cur.parent;
    let idx = -1;
    try {
      // window identity comparison is allowed cross-origin
      for (let i = 0; i < parent.length; i++) {
        if (parent.frames[i] === cur) {
          idx = i;
          break;
        }
      }
    } catch {
      idx = -1;
    }
    path.unshift(idx);
    cur = parent;
  }
  return path.length === 0 ? "top" : `top/${path.join("/")}`;
}

export interface BlockedIframe {
  src: string;
  ats: AtsId;
}

/** Cross-origin ATS iframes in this document that our script can't reach. */
export function detectBlockedAtsIframes(doc: Document): BlockedIframe[] {
  const out: BlockedIframe[] = [];
  for (const iframe of Array.from(doc.querySelectorAll("iframe[src]"))) {
    const src = iframe.getAttribute("src") ?? "";
    let host = "";
    try {
      host = new URL(src, doc.baseURI).hostname;
    } catch {
      continue;
    }
    for (const p of ATS_IFRAME_PATTERNS) {
      if (p.hostRe.test(host)) {
        let reachable = false;
        try {
          // throws (or is null) when cross-origin
          reachable = (iframe as HTMLIFrameElement).contentDocument !== null;
        } catch {
          reachable = false;
        }
        if (!reachable) out.push({ src, ats: p.ats });
        break;
      }
    }
  }
  return out;
}

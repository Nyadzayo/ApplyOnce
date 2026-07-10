import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// PDF text-layer extraction (PLAN.md Phase 6): text items with transforms →
// line reconstruction (cluster by y, sort by x) → plain text. Two-column
// layouts are handled by clustering x-positions per page.

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

interface Item {
  str: string;
  x: number;
  y: number;
}

export async function extractPdfText(data: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const pageTexts: string[] = [];
  const linkUrls = new Set<string>();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const it of content.items) {
      if ("str" in it && it.str.trim()) {
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
      }
    }
    pageTexts.push(reconstructLines(items));
    // hyperlinks ("LinkedIn", "Credential") are annotations, not text — the
    // URL never appears in the text layer, so collect it explicitly
    try {
      for (const a of await page.getAnnotations()) {
        if (a.subtype === "Link" && typeof a.url === "string") linkUrls.add(a.url);
      }
    } catch {
      // annotations are best-effort
    }
  }
  await doc.destroy();
  const links = linkUrls.size > 0 ? `\n\n${[...linkUrls].join("\n")}` : "";
  return { text: pageTexts.join("\n\n") + links, pages: doc.numPages };
}

function reconstructLines(items: Item[]): string {
  if (items.length === 0) return "";
  // detect a two-column layout: big gap in the x histogram near mid-page
  const xs = items.map((i) => i.x).sort((a, b) => a - b);
  const minX = xs[0]!;
  const maxX = xs[xs.length - 1]!;
  const mid = (minX + maxX) / 2;
  const leftCount = xs.filter((x) => x < mid - 30).length;
  const rightCount = xs.filter((x) => x > mid + 30).length;
  const nearMid = xs.filter((x) => Math.abs(x - mid) <= 30).length;
  const twoColumn =
    items.length > 40 &&
    leftCount > items.length * 0.3 &&
    rightCount > items.length * 0.3 &&
    nearMid < items.length * 0.05;

  if (twoColumn) {
    const left = items.filter((i) => i.x < mid);
    const right = items.filter((i) => i.x >= mid);
    return `${linesOf(left)}\n${linesOf(right)}`;
  }
  return linesOf(items);
}

function linesOf(items: Item[]): string {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: string[][] = [];
  let curY = Number.NaN;
  for (const it of sorted) {
    if (Number.isNaN(curY) || Math.abs(it.y - curY) > 4) {
      lines.push([it.str]);
      curY = it.y;
    } else {
      lines[lines.length - 1]!.push(it.str);
    }
  }
  return lines.map((l) => l.join(" ").replace(/\s+/g, " ").trim()).join("\n");
}

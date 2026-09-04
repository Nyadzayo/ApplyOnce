import type { PDFDocumentProxy } from "pdfjs-dist";
import { isBoldFont, isItalicFont, type PageItems } from "./doclines";

// PDF.js document → positioned text items per page (PLAN.md Part 9 §5a).
// Shared by the offscreen extractor (browser build) and the eval harness
// (legacy Node build) so both see identical reconstruction. Fonts are only
// resolvable after getOperatorList() has run: it loads them into
// page.commonObjs, whose .name carries the real face ("Arial-BoldMT",
// LaTeX "CMBX10") — the text-content styles do not.

export async function pagesFromPdfDocument(doc: PDFDocumentProxy): Promise<PageItems[]> {
  const pages: PageItems[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    try {
      await page.getOperatorList();
    } catch {
      // fonts stay unresolved → no bold signal for this page
    }
    const content = await page.getTextContent();
    const fontFlags = new Map<string, { bold: boolean; italic: boolean }>();
    const flagsFor = (fontName: string) => {
      let f = fontFlags.get(fontName);
      if (!f) {
        let name = fontName;
        try {
          const font = page.commonObjs.get(fontName) as { name?: string } | undefined;
          if (font?.name) name = font.name;
        } catch {
          // not resolved
        }
        f = { bold: isBoldFont(name), italic: isItalicFont(name) };
        fontFlags.set(fontName, f);
      }
      return f;
    };
    const items: PageItems["items"] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const flags = flagsFor(it.fontName);
      items.push({
        str: it.str,
        x: it.transform[4]!,
        y: it.transform[5]!,
        w: it.width,
        size: Math.hypot(it.transform[0]!, it.transform[1]!) || it.height,
        bold: flags.bold,
        italic: flags.italic,
      });
    }
    const links: PageItems["links"] = [];
    try {
      for (const a of await page.getAnnotations()) {
        if (a.subtype === "Link" && typeof a.url === "string" && Array.isArray(a.rect)) {
          const [x0, y0, x1, y1] = a.rect as number[];
          links.push({ x0: Math.min(x0!, x1!), y0: Math.min(y0!, y1!), x1: Math.max(x0!, x1!), y1: Math.max(y0!, y1!), url: a.url });
        }
      }
    } catch {
      // annotations are best-effort
    }
    const [vx0, vy0, vx1, vy1] = page.view;
    pages.push({ width: vx1! - vx0!, height: vy1! - vy0!, items, links });
  }
  return pages;
}

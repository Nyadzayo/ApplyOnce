import type { PageItems, TextItem } from "./doclines";

// OCR words -> positioned text items (PLAN.md Part 9 section 5a, scanned
// input). Tesseract reports words in image coordinates (origin top-left);
// the line model expects PDF-style coordinates (origin bottom-left, y at the
// baseline), so a scanned page flows through the same reconstruction as a
// text-layer page. Low-confidence words are dropped: a wrong word in a name
// or company costs more than a missing one (rule 3).

export interface OcrWord {
  text: string;
  /** 0-100 */
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  baseline?: { x0: number; y0: number; x1: number; y1: number };
}

export interface OcrPage {
  width: number;
  height: number;
  words: OcrWord[];
}

/** Words below this confidence are noise (Tesseract scale, 0-100). */
export const OCR_MIN_WORD_CONFIDENCE = 35;

export function pageItemsFromOcr(page: OcrPage, minConfidence = OCR_MIN_WORD_CONFIDENCE): PageItems {
  const items: TextItem[] = [];
  for (const w of page.words) {
    const text = w.text.trim();
    if (!text || w.confidence < minConfidence) continue;
    const baselineY = w.baseline ? (w.baseline.y0 + w.baseline.y1) / 2 : w.bbox.y1;
    items.push({
      str: text,
      x: w.bbox.x0,
      y: page.height - baselineY,
      w: w.bbox.x1 - w.bbox.x0,
      size: Math.max(4, w.bbox.y1 - w.bbox.y0),
      bold: false,
      italic: false,
    });
  }
  return { width: page.width, height: page.height, items, links: [] };
}

/** Mean word confidence of a page, 0-100 (0 when empty). */
export function ocrPageConfidence(page: OcrPage): number {
  const words = page.words.filter((w) => w.text.trim());
  if (words.length === 0) return 0;
  return words.reduce((n, w) => n + w.confidence, 0) / words.length;
}

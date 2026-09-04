import * as pdfjs from "pdfjs-dist";
import { createWorker, type Worker } from "tesseract.js";
import { linesFromItems, type DocLine } from "@shared/doclines";
import { ocrPageConfidence, pageItemsFromOcr, type OcrPage, type OcrWord } from "@shared/ocr-items";

// OCR fallback for scanned/image resumes (PLAN.md Part 9 section 5a).
// Pages are rendered by PDF.js at ~144 dpi and recognized by tesseract.js
// running from the extension's own package: worker, wasm core and the
// English traineddata live under /tesseract/ (scripts/fetch-ocr-assets.mjs),
// so nothing is downloaded at run time and no image leaves the device.

const OCR_SCALE = 2;
const MAX_OCR_PAGES = 4;

let workerPromise: Promise<Worker> | null = null;

function ocrWorker(): Promise<Worker> {
  workerPromise ??= createWorker("eng", 1, {
    workerPath: chrome.runtime.getURL("tesseract/worker.min.js"),
    corePath: chrome.runtime.getURL("tesseract/"),
    langPath: chrome.runtime.getURL("tesseract/"),
    workerBlobURL: false, // extension CSP forbids blob: workers
    gzip: true,
    logger: () => undefined,
  }).catch((e: unknown) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

async function recognize(image: HTMLCanvasElement | Blob, width: number, height: number): Promise<OcrPage> {
  const t0 = Date.now();
  const worker = await ocrWorker();
  console.info(`OCR: worker ready in ${Date.now() - t0} ms, recognizing ${width}x${height}`);
  const { data } = await worker.recognize(image, {}, { blocks: true });
  console.info(`OCR: recognized in ${Date.now() - t0} ms`);
  const words: OcrWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs) {
      for (const line of para.lines) {
        const lb = (line as { baseline?: { x0: number; y0: number; x1: number; y1: number } }).baseline;
        for (const w of line.words) {
          const cx = (w.bbox.x0 + w.bbox.x1) / 2;
          const t = lb && lb.x1 !== lb.x0 ? Math.min(1, Math.max(0, (cx - lb.x0) / (lb.x1 - lb.x0))) : 0;
          const y = lb ? lb.y0 + (lb.y1 - lb.y0) * t : w.bbox.y1;
          words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox, baseline: { x0: w.bbox.x0, y0: y, x1: w.bbox.x1, y1: y } });
        }
      }
    }
  }
  return { width, height, words };
}

export interface OcrResult {
  lines: DocLine[];
  /** mean word confidence, 0-100 */
  confidence: number;
  pages: number;
}

function finish(pages: OcrPage[]): OcrResult {
  const confidence = pages.length > 0 ? pages.reduce((n, p) => n + ocrPageConfidence(p), 0) / pages.length : 0;
  return { lines: linesFromItems(pages.map((p) => pageItemsFromOcr(p))), confidence, pages: pages.length };
}

/** OCR the first pages of a PDF whose text layer is empty. */
export async function ocrPdf(data: ArrayBuffer): Promise<OcrResult> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  try {
    const pages: OcrPage[] = [];
    for (let p = 1; p <= Math.min(doc.numPages, MAX_OCR_PAGES); p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) throw new Error("canvas unavailable for OCR");
      const t0 = Date.now();
      // an offscreen document is never painted, so requestAnimationFrame never
      // fires there and a display-intent render would wait forever; print
      // intent schedules with timers instead
      await page.render({ canvasContext, viewport, canvas, intent: "print" }).promise;
      console.info(`OCR: page ${p} rendered in ${Date.now() - t0} ms`);
      pages.push(await recognize(canvas, canvas.width, canvas.height));
    }
    return finish(pages);
  } finally {
    await doc.destroy();
  }
}

/** OCR a photographed or exported image of a resume (PNG/JPEG/WebP). */
export async function ocrImage(data: ArrayBuffer, mime: string): Promise<OcrResult> {
  const blob = new Blob([data], { type: mime });
  const bitmap = await createImageBitmap(blob);
  try {
    return finish([await recognize(blob, bitmap.width, bitmap.height)]);
  } finally {
    bitmap.close();
  }
}

// Node-side extractors for the binary CV corpus (PLAN.md Part 9 §5 Layer 0).
// Uses the legacy PDF.js build and Mammoth exactly as the offscreen document
// does, through the same shared page → line reconstruction, so the eval
// measures the shipped pipeline end to end.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { join } from "node:path";
import { linesFromHtml, linesFromItems, type DocLine } from "@shared/doclines";
import { pagesFromPdfDocument } from "@shared/pdf-pages";
import { ocrPageConfidence, pageItemsFromOcr, type OcrWord } from "@shared/ocr-items";

export async function pdfLines(data: Buffer): Promise<DocLine[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
  try {
    return linesFromItems(await pagesFromPdfDocument(doc));
  } finally {
    await doc.destroy();
  }
}

/** Minimal PNG encoder (RGBA) for feeding extracted page images to OCR. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const { deflateSync } = require("node:zlib") as typeof import("node:zlib");
  const table = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (buf: Buffer) => {
    let c = -1;
    for (const b of buf) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** First embedded image of page 1 as PNG (scanned PDFs are one image per page). */
export async function pdfEmbeddedImagePng(data: Buffer): Promise<{ png: Buffer; width: number; height: number } | undefined> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
  try {
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList();
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
      const name = (ops.argsArray[i] as [string])[0];
      const img = await new Promise<{ width: number; height: number; data: Uint8Array; kind: number }>((res) =>
        page.objs.get(name, res as unknown as (o: unknown) => void),
      );
      const ch = img.kind === 3 ? 4 : img.kind === 2 ? 3 : 1;
      const rgba = new Uint8Array(img.width * img.height * 4);
      for (let p = 0, q = 0; p < img.width * img.height; p++, q += ch) {
        const r = img.data[q]!, g = ch >= 3 ? img.data[q + 1]! : r, b = ch >= 3 ? img.data[q + 2]! : r;
        rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = 255;
      }
      return { png: encodePng(img.width, img.height, rgba), width: img.width, height: img.height };
    }
    return undefined;
  } finally {
    await doc.destroy();
  }
}

/** OCR a page image with tesseract.js (Node worker), same conversion as the extension. */
export async function ocrLines(png: Buffer, width: number, height: number): Promise<{ lines: DocLine[]; confidence: number }> {
  const { createWorker } = await import("tesseract.js");
  const local = join(__dirname, "..", "public", "tesseract");
  const worker = await createWorker("eng", 1, {
    ...(existsSync(join(local, "eng.traineddata.gz")) ? { langPath: local, gzip: true } : {}),
    logger: () => undefined,
  });
  try {
    const { data } = await worker.recognize(png, {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const b of data.blocks ?? []) for (const p of b.paragraphs) for (const line of p.lines) {
        const lb = (line as { baseline?: { x0: number; y0: number; x1: number; y1: number } }).baseline;
        for (const w of line.words) {
          const cx = (w.bbox.x0 + w.bbox.x1) / 2;
          const t = lb && lb.x1 !== lb.x0 ? Math.min(1, Math.max(0, (cx - lb.x0) / (lb.x1 - lb.x0))) : 0;
          const y = lb ? lb.y0 + (lb.y1 - lb.y0) * t : w.bbox.y1;
          words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox, baseline: { x0: w.bbox.x0, y0: y, x1: w.bbox.x1, y1: y } });
        }
    }
    const page = { width, height, words };
    return { lines: linesFromItems([pageItemsFromOcr(page)]), confidence: ocrPageConfidence(page) };
  } finally {
    await worker.terminate();
  }
}

export async function docxLines(data: Buffer): Promise<DocLine[]> {
  const mammoth = (await import("mammoth")).default;
  const html = (await mammoth.convertToHtml({ buffer: data })).value;
  return linesFromHtml(new DOMParser().parseFromString(html, "text/html"));
}

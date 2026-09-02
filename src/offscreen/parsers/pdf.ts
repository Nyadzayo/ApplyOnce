import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { linesFromItems, type DocLine } from "@shared/doclines";
import { pagesFromPdfDocument } from "@shared/pdf-pages";

// PDF text-layer extraction (PLAN.md Phase 6, Part 9 §5a): positioned text
// items with font flags → DocLine[] (columns, cells, bold, size, links).

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractPdfLines(data: ArrayBuffer): Promise<{ lines: DocLine[]; pages: number }> {
  // PDF.js transfers the buffer to its worker (detaching it); hand it a copy
  // so the OCR fallback can still read the file afterwards
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
  try {
    const pages = await pagesFromPdfDocument(doc);
    return { lines: linesFromItems(pages), pages: doc.numPages };
  } finally {
    await doc.destroy();
  }
}

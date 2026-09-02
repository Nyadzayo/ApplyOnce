import { b64decode, type Msg } from "@shared/messages";
import { parseCvLines, parseCvText } from "@shared/cvparse";
import { docText, type DocLine } from "@shared/doclines";

// Resume parsing (PLAN.md Phase 6): extract text (PDF.js / Mammoth), run the
// pure CV parser, broadcast a ProfilePatch. Hosted by the offscreen document
// on Chrome and by the background event page on Firefox (which has no
// offscreen API but does have DOM + workers in the background).
//
// OCR (PLAN.md Part 9 section 5a): scanned/image PDFs are detected by their
// tiny text yield and run through tesseract.js from the package's own
// /tesseract/ assets (scripts/fetch-ocr-assets.mjs); image files go straight
// to OCR. Every OCR-derived value is flagged for review.

const handled = new Set<string>();

// OCR of a multi-page scan can take a while in wasm; past this the panel gets
// the text-layer result plus a warning instead of its own timeout error
const OCR_TIMEOUT_MS = 90_000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} after ${Math.round(ms / 1000)} s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e: unknown) => { clearTimeout(t); reject(e); });
  });
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function handleParse(msg: Extract<Msg, { kind: "PARSE_CV_REQUEST" }>): Promise<void> {
  if (handled.has(msg.jobId)) return; // SW re-forwards; dedupe by job id
  handled.add(msg.jobId);

  try {
    const data = b64decode(msg.dataB64);
    let lines: DocLine[] | undefined;
    let text = "";
    let ocr: { confidence: number } | undefined;
    let ocrError: string | undefined;
    const lower = msg.fileName.toLowerCase();
    const charsOf = (ls: DocLine[]) => ls.reduce((n, l) => n + l.text.replace(/\s/g, "").length, 0);
    // parsers are imported lazily so the message listener registers instantly
    // (PDF.js is ~1MB; importing it eagerly delays module evaluation and can
    // lose messages sent right after the offscreen document is created)
    if (msg.mime === "application/pdf" || lower.endsWith(".pdf")) {
      const { extractPdfLines } = await import("./parsers/pdf");
      const pdf = await extractPdfLines(data);
      lines = pdf.lines;
      if (charsOf(lines) < 40 * pdf.pages) {
        // no usable text layer: a scan. OCR is best-effort; the text-layer
        // result (and its "paste instead" warning) stands if OCR fails
        try {
          const { ocrPdf } = await import("./parsers/ocr");
          const result = await withTimeout(ocrPdf(data), OCR_TIMEOUT_MS, "OCR timed out");
          if (charsOf(result.lines) > charsOf(lines)) {
            lines = result.lines;
            ocr = { confidence: result.confidence };
          }
        } catch (e) {
          // never silent: the review screen must say why OCR did not run
          const reason = e instanceof Error ? e.message : String(e);
          console.error("OCR failed", e);
          ocrError = reason.replace(/(https?|chrome(-extension)?|moz-extension):\/\/\S+/gi, "<url>").slice(0, 160);
        }
      }
    } else if (/^image\/(png|jpe?g|webp|bmp)$/.test(msg.mime) || /\.(png|jpe?g|webp|bmp)$/.test(lower)) {
      const { ocrImage } = await import("./parsers/ocr");
      const result = await withTimeout(ocrImage(data, msg.mime || "image/png"), OCR_TIMEOUT_MS, "OCR timed out");
      lines = result.lines;
      ocr = { confidence: result.confidence };
    } else if (msg.mime === DOCX_MIME || lower.endsWith(".docx")) {
      const { extractDocxLines } = await import("./parsers/docx");
      lines = await extractDocxLines(data);
    } else if (msg.mime.startsWith("text/") || lower.endsWith(".txt")) {
      text = new TextDecoder().decode(data);
    } else {
      throw new Error(`Unsupported file type: ${msg.mime || msg.fileName}`);
    }

    if (lines) text = docText(lines);
    const patch = lines ? parseCvLines(lines, { ocr: Boolean(ocr) }) : parseCvText(text);
    if (ocr) {
      patch.warnings.unshift(
        ocr.confidence < 65
          ? "This is a scan of low quality: text was recognized by OCR and may contain errors. Please check every field."
          : "This document was read with OCR (it has no text layer). Please check every field.",
      );
    }
    if (ocrError) patch.warnings.push(`Text recognition (OCR) could not run on this scan: ${ocrError}`);
    if (text.replace(/\s/g, "").length < 200) {
      patch.warnings.push(
        "This looks like a scanned/image PDF. Paste your resume text in the editor instead.",
      );
    }
    await chrome.runtime.sendMessage({
      kind: "PARSE_CV_RESULT",
      jobId: msg.jobId,
      ok: true,
      patch,
      rawText: text,
    } satisfies Msg);
  } catch (e) {
    await chrome.runtime.sendMessage({
      kind: "PARSE_CV_RESULT",
      jobId: msg.jobId,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    } satisfies Msg);
  }
}

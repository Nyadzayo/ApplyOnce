import { b64decode, parseMsg, type Msg } from "@shared/messages";
import { parseCvText } from "@shared/cvparse";

// Offscreen document: the only heavy-compute host (PLAN.md Part 1).
// Receives PARSE_CV_REQUEST, extracts text (PDF.js / Mammoth), runs the pure
// CV parser, replies with a ProfilePatch.
//
// OCR note: scanned/image PDFs are detected by their tiny text yield and the
// user is asked to paste text instead. Tesseract-based OCR is deferred until
// its traineddata can be vendored into the package (no runtime downloads).

const handled = new Set<string>();

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function handleParse(msg: Extract<Msg, { kind: "PARSE_CV_REQUEST" }>): Promise<void> {
  if (handled.has(msg.jobId)) return; // SW re-forwards; dedupe by job id
  handled.add(msg.jobId);

  try {
    const data = b64decode(msg.dataB64);
    let text: string;
    const lower = msg.fileName.toLowerCase();
    // parsers are imported lazily so the message listener registers instantly
    // (PDF.js is ~1MB; importing it eagerly delays module evaluation and can
    // lose messages sent right after the offscreen document is created)
    if (msg.mime === "application/pdf" || lower.endsWith(".pdf")) {
      const { extractPdfText } = await import("./parsers/pdf");
      const pdf = await extractPdfText(data);
      text = pdf.text;
    } else if (msg.mime === DOCX_MIME || lower.endsWith(".docx")) {
      const { extractDocxText } = await import("./parsers/docx");
      text = await extractDocxText(data);
    } else if (msg.mime.startsWith("text/") || lower.endsWith(".txt")) {
      text = new TextDecoder().decode(data);
    } else {
      throw new Error(`Unsupported file type: ${msg.mime || msg.fileName}`);
    }

    const patch = parseCvText(text);
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

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const msg = parseMsg(raw);
  if (!msg) return false;
  if (msg.kind === "PARSE_CV_REQUEST") {
    // ack immediately so the SW knows the parser is alive, then work async
    sendResponse({ kind: "PONG" });
    void handleParse(msg);
  }
  return false;
});

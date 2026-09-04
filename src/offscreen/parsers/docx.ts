import mammoth from "mammoth";
import { linesFromHtml, type DocLine } from "@shared/doclines";

// DOCX → DocLine[] via Mammoth's HTML (headings, bold, table rows, links).
// The HTML is parsed with DOMParser and never rendered (PLAN.md Phase 6).

export async function extractDocxLines(data: ArrayBuffer): Promise<DocLine[]> {
  const result = await mammoth.convertToHtml({ arrayBuffer: data });
  const doc = new DOMParser().parseFromString(result.value, "text/html");
  return linesFromHtml(doc);
}

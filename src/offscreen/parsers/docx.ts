import mammoth from "mammoth";

// DOCX → raw text via Mammoth. Never render its HTML output unsanitized
// (PLAN.md Phase 6) — we only use extractRawText.

export async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value;
}

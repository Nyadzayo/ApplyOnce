import type { FieldDecision, FieldSignal, FillInstruction } from "./types";

// Decision → executable instruction. Shared by the panel flow and the
// in-page widget so both build identical fill plans.

export interface FilePayload {
  fileName: string;
  mime: string;
  dataB64: string;
}

export function decisionToInstruction(
  d: FieldDecision,
  sig: FieldSignal,
  file?: FilePayload,
): FillInstruction | null {
  let payload: FillInstruction["payload"] | null = null;
  if (d.documentId) {
    if (!file) return null;
    payload = { type: "file", ...file };
  } else if (d.checked !== undefined) {
    payload = { type: "check", checked: d.checked };
  } else if (d.optionsMulti && d.optionsMulti.length > 0) {
    payload = { type: "multi", options: d.optionsMulti };
  } else if (d.option) {
    payload = { type: "option", optionText: d.option.text, optionValue: d.option.value };
  } else if (d.value) {
    payload = { type: "text", value: d.value };
  } else {
    return null;
  }
  return {
    ref: d.ref,
    framePath: sig.framePath,
    selector: sig.selector,
    memberSelectors: sig.memberSelectors,
    kind: sig.kind,
    widgetHint: sig.widgetHint,
    payload,
    amber: d.action !== "fill",
  };
}

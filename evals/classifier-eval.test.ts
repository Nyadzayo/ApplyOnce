import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BpeTokenizer, type TokenizerFile } from "@shared/bpe-tokenizer";
import { CLASSIFIER_THRESHOLD, hintFromLogits, INTENT_TO_KEY, serializeForClassifier } from "@shared/intent-map";

// Intent classifier eval (PLAN.md Part 9 section 4). Needs the trained
// model assets (not in this repo): APPLYONCE_CLASSIFIER_DIR or the default
// path in the autofill-api repo. Checks, in order:
//   1. the TS tokenizer reproduces the training tokenizer's ids exactly;
//   2. onnxruntime-web (wasm, single thread, as in the offscreen document)
//      reproduces the reference logits of the int8 model;
//   3. kept-accuracy at the abstain threshold on the held-out test split.

// the bundle finetune/06_export_web.py writes (model.onnx, tokenizer.json, label_map.json)
const DIR =
  process.env.APPLYONCE_CLASSIFIER_DIR ??
  "/Users/mnyadzayo/projects/autofill-api/finetune/kaggle_job/v8_ettin-encoder-32m/web";
const SPLIT = process.env.APPLYONCE_CLASSIFIER_TEST ??
  "/Users/mnyadzayo/projects/autofill-api/finetune/data/splits/test.jsonl";
const present = existsSync(join(DIR, "model.onnx")) && existsSync(join(DIR, "tokenizer.json"));

interface Ref {
  ref: { text: string; ids: number[] }[];
  pred: { text: string; label: number; prob: number; top_logits: number[] }[];
}

async function session() {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.numThreads = 1;
  const bytes = readFileSync(join(DIR, "model.onnx"));
  const s = await ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ["wasm"] });
  return { ort, s };
}

function feeds(ort: typeof import("onnxruntime-web"), ids: number[]) {
  const n = ids.length;
  return {
    input_ids: new ort.Tensor("int64", BigInt64Array.from(ids.map((i) => BigInt(i))), [1, n]),
    attention_mask: new ort.Tensor("int64", BigInt64Array.from(ids.map(() => 1n)), [1, n]),
  };
}

describe.skipIf(!present)("intent classifier", () => {
  const tokenizer = () =>
    new BpeTokenizer(JSON.parse(readFileSync(join(DIR, "tokenizer.json"), "utf8")) as TokenizerFile);
  const labels = (): string[] => {
    const map = JSON.parse(readFileSync(join(DIR, "label_map.json"), "utf8")) as Record<string, string>;
    return Object.keys(map).sort((a, b) => Number(a) - Number(b)).map((k) => map[k]!);
  };
  const reference = JSON.parse(
    readFileSync(join(__dirname, "..", "fixtures", "classifier", "ettin-ref.json"), "utf8"),
  ) as Ref;

  it("tokenizer reproduces the training tokenizer ids", () => {
    const tok = tokenizer();
    for (const r of reference.ref) expect(tok.encode(r.text), r.text).toEqual(r.ids);
  });

  it("weight-only int8 model under onnxruntime-web reproduces the reference logits", async () => {
    const { ort, s } = await session();
    const tok = tokenizer();
    const names = labels();
    expect(names).toHaveLength(63);
    for (const p of reference.pred) {
      const out = await s.run(feeds(ort, tok.encode(p.text)));
      const logits = out["logits"]!.data as Float32Array;
      for (let i = 0; i < 4; i++) expect(Math.abs(logits[i]! - p.top_logits[i]!), p.text).toBeLessThan(0.25); // raw logits: wasm vs x86 fp32 kernels; probabilities and the split floors are the real check
      const hint = hintFromLogits(logits, names);
      expect(hint.intent, p.text).toBe(names[p.label]);
      expect(Math.abs(hint.score - p.prob), p.text).toBeLessThan(0.03);
    }
    // the product rule at the threshold: the linkedin question maps, the
    // dinosaur question abstains
    const linkedin = hintFromLogits((await s.run(feeds(ort, tok.encode("LinkedIn Profile"))))["logits"]!.data as Float32Array, names);
    expect(linkedin.key).toBe("links.linkedin");
    expect(linkedin.score).toBeGreaterThanOrEqual(CLASSIFIER_THRESHOLD);
    const dino = hintFromLogits((await s.run(feeds(ort, tok.encode("Favorite dinosaur"))))["logits"]!.data as Float32Array, names);
    expect(dino.score).toBeLessThan(CLASSIFIER_THRESHOLD);
  }, 120000);

  it.skipIf(!existsSync(SPLIT))("held-out split: kept accuracy at the abstain threshold", async () => {
    const { ort, s } = await session();
    const tok = tokenizer();
    const names = labels();
    const rows = readFileSync(SPLIT, "utf8").trim().split("\n").map((l) =>
      JSON.parse(l) as { text: string; intent: string; freq?: number; input_type?: string; options?: string[] });
    let kept = 0, keptCorrect = 0, keptTraffic = 0, keptTrafficCorrect = 0, traffic = 0;
    let mappedWrongKey = 0;
    const t0 = Date.now();
    for (const r of rows) {
      const out = await s.run(feeds(ort, tok.encode(serializeForClassifier(r.text, r.input_type, r.options))));
      const hint = hintFromLogits(out["logits"]!.data as Float32Array, names);
      const w = r.freq ?? 1;
      traffic += w;
      if (hint.score < CLASSIFIER_THRESHOLD) continue;
      kept++;
      keptTraffic += w;
      if (hint.intent === r.intent) {
        keptCorrect++;
        keptTrafficCorrect += w;
      } else if (hint.key && INTENT_TO_KEY[r.intent] !== hint.key) mappedWrongKey++;
    }
    const ms = (Date.now() - t0) / rows.length;
    console.log(
      `classifier test split: ${rows.length} rows, ${ms.toFixed(1)} ms/row; ` +
        `coverage ${(kept / rows.length).toFixed(3)} (traffic ${(keptTraffic / traffic).toFixed(3)}), ` +
        `kept accuracy ${(keptCorrect / kept).toFixed(3)} (traffic ${(keptTrafficCorrect / keptTraffic).toFixed(3)}), ` +
        `kept-but-wrong-key ${mappedWrongKey}`,
    );
    expect(kept / rows.length).toBeGreaterThanOrEqual(0.2); // fp32-equivalent calibration (0.249 measured)
    expect(keptCorrect / kept).toBeGreaterThanOrEqual(0.95);
  }, 300000);
});

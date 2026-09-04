import { BpeTokenizer, type TokenizerFile } from "@shared/bpe-tokenizer";
import { CLASSIFIER_ASSET_FILES, classifierAssetUrl, type ClassifyField } from "@shared/classifier-assets";
import { hintFromLogits, serializeForClassifier, type ClassifierHint } from "@shared/intent-map";

// On-device intent classifier (PLAN.md Part 9 section 4): ettin-encoder-32m,
// weight-only int8 ONNX under onnxruntime-web (wasm, single thread: the
// offscreen document is not cross-origin isolated). Assets are fetched once
// and cached in Cache storage. Question labels never leave the device: this
// module only ever talks to the extension's own pages.

type Ort = typeof import("onnxruntime-web");

interface Runtime {
  ort: Ort;
  session: import("onnxruntime-web").InferenceSession;
  tokenizer: BpeTokenizer;
  labels: string[];
}

const CACHE_NAME = "applyonce-classifier";
let runtime: Promise<Runtime> | null = null;

const assetUrl = (file: string) => classifierAssetUrl(file, (p) => chrome.runtime.getURL(p));

async function fetchAsset(file: string): Promise<Response> {
  const url = assetUrl(file);
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(url);
  if (hit) return hit;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`classifier asset ${file}: HTTP ${res.status}`);
  await cache.put(url, res.clone());
  return res;
}

/** Whether every asset is already cached locally. */
export async function classifierCached(): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const file of Object.values(CLASSIFIER_ASSET_FILES)) {
      if (!(await cache.match(assetUrl(file)))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Whether the assets can be obtained at all (cached, or the host answers). */
export async function classifierAvailable(): Promise<boolean> {
  if (await classifierCached()) return true;
  try {
    const res = await fetch(assetUrl(CLASSIFIER_ASSET_FILES.labels), { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

function labelList(map: Record<string, string>): string[] {
  return Object.keys(map)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => map[k]!);
}

/** Download (once), cache and initialise the model. Safe to call repeatedly. */
export function loadClassifier(): Promise<Runtime> {
  runtime ??= (async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = {
      wasm: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.wasm"),
      mjs: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.mjs"),
    };
    const [model, tokenizerFile, labelMap] = await Promise.all([
      fetchAsset(CLASSIFIER_ASSET_FILES.model).then((r) => r.arrayBuffer()),
      fetchAsset(CLASSIFIER_ASSET_FILES.tokenizer).then((r) => r.json() as Promise<TokenizerFile>),
      fetchAsset(CLASSIFIER_ASSET_FILES.labels).then((r) => r.json() as Promise<Record<string, string>>),
    ]);
    const session = await ort.InferenceSession.create(new Uint8Array(model), {
      executionProviders: ["wasm"],
    });
    return { ort, session, tokenizer: new BpeTokenizer(tokenizerFile), labels: labelList(labelMap) };
  })().catch((e: unknown) => {
    runtime = null; // let the next call retry (offline, host down, bad cache)
    throw e;
  });
  return runtime;
}

/** Top intent per field with its probability; the cascade applies the threshold. */
export async function classifyFields(fields: ClassifyField[]): Promise<(ClassifierHint & { ref: string })[]> {
  if (fields.length === 0) return [];
  const rt = await loadClassifier();
  const out: (ClassifierHint & { ref: string })[] = [];
  for (const f of fields) {
    const ids = rt.tokenizer.encode(serializeForClassifier(f.label, f.kind, f.options));
    const n = ids.length;
    const feeds = {
      input_ids: new rt.ort.Tensor("int64", BigInt64Array.from(ids.map((i) => BigInt(i))), [1, n]),
      attention_mask: new rt.ort.Tensor("int64", BigInt64Array.from(ids.map(() => 1n)), [1, n]),
    };
    const result = await rt.session.run(feeds);
    const logits = result["logits"]!.data as Float32Array;
    out.push({ ref: f.ref, ...hintFromLogits(logits, rt.labels) });
  }
  return out;
}

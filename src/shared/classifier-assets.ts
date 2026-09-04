// Intent-classifier model assets (PLAN.md Part 9 section 4). The model is not
// packaged with the extension: it is fetched once from a project-controlled
// host, verified against the sizes below, and cached in the offscreen
// document's Cache storage. Development builds may instead drop the bundle
// (finetune/06_export_web.py output) into public/models/<version>/.

export const CLASSIFIER_VERSION = "v8-ettin-encoder-32m";

export const CLASSIFIER_ASSET_FILES = {
  model: "model.onnx", // weight-only int8, fp32 activations (see 06_export_web.py)
  tokenizer: "tokenizer.json", // the exact training tokenizer
  labels: "label_map.json",
} as const;

/** Shown in Settings before the user opts in. */
export const CLASSIFIER_DOWNLOAD_MB = 37;

/**
 * Project-controlled asset host: a GitHub Release of this repository (tag
 * models-<version>), so model and code live together and every file has a
 * sha256 in the release's manifest.json. Empty string = development builds
 * read the bundle from public/models/<version>/ instead.
 */
export const CLASSIFIER_ASSETS_BASE_URL: string =
  `https://github.com/Nyadzayo/ApplyOnce/releases/download/models-${CLASSIFIER_VERSION}/`;

export function classifierAssetUrl(file: string, packagedUrl: (path: string) => string): string {
  const base = CLASSIFIER_ASSETS_BASE_URL;
  return base ? `${base.replace(/\/?$/, "/")}${file}` : packagedUrl(`models/${CLASSIFIER_VERSION}/${file}`);
}

/** One field as handed to the classifier: label text plus structure. */
export interface ClassifyField {
  ref: string;
  label: string;
  kind?: string;
  options?: string[];
}

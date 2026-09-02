// Vendors the tesseract.js runtime into public/tesseract/ so OCR runs from
// the extension package with no runtime downloads (PLAN.md Part 9 s5a):
//   worker.min.js + the SIMD wasm core (every supported browser has SIMD), eng.traineddata (Apache-2.0,
//   tesseract-ocr/tessdata_fast) fetched once and gzipped. Idempotent.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "tesseract");
mkdirSync(dir, { recursive: true });

// tesseract.js picks the core by CPU feature at run time (worker-script/
// browser/getCore.js): relaxed SIMD (Chrome 114+, Firefox 135+), then SIMD.
// Both LSTM-only builds ship; a missing file is a silent 404 inside the worker.
const copies = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm", "tesseract-core-relaxedsimd-lstm.wasm"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm", "tesseract-core-simd-lstm.wasm"],
];
for (const [src, dst] of copies) {
  const from = join(root, "node_modules", src);
  if (!existsSync(from)) {
    console.warn(`missing ${src}; run npm install`);
    continue;
  }
  copyFileSync(from, join(dir, dst));
}

const lang = join(dir, "eng.traineddata.gz");
if (!existsSync(lang)) {
  const url = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata";
  console.log(`fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`traineddata download failed: HTTP ${res.status}`);
  writeFileSync(lang, gzipSync(Buffer.from(await res.arrayBuffer())));
  writeFileSync(join(dir, "LICENSE.tessdata.txt"), "eng.traineddata: tesseract-ocr/tessdata_fast, Apache License 2.0.\n");
}
let total = 0;
for (const f of [...copies.map((c) => c[1]), "eng.traineddata.gz"]) {
  const p = join(dir, f);
  if (existsSync(p)) {
    total += statSync(p).size;
    console.log(`${f.padEnd(40)} ${(statSync(p).size / 1e6).toFixed(2)} MB`);
  }
}
console.log(`public/tesseract total ${(total / 1e6).toFixed(1)} MB`);

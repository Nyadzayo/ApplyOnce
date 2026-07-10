// Resolve the OKLCH ramp to hex via Chromium's color engine.
import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chromium", headless: true });
const page = await browser.newPage();
// accent: hue 245 constant, perceptual lightness steps, Gaussian chroma peak mid-scale
const ramp = {
  "accent-50":  "oklch(0.97 0.013 245)",
  "accent-100": "oklch(0.93 0.032 245)",
  "accent-200": "oklch(0.87 0.06 245)",
  "accent-300": "oklch(0.78 0.09 245)",
  "accent-400": "oklch(0.67 0.12 245)",
  "accent-500": "oklch(0.575 0.142 245)",
  "accent-600": "oklch(0.49 0.148 245)",
  "accent-700": "oklch(0.42 0.132 245)",
  "accent-800": "oklch(0.35 0.105 245)",
  "accent-900": "oklch(0.28 0.075 245)",
  // neutrals: same hue, whisper chroma (Radix-slate approach)
  "paper-l":  "oklch(0.985 0.003 245)",
  "card-l":   "oklch(1 0 0)",
  "line-l":   "oklch(0.915 0.007 245)",
  "lineS-l":  "oklch(0.855 0.01 245)",
  "faint-l":  "oklch(0.62 0.018 245)",
  "muted-l":  "oklch(0.50 0.022 245)",
  "ink-l":    "oklch(0.26 0.022 245)",
  "paper-d":  "oklch(0.185 0.012 245)",
  "card-d":   "oklch(0.225 0.014 245)",
  "line-d":   "oklch(0.30 0.016 245)",
  "lineS-d":  "oklch(0.37 0.018 245)",
  "faint-d":  "oklch(0.55 0.02 245)",
  "muted-d":  "oklch(0.66 0.02 245)",
  "ink-d":    "oklch(0.93 0.006 245)",
  // semantics, graded same way (base+wash per scheme)
  "good-l": "oklch(0.52 0.11 155)", "goodW-l": "oklch(0.95 0.025 155)",
  "warn-l": "oklch(0.55 0.11 70)",  "warnW-l": "oklch(0.955 0.03 85)",
  "bad-l":  "oklch(0.52 0.14 27)",  "badW-l":  "oklch(0.955 0.02 27)",
  "good-d": "oklch(0.72 0.11 155)", "goodW-d": "oklch(0.28 0.03 155)",
  "warn-d": "oklch(0.75 0.11 75)",  "warnW-d": "oklch(0.28 0.035 80)",
  "bad-d":  "oklch(0.70 0.13 27)",  "badW-d":  "oklch(0.27 0.035 27)",
};
const out = await page.evaluate((ramp) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const res = {};
  for (const [k, v] of Object.entries(ramp)) {
    g.fillStyle = "#000"; g.fillRect(0, 0, 1, 1);
    g.fillStyle = v; g.fillRect(0, 0, 1, 1);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    res[k] = "#" + [r, gr, b].map((n) => n.toString(16).padStart(2, "0")).join("");
  }
  return res;
}, ramp);
console.log(JSON.stringify(out, null, 2));
await browser.close();

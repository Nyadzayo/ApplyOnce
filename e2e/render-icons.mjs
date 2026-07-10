// Render public/icons/*.png from assets/icon.svg via headless Chromium.
// Full size ladder: Chrome picks 2x variants on Retina (16→32, 128→256), so
// missing large sizes = blurry upscaling. 512 is the store-listing asset.
// Size-aware detail: the embossed inner ring is sub-pixel at 16/32px and
// renders as mud, so small sizes ship the simplified mark (icon-design rule:
// drop fine detail below ~48px).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const fullSvg = readFileSync("assets/icon.svg", "utf8");
const simpleSvg = fullSvg.replace(/<rect[^>]*stroke="#FFFFFF"[^>]*\/>\s*/, "");

const browser = await chromium.launch({ channel: "chromium", headless: true });

for (const size of [16, 32, 48, 128, 256, 512]) {
  const svg = size <= 32 ? simpleSvg : fullSvg;
  // deviceScaleFactor 1 + exact viewport = pixel-perfect vector rasterization
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>*{margin:0;padding:0}html,body{background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: `public/icons/icon${size}.png`, omitBackground: true });
  await page.close();
  console.log(`icon${size}.png rendered${size <= 32 ? " (simplified mark)" : ""}`);
}
await browser.close();

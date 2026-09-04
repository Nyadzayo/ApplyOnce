import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync } from "node:fs";

// Builds the extension pages (side panel, offscreen) and the MV3 service
// worker as ES modules. The content script is built separately as an IIFE by
// vite.content.config.ts because it must be a single self-contained file for
// chrome.scripting.executeScript injection.
// TARGET=firefox builds the pages into dist-firefox without the offscreen
// document or the ESM service worker; scripts/build-firefox.mjs then adds the
// IIFE background (vite.background.firefox.config.ts) and the Firefox manifest.
const firefox = process.env.TARGET === "firefox";

// onnxruntime-web loads its wasm runtime from a URL at run time; the
// offscreen classifier points it at <extension>/ort/ (PLAN.md Part 9 s4).
function copyOrtWasm() {
  return {
    name: "copy-ort-wasm",
    closeBundle() {
      if (firefox) return;
      const src = fileURLToPath(new URL("./node_modules/onnxruntime-web/dist/", import.meta.url));
      const dst = fileURLToPath(new URL("./dist/ort/", import.meta.url));
      mkdirSync(dst, { recursive: true });
      for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) copyFileSync(src + f, dst + f);
    },
  };
}

export default defineConfig({
  plugins: [react(), copyOrtWasm()],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@storage": fileURLToPath(new URL("./src/storage", import.meta.url)),
    },
  },
  build: {
    outDir: firefox ? "dist-firefox" : "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        sidepanel: fileURLToPath(new URL("./sidepanel.html", import.meta.url)),
        ...(firefox
          ? {}
          : {
              offscreen: fileURLToPath(new URL("./offscreen.html", import.meta.url)),
              background: fileURLToPath(
                new URL("./src/background/service-worker.ts", import.meta.url),
              ),
            }),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    target: firefox ? "firefox115" : "chrome120",
  },
});

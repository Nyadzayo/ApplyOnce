import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Firefox background: an event page (not a service worker), built as a single
// classic IIFE so it works without ESM background support. Dynamic imports
// (PDF.js, Mammoth — run inline here because Firefox has no offscreen API)
// are inlined; the pdf.js worker is still emitted as a separate asset.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@storage": fileURLToPath(new URL("./src/storage", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-firefox",
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/background/service-worker.ts", import.meta.url)),
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "background.js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    target: "firefox115",
  },
});

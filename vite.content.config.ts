import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Content script: single-file IIFE, injected programmatically via
// chrome.scripting.executeScript({ files: ["content.js"] }).
const firefox = process.env.TARGET === "firefox";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@storage": fileURLToPath(new URL("./src/storage", import.meta.url)),
    },
  },
  build: {
    outDir: firefox ? "dist-firefox" : "dist",
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL("./src/content/index.ts", import.meta.url)),
      formats: ["iife"],
      name: "FastApplyContent",
      fileName: () => "content.js",
    },
    target: firefox ? "firefox115" : "chrome120",
  },
});

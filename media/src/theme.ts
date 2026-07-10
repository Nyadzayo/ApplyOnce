import { loadFont } from "@remotion/google-fonts/Figtree";

// ApplyOnce brand — the graded OKLCH ramp from the extension (hue 245).
// Figtree is the closest Google face to the product's Avenir Next stack.
const { fontFamily } = loadFont("normal", {
  weights: ["500", "600", "700", "800"],
});

export const FONT = fontFamily;

export const C = {
  paper: "#f8fafc",
  card: "#ffffff",
  ink: "#1b252e",
  muted: "#59656f",
  faint: "#7d8891",
  line: "#dfe3e7",
  lineStrong: "#cad0d6",
  stamp: "#0065ad",
  stampDeep: "#00508f",
  stampWash: "#eef6fe",
  good: "#267b4c",
  goodWash: "#e2f4e7",
  warn: "#9a6418",
  warnWash: "#f9efda",
};

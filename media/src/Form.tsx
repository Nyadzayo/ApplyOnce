import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "./theme";

// The mock application form used across scenes: rows that type themselves and
// get "stamped" green (verified) or amber (check me) — the product's actual
// visual language.

export type RowState = "empty" | "typing" | "green" | "amber";

export const FormRow: React.FC<{
  label: string;
  value: string;
  /** frame the row starts typing; Infinity = never (static states below) */
  startFrame?: number;
  typeFrames?: number;
  tone?: "green" | "amber";
  file?: boolean;
  /** static override for stills / undo scene */
  staticState?: { chars: number; stamped: boolean };
  width?: number;
  scale?: number;
}> = ({
  label,
  value,
  startFrame = Infinity,
  typeFrames = 22,
  tone = "green",
  file = false,
  staticState,
  width = 760,
  scale = 1,
}) => {
  const frame = useCurrentFrame();
  const chars = staticState
    ? staticState.chars
    : Math.floor(
        interpolate(frame, [startFrame, startFrame + typeFrames], [0, value.length], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      );
  const stamped = staticState ? staticState.stamped : frame >= startFrame + typeFrames + 3;
  const toneColor = tone === "green" ? C.good : C.warn;
  const toneWash = tone === "green" ? C.goodWash : C.warnWash;

  return (
    <div style={{ width, fontFamily: FONT }}>
      <div
        style={{
          fontSize: 22 * scale,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: C.muted,
          marginBottom: 8 * scale,
        }}
      >
        {label}
      </div>
      <div
        style={{
          height: 64 * scale,
          borderRadius: 12 * scale,
          border: `${3 * scale}px solid ${stamped ? toneColor : C.lineStrong}`,
          background: stamped ? toneWash : C.card,
          display: "flex",
          alignItems: "center",
          padding: `0 ${18 * scale}px`,
          fontSize: 30 * scale,
          fontWeight: 500,
          color: C.ink,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {file && chars > 0 ? "📎 " : ""}
        {value.slice(0, chars)}
        {chars > 0 && chars < value.length ? (
          <span style={{ color: C.stamp }}>|</span>
        ) : null}
      </div>
    </div>
  );
};

/** The floating widget pill, as on real pages. */
export const Pill: React.FC<{ label: string; cta: string; scale?: number }> = ({
  label,
  cta,
  scale = 1,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 14 * scale,
      background: C.card,
      border: `${2 * scale}px solid ${C.line}`,
      borderRadius: 999,
      padding: `${12 * scale}px ${18 * scale}px`,
      boxShadow: "0 12px 40px rgba(27,37,46,0.16)",
      fontFamily: FONT,
    }}
  >
    <svg width={26 * scale} height={26 * scale} viewBox="0 0 128 128">
      <rect x="6" y="6" width="116" height="116" rx="30" fill={C.stamp} />
      <path
        d="M 38 66 L 57 86 L 92 42"
        fill="none"
        stroke="#fff"
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    <span style={{ fontSize: 26 * scale, fontWeight: 700, color: C.ink }}>{label}</span>
    <span
      style={{
        background: C.stamp,
        color: "#fff",
        fontSize: 26 * scale,
        fontWeight: 700,
        borderRadius: 10 * scale,
        padding: `${8 * scale}px ${22 * scale}px`,
      }}
    >
      {cta}
    </span>
  </div>
);

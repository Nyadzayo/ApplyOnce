import React from "react";
import { C } from "./theme";

/** The ApplyOnce mark: a stamp with one bold check. */
export const Stamp: React.FC<{ size: number; ring?: boolean }> = ({
  size,
  ring = true,
}) => (
  <svg width={size} height={size} viewBox="0 0 128 128">
    <rect x="6" y="6" width="116" height="116" rx="30" fill={C.stamp} />
    {ring && (
      <rect
        x="13"
        y="13"
        width="102"
        height="102"
        rx="24"
        fill="none"
        stroke="#fff"
        strokeOpacity={0.28}
        strokeWidth={3}
      />
    )}
    <path
      d="M 38 66 L 57 86 L 92 42"
      fill="none"
      stroke="#fff"
      strokeWidth={14}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ fontSize: size, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink }}>
    Apply<span style={{ color: C.stamp }}>Once</span>
  </div>
);

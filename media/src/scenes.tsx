import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { C, FONT } from "./theme";
import { Stamp, Wordmark } from "./Stamp";
import { FormRow, Pill } from "./Form";

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const overshoot = Easing.bezier(0.34, 1.4, 0.64, 1);

const Paper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(1200px 800px at 50% 30%, ${C.stampWash} 0%, ${C.paper} 60%)`,
      fontFamily: FONT,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </AbsoluteFill>
);

// ---------------------------------------------------------------------------
// Scene 1 (0–90): the stamp slams in. Apply once. Everywhere.
// ---------------------------------------------------------------------------

export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const stampScale = interpolate(f, [6, 26], [2.6, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: overshoot,
  });
  const stampOpacity = interpolate(f, [6, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // impact ripple
  const rippleScale = interpolate(f, [24, 52], [0.9, 1.9], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const rippleOpacity = interpolate(f, [24, 52], [0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const wordOpacity = interpolate(f, [32, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const wordY = interpolate(f, [32, 48], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const tagOpacity = interpolate(f, [52, 68], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <Paper>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44 }}>
        <div style={{ position: "relative", width: 220, height: 220 }}>
          <div
            style={{
              position: "absolute",
              inset: -20,
              borderRadius: 64,
              border: `4px solid ${C.stamp}`,
              opacity: rippleOpacity,
              scale: String(rippleScale),
            }}
          />
          <div style={{ opacity: stampOpacity, scale: String(stampScale) }}>
            <Stamp size={220} />
          </div>
        </div>
        <div style={{ opacity: wordOpacity, translate: `0px ${wordY}px` }}>
          <Wordmark size={110} />
        </div>
        <div
          style={{
            opacity: tagOpacity,
            fontSize: 54,
            fontWeight: 500,
            color: C.muted,
          }}
        >
          Apply once. <span style={{ color: C.stamp, fontWeight: 700 }}>Everywhere.</span>
        </div>
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Scene 2 (90–210): the grind — ghost forms drift past.
// ---------------------------------------------------------------------------

const GhostForm: React.FC<{ x: number; drift: number; delay: number }> = ({
  x,
  drift,
  delay,
}) => {
  const f = useCurrentFrame();
  const dx = interpolate(f, [0, 120], [0, drift], { easing: Easing.linear });
  const o = interpolate(f, [delay, delay + 12, 96, 116], [0, 0.4, 0.4, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 640,
        width: 420,
        opacity: o,
        translate: `${dx}px 0px`,
        background: C.card,
        border: `2px solid ${C.line}`,
        borderRadius: 16,
        padding: 26,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {["First name", "Email", "Phone", "Work authorization"].map((l) => (
        <div key={l}>
          <div style={{ fontSize: 17, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{l}</div>
          <div style={{ height: 34, borderRadius: 8, border: `2px solid ${C.line}` }} />
        </div>
      ))}
    </div>
  );
};

export const Grind: React.FC = () => {
  const f = useCurrentFrame();
  const hOpacity = interpolate(f, [4, 22, 100, 118], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const hY = interpolate(f, [4, 22], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return (
    <Paper>
      <GhostForm x={140} drift={-70} delay={8} />
      <GhostForm x={750} drift={40} delay={16} />
      <GhostForm x={1360} drift={-50} delay={24} />
      <div
        style={{
          position: "absolute",
          top: 220,
          width: "100%",
          textAlign: "center",
          opacity: hOpacity,
          translate: `0px ${hY}px`,
        }}
      >
        <div style={{ fontSize: 100, fontWeight: 800, color: C.ink, letterSpacing: "-0.02em" }}>
          Every application.
        </div>
        <div style={{ fontSize: 100, fontWeight: 800, color: C.muted, letterSpacing: "-0.02em" }}>
          The same 20 questions.
        </div>
      </div>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Scene 3 (210–460): the hero fill.
// ---------------------------------------------------------------------------

const Cursor: React.FC<{ x: number; y: number; click: boolean }> = ({ x, y, click }) => (
  <svg
    width={44}
    height={44}
    viewBox="0 0 24 24"
    style={{
      position: "absolute",
      left: x,
      top: y,
      scale: click ? "0.85" : "1",
      filter: "drop-shadow(0 3px 6px rgba(27,37,46,0.35))",
    }}
  >
    <path d="M4 2 L20 12 L12.5 13.5 L9 21 Z" fill={C.ink} stroke="#fff" strokeWidth={1.4} />
  </svg>
);

export const Fill: React.FC = () => {
  const f = useCurrentFrame();
  const cardIn = interpolate(f, [0, 20], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const cardOpacity = interpolate(f, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const capOpacity = interpolate(f, [6, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const pillIn = interpolate(f, [14, 32], [120, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: overshoot,
  });
  // cursor path: enters from right, lands on the pill CTA, clicks at f=52
  const cx = interpolate(f, [22, 50], [1880, 1462], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const cy = interpolate(f, [22, 50], [1000, 872], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const clicking = f >= 52 && f <= 58;
  const fillStart = 62; // rows begin after the click
  const summaryOpacity = interpolate(f, [fillStart + 4 * 34 + 26, fillStart + 4 * 34 + 42], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <Paper>
      <div
        style={{
          position: "absolute",
          top: 74,
          width: "100%",
          textAlign: "center",
          opacity: capOpacity,
          fontSize: 58,
          fontWeight: 700,
          color: C.ink,
        }}
      >
        One click fills the whole application
      </div>

      <div
        style={{
          opacity: cardOpacity,
          translate: `0px ${cardIn}px`,
          background: C.card,
          border: `2px solid ${C.line}`,
          borderRadius: 22,
          padding: "44px 52px",
          boxShadow: "0 24px 80px rgba(27,37,46,0.12)",
          display: "flex",
          flexDirection: "column",
          gap: 26,
          marginTop: 60,
        }}
      >
        <FormRow label="Full name" value="Jordan Rivera" startFrame={fillStart} />
        <FormRow label="Email" value="jordan.rivera@email.com" startFrame={fillStart + 34} />
        <FormRow
          label="Authorized to work?"
          value="Yes — from your explicit answer"
          startFrame={fillStart + 68}
          tone="amber"
        />
        <FormRow
          label="Resume"
          value="jordan-rivera.pdf"
          startFrame={fillStart + 102}
          typeFrames={2}
          file
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 84,
          width: "100%",
          textAlign: "center",
          opacity: summaryOpacity,
          fontSize: 44,
          fontWeight: 700,
          color: C.good,
        }}
      >
        ✓ 11 filled · 1 flagged for you · nothing submitted
      </div>

      <div style={{ position: "absolute", right: 140, bottom: 170, translate: `${pillIn}px 0px` }}>
        <Pill label="11 ready" cta="Fill" scale={1.35} />
      </div>
      <Cursor x={cx} y={cy} click={clicking} />
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Scene 4 (460–660): trust beats — one message at a time.
// ---------------------------------------------------------------------------

const Beat: React.FC<{
  from: number;
  to: number;
  title: string;
  sub: string;
  children?: React.ReactNode;
}> = ({ from, to, title, sub, children }) => {
  const f = useCurrentFrame();
  if (f < from - 6 || f > to + 6) return null;
  const o = interpolate(f, [from, from + 14, to - 12, to], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const y = interpolate(f, [from, from + 14], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        opacity: o,
        translate: `0px ${y}px`,
      }}
    >
      <div style={{ fontSize: 96, fontWeight: 800, color: C.ink, letterSpacing: "-0.02em" }}>{title}</div>
      <div style={{ fontSize: 48, fontWeight: 500, color: C.muted }}>{sub}</div>
      {children}
    </div>
  );
};

export const Trust: React.FC = () => {
  const f = useCurrentFrame();
  // undo beat: values un-type in reverse
  const undoChars = (len: number, start: number) =>
    Math.floor(
      interpolate(f, [start, start + 18], [len, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    );
  return (
    <Paper>
      <Beat from={0} to={66} title="It never submits for you." sub="You review. You send. Every time." />
      <Beat from={66} to={134} title="Undo anything." sub="Every fill leaves a receipt.">
        <div
          style={{
            background: C.card,
            border: `2px solid ${C.line}`,
            borderRadius: 18,
            padding: "30px 36px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            marginTop: 8,
          }}
        >
          <FormRow
            label="Full name"
            value="Jordan Rivera"
            staticState={{ chars: undoChars(13, 88), stamped: f < 92 }}
            width={620}
            scale={0.86}
          />
          <FormRow
            label="Email"
            value="jordan.rivera@email.com"
            staticState={{ chars: undoChars(23, 96), stamped: f < 100 }}
            width={620}
            scale={0.86}
          />
        </div>
      </Beat>
      <Beat from={134} to={200} title="Your data never leaves your device." sub="No account. No cloud. No tracking.">
        <svg width={92} height={92} viewBox="0 0 24 24" style={{ marginTop: 6 }}>
          <rect x="4" y="10" width="16" height="10" rx="2.4" fill={C.stamp} />
          <path d="M8 10 V7 a4 4 0 0 1 8 0 v3" fill="none" stroke={C.stamp} strokeWidth={2.4} />
          <circle cx="12" cy="15" r="1.8" fill="#fff" />
        </svg>
      </Beat>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// Scene 5 (660–780): CTA.
// ---------------------------------------------------------------------------

export const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const s = interpolate(f, [0, 22], [0.94, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: overshoot,
  });
  const urlO = interpolate(f, [26, 44], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Paper>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 38,
          opacity: o,
          scale: String(s),
        }}
      >
        <Stamp size={170} />
        <Wordmark size={104} />
        <div
          style={{
            background: C.stamp,
            color: "#fff",
            fontSize: 44,
            fontWeight: 700,
            borderRadius: 16,
            padding: "20px 46px",
          }}
        >
          Free on Chrome
        </div>
        <div style={{ opacity: urlO, fontSize: 38, color: C.muted, fontWeight: 500 }}>
          nyadzayo.github.io/ApplyOnce
        </div>
      </div>
    </Paper>
  );
};

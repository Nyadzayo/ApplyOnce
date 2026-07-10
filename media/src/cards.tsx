import React from "react";
import { AbsoluteFill } from "remotion";
import { C, FONT } from "./theme";
import { Stamp, Wordmark } from "./Stamp";
import { FormRow, Pill } from "./Form";

// Static assets: Chrome Web Store tiles/marquee/screenshot backdrop + social
// cards. Rendered via `remotion still`.

const Base: React.FC<{ children: React.ReactNode; center?: boolean }> = ({
  children,
  center = true,
}) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(1000px 700px at 50% 20%, ${C.stampWash} 0%, ${C.paper} 62%)`,
      fontFamily: FONT,
      alignItems: center ? "center" : undefined,
      justifyContent: center ? "center" : undefined,
    }}
  >
    {children}
  </AbsoluteFill>
);

const MiniForm: React.FC<{ scale?: number }> = ({ scale = 1 }) => (
  <div
    style={{
      background: C.card,
      border: `2px solid ${C.line}`,
      borderRadius: 18 * scale,
      padding: 28 * scale,
      display: "flex",
      flexDirection: "column",
      gap: 16 * scale,
      boxShadow: "0 18px 60px rgba(27,37,46,0.12)",
    }}
  >
    <FormRow label="Full name" value="Jordan Rivera" staticState={{ chars: 13, stamped: true }} width={520 * scale} scale={0.8 * scale} />
    <FormRow label="Email" value="jordan.rivera@email.com" staticState={{ chars: 23, stamped: true }} width={520 * scale} scale={0.8 * scale} />
    <FormRow label="Authorized to work?" value="Yes — your explicit answer" tone="amber" staticState={{ chars: 26, stamped: true }} width={520 * scale} scale={0.8 * scale} />
    <FormRow label="Resume" value="jordan-rivera.pdf" file staticState={{ chars: 17, stamped: true }} width={520 * scale} scale={0.8 * scale} />
  </div>
);

const TrustLine: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ fontSize: size, color: C.muted, fontWeight: 500 }}>
    Never auto-submits · One-click undo · Data stays on your device
  </div>
);

/** CWS large promo tile / screenshot backdrop — 1280×800 */
export const PromoTile: React.FC = () => (
  <Base center={false}>
    <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 84px", gap: 70 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 30, flex: 1 }}>
        <Stamp size={96} />
        <Wordmark size={84} />
        <div style={{ fontSize: 40, color: C.ink, fontWeight: 600, lineHeight: 1.25 }}>
          Fill any job application<br />in one click.
        </div>
        <TrustLine size={24} />
      </div>
      <div style={{ position: "relative" }}>
        <MiniForm scale={1} />
        <div style={{ position: "absolute", right: -30, bottom: -34 }}>
          <Pill label="11 ready" cta="Fill" />
        </div>
      </div>
    </div>
  </Base>
);

/** CWS small promo tile — 440×280 */
export const SmallTile: React.FC = () => (
  <Base>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <Stamp size={92} />
      <Wordmark size={56} />
      <div style={{ fontSize: 22, color: C.muted, fontWeight: 500 }}>
        Job application autofill
      </div>
    </div>
  </Base>
);

/** CWS marquee — 1400×560 (exact dashboard requirement) */
export const Marquee: React.FC = () => (
  <Base center={false}>
    <div style={{ display: "flex", alignItems: "center", height: "100%", padding: "0 90px", gap: 80 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Stamp size={72} />
          <Wordmark size={66} />
        </div>
        <div style={{ fontSize: 46, color: C.ink, fontWeight: 700, lineHeight: 1.16, letterSpacing: "-0.01em" }}>
          Apply once. <span style={{ color: C.stamp }}>Everywhere.</span>
        </div>
        <TrustLine size={23} />
      </div>
      <MiniForm scale={0.72} />
    </div>
  </Base>
);

/** Social square — 1080×1080 */
export const SquareCard: React.FC = () => (
  <Base>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
      <Stamp size={140} />
      <Wordmark size={92} />
      <div style={{ fontSize: 44, color: C.muted, fontWeight: 500 }}>
        Apply once. <span style={{ color: C.stamp, fontWeight: 700 }}>Everywhere.</span>
      </div>
      <MiniForm scale={0.82} />
      <div style={{ fontSize: 28, color: C.faint, fontWeight: 500 }}>
        nyadzayo.github.io/ApplyOnce
      </div>
    </div>
  </Base>
);

/** OpenGraph / Twitter card — 1200×630 */
export const OgCard: React.FC = () => (
  <Base>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Stamp size={110} />
        <Wordmark size={96} />
      </div>
      <div style={{ fontSize: 46, color: C.ink, fontWeight: 600 }}>
        Job application autofill that never guesses
      </div>
      <TrustLine size={27} />
    </div>
  </Base>
);

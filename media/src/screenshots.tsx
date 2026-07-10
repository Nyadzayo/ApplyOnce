import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, FONT } from "./theme";
import { Stamp, Wordmark } from "./Stamp";

// Store screenshots (1280×800): real product captures inside a branded frame
// with a headline caption. Full-bleed page shots get a slim caption bar; the
// narrow side-panel captures get a split layout (caption left, capture right).

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(1100px 700px at 30% 0%, ${C.stampWash} 0%, ${C.paper} 60%)`,
      fontFamily: FONT,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Full-bleed page capture with a top caption bar. */
const PageShot: React.FC<{ src: string; caption: string; sub?: string }> = ({
  src,
  caption,
  sub,
}) => (
  <Frame>
    <div
      style={{
        height: 128,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 44px",
      }}
    >
      <Stamp size={52} ring={false} />
      <div>
        <div style={{ fontSize: 36, fontWeight: 750, color: C.ink, letterSpacing: "-0.01em" }}>
          {caption}
        </div>
        {sub ? (
          <div style={{ fontSize: 21, color: C.muted, fontWeight: 500 }}>{sub}</div>
        ) : null}
      </div>
    </div>
    <div style={{ flex: 1, padding: "0 44px 40px" }}>
      <div
        style={{
          height: "100%",
          borderRadius: 16,
          overflow: "hidden",
          border: `2px solid ${C.line}`,
          boxShadow: "0 22px 70px rgba(27,37,46,0.16)",
          background: "#fff",
        }}
      >
        <Img
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
        />
      </div>
    </div>
  </Frame>
);

/** Split layout: caption block left, tall side-panel capture right. */
const PanelShot: React.FC<{ src: string; caption: string; points: string[] }> = ({
  src,
  caption,
  points,
}) => (
  <Frame>
    <div style={{ display: "flex", height: "100%", alignItems: "center", padding: "0 64px", gap: 64 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Stamp size={56} />
          <Wordmark size={46} />
        </div>
        <div style={{ fontSize: 46, fontWeight: 750, color: C.ink, lineHeight: 1.15, letterSpacing: "-0.01em" }}>
          {caption}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {points.map((p) => (
            <div key={p} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span style={{ color: C.good, fontSize: 24, fontWeight: 800 }}>✓</span>
              <span style={{ fontSize: 26, color: C.muted, fontWeight: 500 }}>{p}</span>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          width: 424,
          height: 724,
          borderRadius: 18,
          overflow: "hidden",
          border: `2px solid ${C.line}`,
          boxShadow: "0 26px 80px rgba(27,37,46,0.18)",
          background: "#fff",
          flex: "none",
        }}
      >
        <Img
          src={staticFile(src)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
        />
      </div>
    </div>
  </Frame>
);

export const Screenshot2: React.FC = () => (
  <PageShot
    src="shots/page-filled.png"
    caption="One click fills the whole application"
    sub="Green means filled and verified. Amber means check me. Undo restores everything."
  />
);

export const Screenshot3: React.FC = () => (
  <PageShot
    src="shots/page-filled-pill.png"
    caption="Your resume attaches itself — the real file, every time"
    sub="Nothing is ever submitted for you. You review, you send."
  />
);

export const Screenshot4: React.FC = () => (
  <PanelShot
    src="shots/panel-apps.png"
    caption="Track every application"
    points={[
      "Statuses from Saved to Offer",
      "Follow-up reminders",
      "Job descriptions saved forever",
      "Search and CSV export",
    ]}
  />
);

export const Screenshot5: React.FC = () => (
  <PanelShot
    src="shots/panel-settings.png"
    caption="No account. No cloud."
    points={[
      "Your profile lives on your device",
      "Nothing is transmitted, ever",
      "Optional passphrase encryption",
      "Open source on GitHub",
    ]}
  />
);

/** YouTube thumbnail — 1280×720: one huge message, high contrast. */
export const Thumbnail: React.FC = () => (
  <Frame>
    <div style={{ display: "flex", height: "100%", alignItems: "center", padding: "0 70px", gap: 56 }}>
      <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Stamp size={72} />
          <Wordmark size={56} />
        </div>
        <div style={{ fontSize: 92, fontWeight: 800, color: C.ink, lineHeight: 1.02, letterSpacing: "-0.03em" }}>
          Job applications,
          <br />
          <span style={{ color: C.stamp }}>filled in 1 click</span>
        </div>
        <div
          style={{
            alignSelf: "flex-start",
            background: C.good,
            color: "#fff",
            fontSize: 34,
            fontWeight: 800,
            borderRadius: 14,
            padding: "12px 26px",
          }}
        >
          FREE · NO ACCOUNT
        </div>
      </div>
      <div
        style={{
          width: 430,
          height: 560,
          borderRadius: 20,
          overflow: "hidden",
          border: `3px solid ${C.line}`,
          boxShadow: "0 30px 90px rgba(27,37,46,0.25)",
          background: "#fff",
          flex: "none",
          rotate: "2.5deg",
        }}
      >
        <Img
          src={staticFile("shots/page-filled.png")}
          style={{ width: "200%", height: "200%", objectFit: "cover", objectPosition: "0% 0%" }}
        />
      </div>
    </div>
  </Frame>
);

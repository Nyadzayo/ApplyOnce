import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "./theme";
import { Stamp, Wordmark } from "./Stamp";

// ApplyOnce 0.2 release story for LinkedIn (1080x1350, 30 fps, 43 s).
// One message per scene, centred column layouts, text at video sizes.

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const overshoot = Easing.bezier(0.34, 1.4, 0.64, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const W = 1080;
const PAD = 84;

// fades a scene in over 12 frames and out over its last 12 frames
const Scene: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const f = useCurrentFrame();
  const opacity =
    interpolate(f, [0, 12], [0, 1], clamp) * interpolate(f, [duration - 12, duration], [1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        opacity,
        background: `radial-gradient(1100px 900px at 50% 28%, ${C.stampWash} 0%, ${C.paper} 62%)`,
        fontFamily: FONT,
        color: C.ink,
        padding: `110px ${PAD}px`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const rise = (f: number, from: number, len = 18) => ({
  opacity: interpolate(f, [from, from + len], [0, 1], { ...clamp, easing: ease }),
  translate: `0px ${interpolate(f, [from, from + len], [28, 0], { ...clamp, easing: ease })}px`,
});

const Headline: React.FC<{ from: number; children: React.ReactNode; size?: number; color?: string }> = ({
  from,
  children,
  size = 84,
  color = C.ink,
}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        ...rise(f, from),
        fontSize: size,
        lineHeight: 1.08,
        fontWeight: 800,
        letterSpacing: "-0.02em",
        textAlign: "center",
        color,
        maxWidth: W - 2 * PAD,
      }}
    >
      {children}
    </div>
  );
};

const Sub: React.FC<{ from: number; children: React.ReactNode; color?: string }> = ({ from, children, color = C.muted }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ ...rise(f, from), fontSize: 44, lineHeight: 1.25, fontWeight: 600, textAlign: "center", color, maxWidth: W - 2 * PAD }}>
      {children}
    </div>
  );
};

const Brand: React.FC = () => (
  <div style={{ position: "absolute", top: 64, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 18, alignItems: "center" }}>
    <Stamp size={54} />
    <Wordmark size={40} />
  </div>
);

// ---------------------------------------------------------------- scenes

const Hook: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  return (
    <Scene duration={duration}>
      <Brand />
      <div style={{ display: "flex", flexDirection: "column", gap: 40, alignItems: "center" }}>
        <Headline from={8}>Your resume has a text layer.</Headline>
        <Headline from={50} color={C.stamp}>
          Or does it?
        </Headline>
        <div style={{ ...rise(f, 80), fontSize: 32, color: C.faint, fontWeight: 600 }}>ApplyOnce 0.2, the story</div>
      </div>
    </Scene>
  );
};

const Doc: React.FC<{ index: number; fail: number }> = ({ index, fail }) => {
  const f = useCurrentFrame();
  const inAt = 20 + index * 6;
  const scale = interpolate(f, [inAt, inAt + 14], [0.6, 1], { ...clamp, easing: overshoot });
  const opacity = interpolate(f, [inAt, inAt + 8], [0, 1], clamp);
  const failed = f >= fail;
  const shake = failed ? interpolate(f, [fail, fail + 10], [6, 0], clamp) * Math.sin((f - fail) * 2.2) : 0;
  return (
    <div style={{ opacity, scale, translate: `${shake}px 0px`, width: 150, height: 196, borderRadius: 16, background: C.card, border: `3px solid ${failed ? "#c0392b" : C.lineStrong}`, boxShadow: "0 10px 30px rgba(0,43,75,0.10)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
      {failed ? (
        <div style={{ fontSize: 30, fontWeight: 800, color: "#c0392b", textAlign: "center", lineHeight: 1.1 }}>
          0<br />words
        </div>
      ) : (
        [0, 1, 2, 3].map((i) => <div key={i} style={{ width: 90 - i * 12, height: 10, borderRadius: 5, background: C.line }} />)
      )}
    </div>
  );
};

const Discovery: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  return (
    <Scene duration={duration}>
      <div style={{ display: "flex", flexDirection: "column", gap: 56, alignItems: "center" }}>
        <Headline from={4} size={72}>We pulled 8 random resumes from a public dataset.</Headline>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 150px)", gap: 28 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Doc key={i} index={i} fail={90 + i * 7} />
          ))}
        </div>
        <Sub from={150} color="#c0392b">
          All eight came back empty. Zero words.
        </Sub>
        <div style={{ ...rise(f, 175), fontSize: 32, color: C.faint, fontWeight: 600, textAlign: "center" }}>
          They were scans. Pictures of resumes. No parser can read a picture.
        </div>
      </div>
    </Scene>
  );
};

const Chip: React.FC<{ label: string; index: number }> = ({ label, index }) => {
  const f = useCurrentFrame();
  const at = 30 + index * 9;
  return (
    <div style={{ opacity: interpolate(f, [at, at + 10], [0, 1], clamp), scale: interpolate(f, [at, at + 16], [0.7, 1], { ...clamp, easing: overshoot }), fontSize: 40, fontWeight: 700, color: C.stampDeep, background: C.card, border: `3px solid ${C.stamp}`, borderRadius: 999, padding: "18px 38px", boxShadow: "0 8px 24px rgba(0,43,75,0.10)" }}>
      {label}
    </div>
  );
};

const Pool: React.FC<{ duration: number }> = ({ duration }) => (
  <Scene duration={duration}>
    <div style={{ display: "flex", flexDirection: "column", gap: 60, alignItems: "center" }}>
      <Headline from={4}>Because nobody uploads a clean PDF.</Headline>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 22, maxWidth: W - 2 * PAD }}>
        {["LaTeX", "Word tables", "Canva sidebars", "LinkedIn exports", "Europass", "Phone photos", "Scans"].map((l, i) => (
          <Chip key={l} label={l} index={i} />
        ))}
      </div>
      <Sub from={110}>Every layout hides the same facts in a different place.</Sub>
    </div>
  </Scene>
);

// a document mockup whose structure lights up: headings, columns, cells
const LineModel: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const glow = (at: number) => interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: ease });
  const bar = (w: number, at: number, strong = false) => (
    <div style={{ height: strong ? 18 : 12, width: w, borderRadius: 6, background: strong ? `rgba(0,101,173,${0.25 + 0.75 * glow(at)})` : C.line }} />
  );
  const scan = interpolate(f, [130, 190], [0, 1], { ...clamp, easing: ease });
  return (
    <Scene duration={duration}>
      <div style={{ display: "flex", flexDirection: "column", gap: 44, alignItems: "center" }}>
        <Headline from={4} size={72}>0.2 reads the layout, not just the words.</Headline>
        <div style={{ ...rise(f, 20), position: "relative", width: 640, height: 560, background: C.card, borderRadius: 22, border: `3px solid ${C.lineStrong}`, boxShadow: "0 18px 50px rgba(0,43,75,0.14)", padding: 36, display: "flex", flexDirection: "column", gap: 20, overflow: "hidden" }}>
          <div style={{ height: 30, width: 300, borderRadius: 8, background: `rgba(0,101,173,${0.25 + 0.75 * glow(40)})` }} />
          {bar(420, 0)}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {bar(240, 60, true)}
            <div style={{ fontSize: 24, fontWeight: 700, color: C.warn, opacity: glow(80), border: `3px solid ${C.warn}`, borderRadius: 8, padding: "2px 10px" }}>date cell</div>
          </div>
          {bar(520, 0)}
          {bar(480, 0)}
          <div style={{ display: "flex", gap: 40, marginTop: 8 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, borderRadius: 10, border: `3px dashed rgba(0,101,173,${glow(100)})`, padding: 12 }}>
              {bar(180, 0)}
              {bar(200, 0)}
              {bar(150, 0)}
            </div>
            <div style={{ flex: 1.4, display: "flex", flexDirection: "column", gap: 16, borderRadius: 10, border: `3px dashed rgba(0,101,173,${glow(100)})`, padding: 12 }}>
              {bar(260, 70, true)}
              {bar(300, 0)}
              {bar(280, 0)}
            </div>
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, top: `${scan * 100}%`, height: 6, background: C.stamp, opacity: f >= 130 && f <= 190 ? 0.9 : 0, boxShadow: `0 0 30px ${C.stamp}` }} />
        </div>
        <Sub from={135}>Bold headings, columns, date cells. And for scans and photos: text recognition on your device. Nothing uploaded.</Sub>
      </div>
    </Scene>
  );
};

const Stat: React.FC<{ at: number; big: string; label: string; from?: string; to?: string; digits?: number; value?: number }> = ({ at, big, label, value, digits = 3 }) => {
  const f = useCurrentFrame();
  const shown = value === undefined ? big : (interpolate(f, [at, at + 30], [0, value], { ...clamp, easing: ease })).toFixed(digits);
  return (
    <div style={{ ...rise(f, at), display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: C.card, border: `3px solid ${C.line}`, borderRadius: 24, padding: "26px 40px", width: W - 2 * PAD, boxShadow: "0 12px 34px rgba(0,43,75,0.10)" }}>
      <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: "-0.03em", color: C.stamp, lineHeight: 1 }}>{shown}</div>
      <div style={{ fontSize: 36, fontWeight: 600, color: C.muted, textAlign: "center" }}>{label}</div>
    </div>
  );
};

const Numbers: React.FC<{ duration: number }> = ({ duration }) => (
  <Scene duration={duration}>
    <div style={{ display: "flex", flexDirection: "column", gap: 34, alignItems: "center" }}>
      <Headline from={4} size={72}>Measured, not promised.</Headline>
      <Stat at={30} big="1.000" value={1} label="precision on 1,241 fields from 73 generated resumes, 11 layouts" />
      <Stat at={75} big="0.986" value={0.986} label="precision on scanned resumes, every value flagged for a look" />
      <Stat at={120} big="0.4%" label="wrong fills on real application questions, down from 3.7%" />
    </div>
  </Scene>
);

const Suggest: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const filled = f >= 70;
  const fill = interpolate(f, [70, 88], [0, 1], { ...clamp, easing: ease });
  return (
    <Scene duration={duration}>
      <div style={{ display: "flex", flexDirection: "column", gap: 52, alignItems: "center" }}>
        <Headline from={4} size={72}>New question? An on-device model suggests.</Headline>
        <div style={{ ...rise(f, 24), width: W - 2 * PAD, background: C.card, borderRadius: 24, border: `3px solid ${C.line}`, padding: 36, display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 18px 50px rgba(0,43,75,0.14)" }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: C.muted }}>Which country do you call home?</div>
          <div style={{ height: 88, borderRadius: 14, border: `4px solid ${filled ? C.warn : C.lineStrong}`, background: filled ? C.warnWash : C.paper, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px" }}>
            <div style={{ fontSize: 40, fontWeight: 700, color: C.ink, opacity: fill }}>South Africa</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.warn, opacity: fill, border: `3px solid ${C.warn}`, borderRadius: 999, padding: "6px 18px" }}>check this</div>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, color: C.faint, opacity: fill }}>Suggested by the on-device model. Amber, never silent.</div>
        </div>
        <Sub from={120}>The model runs on your computer. Your questions never leave it.</Sub>
      </div>
    </Scene>
  );
};

const Cta: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const stampScale = interpolate(f, [6, 28], [2.2, 1], { ...clamp, easing: overshoot });
  return (
    <Scene duration={duration}>
      <div style={{ display: "flex", flexDirection: "column", gap: 36, alignItems: "center" }}>
        <div style={{ scale: stampScale, opacity: interpolate(f, [6, 16], [0, 1], clamp) }}>
          <Stamp size={200} />
        </div>
        <div style={rise(f, 30)}>
          <Wordmark size={92} />
        </div>
        <Headline from={44} size={64}>0.2 is out.</Headline>
        <Sub from={60} color={C.ink}>You review. You submit. Data stays local.</Sub>
        <div style={{ ...rise(f, 84), fontSize: 32, fontWeight: 600, color: C.faint }}>Chrome Web Store and Firefox Add-ons. Free, open source.</div>
      </div>
    </Scene>
  );
};

// ---------------------------------------------------------------- timeline

const SCENES: [React.FC<{ duration: number }>, number][] = [
  [Hook, 105],
  [Discovery, 210],
  [Pool, 165],
  [LineModel, 225],
  [Numbers, 200],
  [Suggest, 195],
  [Cta, 190],
];
export const UPDATE02_FRAMES = SCENES.reduce((n, [, d]) => n + d, 0);

export const Update02: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {SCENES.map(([Comp, duration], i) => {
        const start = from;
        from += duration;
        return (
          <Sequence key={i} from={start} durationInFrames={duration}>
            <Comp duration={duration} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

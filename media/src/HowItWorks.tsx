import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Cta, Fill, Grind, Intro, Trust } from "./scenes";

// 26s @ 30fps = 780 frames.
// Intro 0–90 · Grind 90–210 · Fill 210–460 · Trust 460–660 · CTA 660–780.

export const HowItWorks: React.FC = () => (
  <AbsoluteFill>
    <Sequence durationInFrames={90}>
      <Intro />
    </Sequence>
    <Sequence from={90} durationInFrames={120}>
      <Grind />
    </Sequence>
    <Sequence from={210} durationInFrames={250}>
      <Fill />
    </Sequence>
    <Sequence from={460} durationInFrames={200}>
      <Trust />
    </Sequence>
    <Sequence from={660} durationInFrames={120}>
      <Cta />
    </Sequence>
  </AbsoluteFill>
);

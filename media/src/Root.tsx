import "./index.css";
import React from "react";
import { Composition, Still } from "remotion";
import { HowItWorks } from "./HowItWorks";
import { Marquee, OgCard, PromoTile, SmallTile, SquareCard } from "./cards";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HowItWorks"
        component={HowItWorks}
        durationInFrames={780}
        fps={30}
        width={1920}
        height={1080}
      />
      {/* Chrome Web Store assets */}
      <Still id="PromoTile" component={PromoTile} width={1280} height={800} />
      <Still id="SmallTile" component={SmallTile} width={440} height={280} />
      <Still id="Marquee" component={Marquee} width={1440} height={680} />
      {/* Social */}
      <Still id="SquareCard" component={SquareCard} width={1080} height={1080} />
      <Still id="OgCard" component={OgCard} width={1200} height={630} />
    </>
  );
};

/* eslint-disable @next/next/no-img-element -- original game talent, highlight and digit sprites */
import type { CSSProperties } from "react";
import nativeAssets from "../public/data/atlas-talents.json";

export type AtlasTalent = { name: string; level: number; image: string };
type Sprite = { image: string; width: number; height: number };
const assets: {
  talents: Record<string, { icon: Sprite; highlight: Sprite }>;
  digits: Record<string, Sprite>;
} = nativeAssets;

// Native CardUI: icon scale .4, green center (12, 12) relative to the
// icon's bottom-left, number center (icon.width, 8) inside the scaled icon.
// The child number's 1.5 scale combines with .4 to give .6. The 40px canvas
// only adds padding; every sprite keeps the client's relative scale/anchor.
function position(left: number, bottom: number, width: number, height: number): CSSProperties {
  return { left: `${left / 40 * 100}%`, bottom: `${bottom / 40 * 100}%`, width: `${width / 40 * 100}%`, height: `${height / 40 * 100}%` };
}

export default function AtlasTalents({ talents, selected }: { talents: AtlasTalent[]; selected: readonly string[] }) {
  if (!selected.length) return null;
  return <span className="atlas-talents" aria-label="才艺">
    {talents.filter((talent) => talent.level > 0).map((talent) => {
      const native = assets.talents[talent.name];
      if (!native) return null;
      const active = selected.includes(talent.name);
      const digits = String(talent.level).split("").map((digit) => assets.digits[digit]);
      const digitWidth = digits.reduce((sum, digit) => sum + digit.width * .6, 0);
      let digitLeft = 6 + native.icon.width * .4 - digitWidth / 2;
      const label = `${talent.name} ${talent.level}${active ? "，已筛选" : ""}`;
      return <span className="atlas-talent" key={talent.name} data-talent={talent.name} data-level={talent.level} data-highlighted={active} role="img" aria-label={label} title={label}>
        {active && <img className="atlas-talent-highlight" src={native.highlight.image} alt="" style={position(18 - native.highlight.width / 2, 19 - native.highlight.height / 2, native.highlight.width, native.highlight.height)} />}
        <img className="atlas-talent-icon" src={native.icon.image} alt="" style={position(6, 7, native.icon.width * .4, native.icon.height * .4)} />
        {digits.map((digit, index) => {
          const left = digitLeft;
          digitLeft += digit.width * .6;
          return <img className="atlas-talent-digit" src={digit.image} key={index} alt="" style={position(left, 10.2 - digit.height * .3, digit.width * .6, digit.height * .6)} />;
        })}
      </span>;
    })}
  </span>;
}

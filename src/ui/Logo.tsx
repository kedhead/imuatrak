import Svg, { Path, G, Circle } from "react-native-svg";
import { colors } from "./theme";

interface Props {
  size?: number;
  /** Color of the canoe + paddle mark. White reads well on gradients. */
  color?: string;
  /** Color of the wave beneath the canoe. */
  wave?: string;
}

/**
 * ImuaTrak brand mark: a forward-leaning outrigger canoe (wa'a) with its ama
 * riding a wave — "Imua" = move forward. Drawn on a 100×100 viewBox so it
 * scales cleanly from tab icon to splash screen.
 */
export function Logo({ size = 96, color = colors.white, wave = colors.seafoam }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <G>
        {/* Hull of the canoe */}
        <Path
          d="M16 46 C36 60, 64 60, 86 44 C70 56, 34 56, 16 46 Z"
          fill={color}
        />
        {/* Ama (outrigger float) */}
        <Path
          d="M22 66 C40 72, 60 72, 78 66 C62 70, 38 70, 22 66 Z"
          fill={color}
          opacity={0.85}
        />
        {/* Iako (connecting struts) */}
        <Path d="M38 53 L34 66" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        <Path d="M62 53 L66 66" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        {/* Paddle, raised forward */}
        <Path d="M58 18 L46 50" stroke={color} strokeWidth={3.2} strokeLinecap="round" />
        <Path
          d="M58 12 C64 14, 66 22, 60 26 C56 22, 55 16, 58 12 Z"
          fill={color}
        />
        {/* Wave crest */}
        <Path
          d="M10 80 C24 72, 30 88, 44 80 C58 72, 64 88, 78 80 C84 76, 90 78, 92 82"
          stroke={wave}
          strokeWidth={3.6}
          strokeLinecap="round"
          fill="none"
        />
        <Circle cx="50" cy="50" r="0" fill={color} />
      </G>
    </Svg>
  );
}

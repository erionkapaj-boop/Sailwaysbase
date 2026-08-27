import { colors, fontSerif } from "../../../lib/platform/theme";

// Placeholder mark standing in for the supplied logo draft, which wasn't
// included with the brief: helm wheel in navy with a sand-coloured hub,
// alongside the wordmark. Swap this file's SVG for the real asset when it
// arrives — nothing else references the artwork.
//
// "inline" is the small horizontal lockup for the header; "stacked" is the
// large centred one that anchors the home screen.
export function Mark({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7.25" stroke={colors.ink} strokeWidth="1.15" />
      <circle cx="12" cy="12" r="2.4" fill={colors.accent} />
      {[0, 45, 90, 135].map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="2.4"
          x2="12"
          y2="21.6"
          stroke={colors.ink}
          strokeWidth="1.15"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 12)`}
        />
      ))}
    </svg>
  );
}

export default function Logo({ variant = "inline" }) {
  if (variant === "stacked") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Mark size={52} />
        <span
          style={{
            fontFamily: fontSerif,
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: "0.005em",
            color: colors.ink,
            lineHeight: 1,
          }}
        >
          SkipperFinder
        </span>
      </div>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <Mark size={22} />
      <span
        style={{
          fontFamily: fontSerif,
          fontSize: 19,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: colors.ink,
          whiteSpace: "nowrap",
        }}
      >
        SkipperFinder
      </span>
    </span>
  );
}

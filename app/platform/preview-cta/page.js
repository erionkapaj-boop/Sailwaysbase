"use client";
import Logo from "../components/Logo";
import { container, colors, muted, radius, fontSans } from "../../../lib/platform/theme";

// Temporary: side-by-side CTA treatments so the lighter option can be picked
// by eye rather than guessed. Delete once chosen.
const base = {
  fontSize: 17,
  padding: "18px 40px",
  borderRadius: 12,
  fontFamily: fontSans,
  fontWeight: 500,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const VARIANTS = [
  {
    n: "A",
    name: "Τωρινό — γεμάτο navy",
    style: { ...base, background: colors.ink, color: "#fff", border: "1px solid transparent" },
  },
  {
    n: "B",
    name: "Περίγραμμα — διάφανο, navy γράμματα",
    style: { ...base, background: "transparent", color: colors.ink, border: `1px solid ${colors.ink}` },
  },
  {
    n: "C",
    name: "Λευκό με λεπτή σκιά",
    style: {
      ...base,
      background: "#fff",
      color: colors.ink,
      border: `1px solid ${colors.border}`,
      boxShadow: "0 1px 2px rgba(22,40,60,0.04), 0 6px 18px rgba(22,40,60,0.06)",
    },
  },
  {
    n: "D",
    name: "Sand accent",
    style: { ...base, background: colors.accent, color: "#1E1608", border: "1px solid transparent" },
  },
];

export default function PreviewCta() {
  return (
    <div style={{ ...container, maxWidth: 680 }}>
      <p style={{ ...muted, textAlign: "center", marginBottom: 8 }}>
        Προσωρινή σελίδα σύγκρισης — διάλεξε γράμμα
      </p>

      {VARIANTS.map((v) => (
        <div
          key={v.n}
          style={{
            textAlign: "center",
            padding: "40px 0",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ marginBottom: 28, opacity: 0.9 }}>
            <Logo variant="stacked" />
          </div>
          <button type="button" style={v.style}>
            Αναζήτηση Πληρώματος
          </button>
          <p style={{ ...muted, fontSize: 13, marginTop: 18 }}>
            <b style={{ color: colors.ink }}>{v.n}</b> — {v.name}
          </p>
        </div>
      ))}
    </div>
  );
}

// Shared inline-style tokens for the /platform section only.
// Kept separate from components/App.jsx's own styling on purpose.
// Minimal, near-monochrome palette — a single dark "ink" accent instead of
// a bright brand color, muted badge tones, restrained radius/shadows.

export const colors = {
  bg: "#FAFAFA",
  card: "#FFFFFF",
  ink: "#18181B",
  inkSoft: "#71717A",
  brand: "#18181B",
  brandDark: "#000000",
  border: "#E4E4E7",
  danger: "#B42318",
  success: "#15803D",
  warn: "#B45309",
};

export const page = {
  minHeight: "100vh",
  background: colors.bg,
  color: colors.ink,
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
};

export const container = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "24px 16px 64px",
};

export const card = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  padding: 18,
  marginBottom: 14,
};

export const h1 = { fontSize: 26, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" };
export const h2 = { fontSize: 18, fontWeight: 700, margin: "0 0 10px", letterSpacing: "-0.01em" };
export const muted = { color: colors.inkSoft, fontSize: 14 };

export const button = (variant = "primary") => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "9px 16px",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  border: variant === "primary" ? "none" : `1px solid ${colors.border}`,
  background: variant === "primary" ? colors.ink : variant === "danger" ? "#FBEAE8" : "#fff",
  color: variant === "primary" ? "#fff" : variant === "danger" ? colors.danger : colors.ink,
});

export const input = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  fontSize: 14,
  boxSizing: "border-box",
};

export const label = { fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" };

export const badge = (tone = "neutral") => {
  const tones = {
    neutral: { bg: "#F4F4F5", fg: colors.inkSoft },
    brand: { bg: "#F0F0F1", fg: colors.ink },
    success: { bg: "#EAF7EF", fg: colors.success },
    warn: { bg: "#FCF1E3", fg: colors.warn },
    danger: { bg: "#FBEAE8", fg: colors.danger },
  };
  const t = tones[tone] || tones.neutral;
  return {
    display: "inline-block",
    fontSize: 12,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    background: t.bg,
    color: t.fg,
  };
};

export const nav = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  padding: "12px 16px",
  borderBottom: `1px solid ${colors.border}`,
  background: colors.card,
  position: "sticky",
  top: 0,
  zIndex: 10,
};

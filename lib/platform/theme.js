// Shared inline-style tokens for the /platform section only.
// Kept separate from components/App.jsx's own styling on purpose.

export const colors = {
  bg: "#F6F8FA",
  card: "#FFFFFF",
  ink: "#0E2A3D",
  inkSoft: "#5A7080",
  brand: "#0B6E8C",
  brandDark: "#084F63",
  border: "#E1E8ED",
  danger: "#C0392B",
  success: "#1E8A5B",
  warn: "#B8860B",
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
  borderRadius: 12,
  padding: 18,
  marginBottom: 14,
};

export const h1 = { fontSize: 26, fontWeight: 700, margin: "0 0 6px" };
export const h2 = { fontSize: 19, fontWeight: 700, margin: "0 0 10px" };
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
  background:
    variant === "primary" ? colors.brand : variant === "danger" ? "#FDECEA" : "#fff",
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
    neutral: { bg: "#EEF2F5", fg: colors.inkSoft },
    brand: { bg: "#E4F3F7", fg: colors.brandDark },
    success: { bg: "#E5F6EE", fg: colors.success },
    warn: { bg: "#FBF1DD", fg: colors.warn },
    danger: { bg: "#FDECEA", fg: colors.danger },
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
  padding: "14px 16px",
  borderBottom: `1px solid ${colors.border}`,
  background: colors.card,
  position: "sticky",
  top: 0,
  zIndex: 10,
};

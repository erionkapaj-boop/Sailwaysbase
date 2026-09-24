"use client";
import { colors, fontSans } from "../../../lib/platform/theme";

// Φωτογραφία αν υπάρχει· αλλιώς τα αρχικά του ονόματος· αλλιώς (ανώνυμο
// προφίλ πριν την κράτηση) μια ήσυχη σιλουέτα. Ποτέ άδειος γκρι κύκλος.
function initials(name) {
  const parts = (name || "")
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  // Κεφαλαία χωρίς τόνους, όπως γράφονται στα ελληνικά («ΑΡ», όχι «ΆΡ»).
  return (first + last).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

export default function Avatar({ src, name, size = 40, style }) {
  const base = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    display: "block",
    ...style,
  };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={{ ...base, objectFit: "cover" }} />;
  }
  const text = initials(name);
  return (
    <span
      aria-hidden="true"
      style={{
        ...base,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#E9EEF0",
        color: colors.ink,
        fontFamily: fontSans,
        fontSize: Math.round(size * 0.36),
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {text || (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8.5" r="4" fill={colors.inkSoft} opacity="0.45" />
          <path d="M4 20.5c1.4-3.6 4.5-5.5 8-5.5s6.6 1.9 8 5.5" fill={colors.inkSoft} opacity="0.45" />
        </svg>
      )}
    </span>
  );
}

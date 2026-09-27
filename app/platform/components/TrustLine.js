import { muted, money, colors } from "../../../lib/platform/theme";

// Αξιοπιστία και ανταπόκριση ενός επαγγελματία, τη στιγμή που τον διαλέγεις.
// Ό,τι δεν έχει ακόμα αρκετό ιστορικό απλώς δεν εμφανίζεται.
export default function TrustLine({ s }) {
  const parts = [];
  if (s?.reliability_percentage != null) parts.push([s.reliability_percentage, "αξιοπιστία"]);
  if (s?.response_percentage != null) parts.push([s.response_percentage, "ανταπόκριση"]);
  if (!parts.length) return null;
  return (
    <div style={{ ...muted, fontSize: 12.5 }}>
      {parts.map(([value, label], i) => (
        <span key={label}>
          {i > 0 && " · "}
          <span style={{ ...money, color: colors.ink }}>{value}%</span> {label}
        </span>
      ))}
    </div>
  );
}

import Icon from "./Icon";
import { badge } from "../../../lib/platform/theme";

// Σήμα κατάστασης: χρώμα ΚΑΙ εικονίδιο (όχι μόνο χρώμα), ώστε η κατάσταση να
// διαβάζεται με μια ματιά και χωρίς να βασίζεται στην όραση χρωμάτων.
const TONE_ICON = { success: "check", warn: "clock", danger: "x", brand: "clock", neutral: "info" };

export default function StatusPill({ tone = "neutral", children }) {
  return (
    <span style={{ ...badge(tone), display: "inline-flex", alignItems: "center", gap: 5 }}>
      <Icon name={TONE_ICON[tone] || "info"} size={13} stroke={2.2} />
      {children}
    </span>
  );
}

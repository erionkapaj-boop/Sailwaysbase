"use client";
import { muted, money } from "../../../lib/platform/theme";

// A single figure with its label. Numbers use the mono `money` token so every
// price/percentage/count across the app reads like the same receipt line.
export default function Stat({ label, value }) {
  return (
    <div>
      <div style={{ ...muted, fontSize: 13 }}>{label}</div>
      <div style={{ ...money, fontSize: 24, fontWeight: 500, marginTop: 4 }}>{value}</div>
    </div>
  );
}

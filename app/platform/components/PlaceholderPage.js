import { container, h1, muted } from "../../../lib/platform/theme";

// Shared shell for routes that exist only so links aren't broken. Real
// content for each lands in its own step.
export default function PlaceholderPage({ title, note }) {
  return (
    <div style={{ ...container, maxWidth: 680 }}>
      <div style={{ padding: "48px 0" }}>
        <h1 style={h1}>{title}</h1>
        <p style={{ ...muted, lineHeight: 1.6 }}>{note}</p>
      </div>
    </div>
  );
}

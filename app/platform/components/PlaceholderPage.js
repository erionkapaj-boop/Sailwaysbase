"use client";
import { useRouter } from "next/navigation";
import BackButton from "./BackButton";
import { container, h1, muted } from "../../../lib/platform/theme";

// Shared shell for routes that exist only so links aren't broken. Real
// content for each lands in its own step.
export default function PlaceholderPage({ title, note }) {
  const router = useRouter();
  return (
    <div style={{ ...container, maxWidth: 680 }}>
      <div style={{ padding: "24px 0 0" }}>
        {/* router.back() rather than a fixed href: these routes sit behind
            the footer on every page, so "back" has to mean wherever the
            visitor actually came from, not one hardcoded destination. */}
        <BackButton onClick={() => router.back()} />
        <h1 style={{ ...h1, marginTop: 20 }}>{title}</h1>
        <p style={{ ...muted, lineHeight: 1.6 }}>{note}</p>
      </div>
    </div>
  );
}

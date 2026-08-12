"use client";
import { useState } from "react";
import Link from "next/link";
import CrewSearchFlow from "./CrewSearchFlow";
import { button, colors, muted } from "../../lib/platform/theme";

// The first screen shows only the CTA and the secondary link (brief §4) —
// no form, no dropdowns, no tagline. The form appears only after the CTA is
// pressed, and then one step at a time.
export default function HomeEntry() {
  const [started, setStarted] = useState(false);

  if (started) return <CrewSearchFlow onCancel={() => setStarted(false)} />;

  return (
    <div style={{ textAlign: "center" }}>
      <button
        type="button"
        onClick={() => setStarted(true)}
        style={{
          ...button("primary"),
          fontSize: 17,
          padding: "18px 40px",
          borderRadius: 12,
        }}
      >
        Αναζήτηση Πληρώματος
      </button>

      <div style={{ marginTop: 22 }}>
        <Link
          href="/platform/delivery"
          style={{ ...muted, fontSize: 14, color: colors.inkSoft, textDecoration: "none" }}
        >
          Μεταφορά Σκάφους →
        </Link>
      </div>

      {/* The page speaks to clients; this is the one quiet door for the other
          side. Deliberately far below the CTA, smaller than the delivery link,
          and only here — a visitor passing through an interior page isn't the
          audience for it. It also disappears once the search flow starts. */}
      <div style={{ marginTop: 72 }}>
        <Link
          href="/platform/professionals"
          style={{ fontSize: 13, color: colors.inkSoft, textDecoration: "none", opacity: 0.85 }}
        >
          Είσαι skipper, hostess, cook ή ναύτης; Κάνε εγγραφή →
        </Link>
      </div>
    </div>
  );
}

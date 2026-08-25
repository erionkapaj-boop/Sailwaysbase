"use client";
import { useEffect, useState } from "react";
import { getMyPendingReviewCount } from "../../../lib/platform/db";
import { colors, muted } from "../../../lib/platform/theme";

// A completed charter's review prompt used to live only inside a collapsed
// booking row — easy to never notice, easy to forget. This sits at the top
// of the dashboard, above everything else, for as long as any completed
// booking is still waiting on your review. Re-fetched on every mount rather
// than cached, since the count only ever changes.
export default function PendingReviewBanner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    getMyPendingReviewCount().then(setCount).catch(() => {});
  }, []);

  if (!count) return null;

  return (
    <div
      style={{
        marginBottom: 18,
        padding: "12px 16px",
        borderRadius: 10,
        border: `1px solid ${colors.warn}`,
        background: "#FBF6EC",
      }}
    >
      <b style={{ fontSize: 14, fontWeight: 600 }}>
        {count === 1
          ? "Ένας ναύλος ολοκληρώθηκε και περιμένει την αξιολόγησή σου."
          : `${count} ναύλα ολοκληρώθηκαν και περιμένουν την αξιολόγησή σου.`}
      </b>
      <p style={{ ...muted, fontSize: 13, margin: "4px 0 0" }}>
        Άνοιξε την κράτηση παρακάτω, στις «Κρατήσεις», για να την αφήσεις.
      </p>
    </div>
  );
}

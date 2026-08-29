"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getMyPendingReviewCount } from "../../../lib/platform/db";
import { colors, muted } from "../../../lib/platform/theme";

// A completed charter's review prompt used to live only inside a collapsed
// booking row — easy to never notice, easy to forget. This sits at the top
// of the dashboard, above everything else, for as long as any completed
// booking is still waiting on your review. Re-fetched on every mount rather
// than cached, since the count only ever changes.
//
// bookingsHref points at wherever "Κρατήσεις" actually lives for the caller
// (it moved out of the dashboard onto its own page) — without it the banner
// would tell someone to look "below" on a page that no longer has bookings
// on it at all.
export default function PendingReviewBanner({ bookingsHref }) {
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
        Άνοιξε την κράτηση στις{" "}
        {bookingsHref ? (
          <Link href={bookingsHref} style={{ color: colors.accent }}>
            «Κρατήσεις»
          </Link>
        ) : (
          "«Κρατήσεις»"
        )}{" "}
        για να την αφήσεις.
      </p>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useAuth } from "../AuthContext";
import { getMyRequestDraft, getMyPendingCreditPurchase } from "../../../lib/platform/db";
import { hasPendingBroadcast } from "../../../lib/platform/pendingBroadcast";
import { labelForRole } from "../../../lib/platform/roles";
import { card, colors, muted } from "../../../lib/platform/theme";

// Αίτημα που ξεκίνησε και δεν ολοκληρώθηκε (0122): μία ήσυχη γραμμή που
// οδηγεί πίσω στη σελίδα του, με τις επιλογές στη θέση τους. Από όποια
// συσκευή κι αν ξεκίνησε. Όταν οι επιλογές περιμένουν ακόμα στη συσκευή
// (πριν την έγκριση λογαριασμού), τις δείχνει το PendingReadyBanner.
export default function RequestDraftLine({ style }) {
  const t = useTranslations("RequestDraftLine");
  const fmt = useFormat();
  const { session, viewingAs } = useAuth();
  const [draft, setDraft] = useState(null);
  const [waitingCredits, setWaitingCredits] = useState(false);

  useEffect(() => {
    if (!session || viewingAs || hasPendingBroadcast()) return setDraft(null);
    let alive = true;
    getMyRequestDraft()
      .then(async (d) => {
        const today = new Date().toISOString().slice(0, 10);
        const roles = Object.keys(d?.selections || {});
        if (!alive || !d?.filters?.startDate || d.filters.startDate < today || roles.length === 0) return;
        setDraft(d);
        const purchase = await getMyPendingCreditPurchase().catch(() => null);
        if (alive) setWaitingCredits(Boolean(purchase));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session, viewingAs]);

  if (!draft) return null;
  const f = draft.filters || {};
  const summary = [
    Object.keys(draft.selections).map(labelForRole).join(", "),
    fmt.dateRange(f.startDate, f.endDate),
    f.departurePoint,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href="/platform/search"
      data-request-draft
      style={{
        ...card,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        textDecoration: "none",
        color: colors.ink,
        marginBottom: 24,
        ...style,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <b style={{ fontWeight: 600 }}>{t("title")}</b>
        <span style={{ ...muted, display: "block", fontSize: 13, marginTop: 2 }}>{summary}</span>
        <span style={{ display: "block", fontSize: 13, marginTop: 2, color: waitingCredits ? colors.warn : colors.inkSoft }}>
          {waitingCredits ? t("waitingCredits") : t("notSent")}
        </span>
      </span>
      <span style={{ fontSize: 13.5, whiteSpace: "nowrap" }}>{t("continue")}</span>
    </Link>
  );
}

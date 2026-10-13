"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import { hasPendingBroadcast } from "../../../lib/platform/pendingBroadcast";
import { hasPendingDelivery } from "../../../lib/platform/pendingDelivery";
import { card, muted, button, colors } from "../../../lib/platform/theme";

// Picks saved while the account waited for approval only resurfaced on the
// next login — someone already signed in when approval landed saw an empty
// Αιτήματα list and no sign their choices were still waiting. localStorage
// is read in an effect so server and first client render agree.
export default function PendingReadyBanner() {
  const t = useTranslations("PendingReadyBanner");
  const { session, userRow } = useAuth();
  const [href, setHref] = useState(null);

  useEffect(() => {
    if (!session || !userRow?.phone_verified_at) return setHref(null);
    if (hasPendingBroadcast()) setHref("/platform/search");
    else if (hasPendingDelivery()) setHref("/platform/delivery");
    else setHref(null);
  }, [session, userRow?.phone_verified_at]);

  if (!href) return null;
  return (
    <div style={{ ...card, borderLeft: `3px solid ${colors.accent}`, textAlign: "left", marginBottom: 24 }}>
      <b style={{ fontWeight: 600 }}>{t("title")}</b>
      <p style={{ ...muted, margin: "6px 0 12px" }}>
        {t("body")}
      </p>
      <Link href={href} style={{ ...button("primary"), textDecoration: "none", display: "inline-block" }}>
        {t("continue")}
      </Link>
    </div>
  );
}

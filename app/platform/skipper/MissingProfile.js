"use client";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createMissingProfile } from "../../../lib/platform/db";
import { container, card, h1, muted, button, colors } from "../../../lib/platform/theme";

// Its own module rather than a named export from the dashboard's page.js:
// the profile and wallet pages both need it, and importing from that page
// dragged the entire dashboard — calendar, booking panels, pings inbox —
// into their bundles for the sake of one error card.
export default function MissingProfile({ refresh, loadError, isAdmin = false }) {
  const t = useTranslations("MissingProfile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // A failed read is a different problem from a genuinely absent row —
  // creating a second profile would not fix it and may not even be possible.
  if (loadError) {
    return (
      <div style={container}>
        <h1 style={h1}>{t("dashboard")}</h1>
        <div style={{ ...card, borderColor: colors.danger }}>
          <b>{t("loadFailed")}</b>
          
          <button style={button("secondary")} onClick={refresh}>
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  async function recreate() {
    setBusy(true);
    setError("");
    try {
      await createMissingProfile("skipper");
      await refresh();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  // Two different people land here for two different reasons. A skipper
  // account without a profile row is a bug — the row should have been
  // created at registration and wasn't. An admin without one hasn't done
  // anything wrong; they just haven't opted into a professional profile
  // yet, which is a normal starting state, not an error to explain away.
  return (
    <div style={container}>
      <h1 style={h1}>{isAdmin ? t("professionalProfile") : t("dashboard")}</h1>
      <div style={{ ...card, borderColor: isAdmin ? colors.border : colors.danger }}>
        {isAdmin ? (
          <>
            <b>{t("adminNone")}</b>
            <p style={muted}>
              {t("adminBody")}
            </p>
          </>
        ) : (
          <>
            <b>{t("notFound")}</b>
            <p style={muted}>
              {t("pressToCreate")}
            </p>
          </>
        )}
        <button style={button("primary")} disabled={busy} onClick={recreate}>
          {busy ? "..." : t("create")}
        </button>
        {error && <p style={{ color: colors.danger, marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}

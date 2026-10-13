"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { displayName } from "../../lib/platform/names";
import { useAuth } from "./AuthContext";
import CrewSearchFlow from "./CrewSearchFlow";
import Logo from "./components/Logo";
import HomeAppsMenu from "./components/HomeAppsMenu";
import PendingReadyBanner from "./components/PendingReadyBanner";
import RequestDraftLine from "./components/RequestDraftLine";
import { adminOverview } from "../../lib/platform/db";
import { card, tapTarget } from "../../lib/platform/theme";
import { button, colors, muted, h2 } from "../../lib/platform/theme";

// The first screen shows only the CTA and the secondary link (brief §4) —
// no form, no dropdowns, no tagline. The form appears only after the CTA is
// pressed, and then one step at a time.
// An admin who lands here (e.g. from the logo) sees the way back to the
// console and whether anything is waiting — otherwise this page, built for
// clients, gives no hint that the admin side exists at all.
function AdminHomeBanner() {
  const t = useTranslations("HomeEntry");
  const { isAdmin } = useAuth();
  const [waiting, setWaiting] = useState(null);
  useEffect(() => {
    if (!isAdmin) return;
    adminOverview()
      .then((c) =>
        setWaiting(
          ["pending_verification", "pending_approvals", "pending_secondary_roles", "coverage_needed", "contact_new", "open_disputes"]
            .reduce((n, k) => n + (Number(c?.[k]) || 0), 0)
        )
      )
      .catch(() => setWaiting(0));
  }, [isAdmin]);
  if (!isAdmin) return null;
  return (
    <Link
      href="/platform/admin"
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
      }}
    >
      <span>
        <b style={{ fontWeight: 600 }}>{t("adminTitle")}</b>
        <span style={{ ...muted, display: "block", fontSize: 13, marginTop: 2 }}>
          {waiting == null ? "…" : waiting === 0 ? t("adminNothing") : t("adminWaiting", { count: waiting })}
        </span>
      </span>
      <span style={{ fontSize: 18 }}>›</span>
    </Link>
  );
}

export default function HomeEntry() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const { session, userRow } = useAuth();
  const [started, setStarted] = useState(false);

  // Set once, right after set-pin, for a brand-new client with nothing else
  // waiting (search/delivery picks take them straight to those pages
  // instead — see set-pin/page.js). Found in a usability pass: without
  // this, a fresh signup landed on an empty "Αιτήματα" list with no
  // explanation of what to do next.
  //
  // Read into state once, at mount, rather than straight off params on every
  // render: the URL is stripped (below) right after, and params.get would
  // then immediately go back to null, flashing the banner away the instant
  // it appeared.
  const [welcome] = useState(() => params.get("welcome") === "1");
  const firstName = displayName(userRow, locale).trim().split(/\s+/)[0] || "";
  useEffect(() => {
    if (welcome) router.replace("/platform");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening the wizard used to be pure component state — nothing on this
  // one /platform URL ever changed, so the device's own back button/gesture
  // had no idea the wizard was open and would leave the page entirely on
  // the first press instead of just closing it. Pushing a history entry
  // here gives the wizard (and its own per-step entries, see
  // CrewSearchFlow) something real to step back through.
  useEffect(() => {
    function onPopState(e) {
      setStarted(Boolean(e.state?.sfWizardOpen));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function openWizard() {
    window.history.pushState({ sfWizardOpen: true, sfStep: 0 }, "");
    setStarted(true);
  }

  if (started) return <CrewSearchFlow />;

  const pill = { borderRadius: 999, padding: "16px 36px", fontSize: 17, fontWeight: 500, minHeight: 56, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" };

  return (
    <div style={{ textAlign: "center" }}>
      {/* Signed in, the header belongs to the account, so the dots sit here. */}
      {session && (
        <div style={{ position: "absolute", top: 10, left: 12 }}>
          <HomeAppsMenu />
        </div>
      )}

      <div style={{ marginBottom: 40 }}>
        <Logo variant="stacked" />
        <p style={{ fontSize: 17, color: colors.ink, margin: "14px auto 0", maxWidth: 340, lineHeight: 1.5 }}>{t("tagline")}</p>
      </div>

      {welcome && firstName && (
        <div style={{ marginBottom: 36 }}>
          <p style={{ ...h2, fontSize: 21, margin: "0 0 6px" }}>{t("welcomeTitle", { name: firstName })}</p>
          <p style={muted}>{t("welcomeSubtitle")}</p>
        </div>
      )}

      <AdminHomeBanner />
      <PendingReadyBanner />
      <RequestDraftLine />

      <button type="button" onClick={openWizard} style={{ ...button("primary"), ...pill, width: "100%", maxWidth: 380 }}>
        {t("searchCrew")}
      </button>

      <div style={{ marginTop: 44 }}>
        <p style={{ ...muted, fontSize: 14, margin: "0 0 4px" }}>{t("otherInMind")}</p>
        <Link href="/platform/experiences" style={{ ...tapTarget, fontSize: 17, fontWeight: 500, color: colors.ink, textDecoration: "none" }}>
          {t("discoverExperiences")}
        </Link>
      </div>

      {/* The one quiet door for the other side. Signed in, a client goes pro
          from their own profile, never through a second sign-up. */}
      {!session && (
        <div style={{ marginTop: 96 }}>
          <p style={{ ...muted, fontSize: 14, margin: "0 0 12px" }}>{t("areYouPro")}</p>
          <Link href="/platform/professionals" style={{ ...button("secondary"), ...pill, fontSize: 16, minHeight: 48, padding: "12px 28px", borderColor: colors.ink }}>
            {t("createProfile")}
          </Link>
        </div>
      )}
    </div>
  );
}

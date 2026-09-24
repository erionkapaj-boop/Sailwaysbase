"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "./AuthContext";
import CrewSearchFlow from "./CrewSearchFlow";
import Logo from "./components/Logo";
import PendingReadyBanner from "./components/PendingReadyBanner";
import { adminOverview } from "../../lib/platform/db";
import { card } from "../../lib/platform/theme";
import { button, colors, muted, h2 } from "../../lib/platform/theme";

// The first screen shows only the CTA and the secondary link (brief §4) —
// no form, no dropdowns, no tagline. The form appears only after the CTA is
// pressed, and then one step at a time.
// An admin who lands here (e.g. from the logo) sees the way back to the
// console and whether anything is waiting — otherwise this page, built for
// clients, gives no hint that the admin side exists at all.
function AdminHomeBanner() {
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
        <b style={{ fontWeight: 600 }}>Διαχείριση</b>
        <span style={{ ...muted, display: "block", fontSize: 13, marginTop: 2 }}>
          {waiting == null ? "…" : waiting === 0 ? "Τίποτα δεν περιμένει εσένα." : `${waiting} περιμένουν εσένα.`}
        </span>
      </span>
      <span style={{ fontSize: 18 }}>›</span>
    </Link>
  );
}

export default function HomeEntry() {
  const t = useTranslations("Home");
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
  const firstName = userRow?.full_name?.trim().split(/\s+/)[0] || "";
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

  return (
    <div style={{ textAlign: "center" }}>
      {/* Brand sits centred above the action, filling what was dead space —
          the header drops its own mark on this route so there's no double. */}
      <div style={{ marginBottom: 44 }}>
        <Logo variant="stacked" />
      </div>

      {welcome && firstName && (
        <div style={{ marginBottom: 36 }}>
          <p style={{ ...h2, fontSize: 21, margin: "0 0 6px" }}>{t("welcomeTitle", { name: firstName })}</p>
          <p style={muted}>{t("welcomeSubtitle")}</p>
        </div>
      )}

      <AdminHomeBanner />
      <PendingReadyBanner />

      {/* Outline rather than filled: lighter against the warm page, closer to
          the "spare, premium" direction. Hover/active fills it so it still
          reads as pressable — see .sf-cta in PlatformShell's style block. */}
      <button
        type="button"
        className="sf-cta"
        onClick={openWizard}
        style={{
          ...button("secondary"),
          fontSize: 17,
          fontWeight: 500,
          padding: "18px 40px",
          borderRadius: 12,
          borderColor: colors.ink,
        }}
      >
        {t("searchCrew")}
      </button>

      <div style={{ marginTop: 22 }}>
        <Link
          href="/platform/delivery"
          style={{ ...muted, fontSize: 14, color: colors.inkSoft, textDecoration: "none" }}
        >
          {t("boatDelivery")}
        </Link>
      </div>

      {/* The page speaks to clients; this is the one quiet door for the other
          side. Deliberately far below the CTA, smaller than the delivery link,
          and only here — a visitor passing through an interior page isn't the
          audience for it. It also disappears once the search flow starts. */}
      {/* Signed in, "Κάνε εγγραφή" reads as a second account — a client who
          wants to go pro does it from Το προφίλ μου («Ξεκίνα»). */}
      {!session && (
      <div style={{ marginTop: 72 }}>
        <Link
          href="/platform/professionals"
          style={{ fontSize: 13, color: colors.inkSoft, textDecoration: "none", opacity: 0.85 }}
        >
          {t("professionalSignup")}
        </Link>
      </div>
      )}
    </div>
  );
}

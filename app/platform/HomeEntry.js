"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { displayName } from "../../lib/platform/names";
import { clearSessionState } from "./useSessionState";
import { useAuth } from "./AuthContext";
import CrewSearchFlow from "./CrewSearchFlow";
import Logo from "./components/Logo";
import Icon from "./components/Icon";
import { flowSearch, inFlowUrl, isRestoredNavigation, setFlowActive } from "../../lib/platform/flowUrl";
import PendingReadyBanner from "./components/PendingReadyBanner";
import RequestDraftLine from "./components/RequestDraftLine";
import { tapTarget } from "../../lib/platform/theme";
import useActiveRole from "./useActiveRole";
import { envFor } from "../../lib/platform/roleEnv";
import { button, colors, muted, h2 } from "../../lib/platform/theme";

// Η αρχική εξαρτάται από τον τρέχοντα ρόλο (lib/platform/roleEnv.js, `home`): Πελάτης → πεδίο αναζήτησης πληρώματος· Επαγγελματίας →
// ανοιχτά αιτήματα· Εταιρεία / Δημιουργός → μόνο το λογότυπο (δεν υπάρχει ακόμη κάτι δικό τους)· Administrator → η Επισκόπηση της
// διαχείρισης. Το πεδίο αναζήτησης ανοίγει τη ροή αιτήματος μόνο όταν η αρχική είναι του Πελάτη. Στη ροή: χωρίς φόρμα, ένα βήμα τη φορά.
export default function HomeEntry() {
  const t = useTranslations("Home");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const { session, userRow } = useAuth();
  const env = envFor(useActiveRole());
  const [started, setStarted] = useState(false);
  // Administrator / Ομάδα: η Αρχική τους είναι η Επισκόπηση της διαχείρισης.
  useEffect(() => {
    if (env.home === "console") router.replace(env.homeHref);
  }, [env.home]);

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
  //
  // The wizard lives at its own URL (`?flow=1`): a REFRESH inside the flow keeps that URL and the history state, so
  // it stays on the same step with its data; a NEW visit to the root URL (typed link, bookmark) is a different URL,
  // so it always opens the home page. (Typing the very same URL again would be treated by browsers as a refresh and
  // keep the state — which is exactly what used to open the wizard at a later step.)
  useEffect(() => {
    function onPopState(e) {
      setStarted(inFlowUrl());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // «Πίσω» από άλλη οθόνη ή ανανέωση μέσα στη ροή: ανοίγει ξανά εκεί που ήταν. Αλλιώς (νέα είσοδος, ξεχασμένο ίχνος
  // στο URL ή στο ιστορικό) η αρχική, και καθαρίζεται το ίχνος.
  useEffect(() => {
    if (inFlowUrl() && (window.history.state?.sfWizardOpen || isRestoredNavigation())) setStarted(true);
    else if (inFlowUrl() || window.history.state?.sfWizardOpen) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // A half-finished request in this tab (went past the first screen, not finished): a small quiet link on the home.
  const [resumeStep, setResumeStep] = useState(null);
  useEffect(() => {
    try {
      const furthest = Number(JSON.parse(sessionStorage.getItem("sf_wizard:furthest") || "0"));
      if (furthest > 0 && !sessionStorage.getItem("sf_wizard:done")) setResumeStep(Number(JSON.parse(sessionStorage.getItem("sf_wizard:step") || "0")) || 0);
      else setResumeStep(null);
    } catch {}
    // Re-read whenever the flow closes (the header's home link leaves it without remounting this page).
  }, [started]);

  // The header shows its full form (helm + name → home) while the flow is open.
  useEffect(() => {
    setFlowActive(started);
    return () => setFlowActive(false);
  }, [started]);

  // A link back to the home page (the header's centre) drops ?flow from the URL while this component stays mounted.
  const paramsKey = params.toString();
  useEffect(() => {
    if (started && !inFlowUrl()) setStarted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  function openWizard() {
    clearSessionState("sf_wizard:");
    window.history.pushState({ sfWizardOpen: true, sfStep: 0 }, "", flowSearch(0));
    setStarted(true);
  }
  function resumeWizard() {
    window.history.pushState({ sfWizardOpen: true, sfStep: resumeStep || 0 }, "", flowSearch(resumeStep || 0));
    setStarted(true);
  }

  if (env.home === "console") return null;
  if (started) return <CrewSearchFlow />;

  const pill = { borderRadius: 999, padding: "16px 36px", fontSize: 17, fontWeight: 500, minHeight: 56, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none" };

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ marginBottom: 47 }}>
        <Logo variant="home" />
        <p style={{ fontSize: 16, color: colors.inkSoft, margin: "16px auto 0", maxWidth: 340, lineHeight: 1.5 }}>{t("tagline")}</p>
      </div>

      {env.home === "search" && welcome && firstName && (
        <div style={{ marginBottom: 36 }}>
          <p style={{ ...h2, fontSize: 21, margin: "0 0 6px" }}>{t("welcomeTitle", { name: firstName })}</p>
          <p style={muted}>{t("welcomeSubtitle")}</p>
        </div>
      )}

      {env.home === "search" && <PendingReadyBanner />}
      {env.home === "search" && <RequestDraftLine />}
      {env.home === "search" && resumeStep !== null && (
        <div style={{ marginBottom: 18 }}>
        <button
          type="button"
          data-resume-request
          onClick={resumeWizard}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, padding: "8px 18px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.seaGlass, color: colors.ink, fontFamily: "inherit", fontSize: 14.5, fontWeight: 500, cursor: "pointer" }}
        >
          {t("resumeRequest")}
          <Icon name="forward" size={16} stroke={1.8} />
        </button>
        </div>
      )}

      {/* Search-style entry (owner, 16/10/2026): reads like a search field, opens the wizard at its first question. */}
      {env.home === "search" && (
      <button
        type="button"
        data-home-search
        onClick={openWizard}
        className="sf-home-search"
        style={{ width: "100%", maxWidth: 884, minHeight: 66, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, padding: "0 30px 0 22px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.card, color: colors.inkSoft, fontFamily: "inherit", fontSize: 16, textAlign: "left", cursor: "text" }}
      >
        <Icon name="search" size={20} stroke={1.7} />
        <span style={{ flex: 1, minWidth: 0 }}>{t("whereTo")}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
      )}

      {env.home === "jobs" && (
        <Link
          href="/platform/board"
          data-home-jobs
          className="sf-home-search"
          style={{ width: "100%", maxWidth: 884, minHeight: 66, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, padding: "0 30px 0 22px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.card, color: colors.inkSoft, fontFamily: "inherit", fontSize: 16, textAlign: "left", textDecoration: "none", boxSizing: "border-box" }}
        >
          <Icon name="search" size={20} stroke={1.7} />
          <span style={{ flex: 1, minWidth: 0 }}>{t("openRequests")}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      )}

      {env.home === "search" && (
      <div style={{ marginTop: 17 }}>
        <Link href="/platform/experiences" style={{ ...tapTarget, display: "inline-flex", alignItems: "center", fontSize: 16, fontWeight: 400, color: colors.ink, textDecoration: "none" }}>
          {t("discoverExperiences")}
        </Link>
      </div>
      )}
    </div>
  );
}

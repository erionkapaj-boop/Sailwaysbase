"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import SignedOutNotice from "../components/SignedOutNotice";
import { loginWall } from "../../../lib/platform/accessPolicy";
import LoadError from "../components/LoadError";
import CommunityMap from "../components/community/CommunityMap";
import CommunityGroups from "../components/community/CommunityGroups";
import { communityMyAccess } from "../../../lib/platform/db";
import { colors, container, card, h1, muted, radius } from "../../../lib/platform/theme";

const segWrap = { display: "inline-flex", padding: 3, background: colors.seaGlass, borderRadius: radius.lg, gap: 2 };
const seg = (on) => ({
  minHeight: 44, padding: "0 22px", border: "none", borderRadius: radius.md, fontSize: 15, fontFamily: "inherit", cursor: "pointer",
  fontWeight: on ? 600 : 400, color: colors.ink, background: on ? colors.card : "transparent",
  boxShadow: on ? "0 1px 3px rgba(22,40,60,0.10)" : "none", transition: "background .18s ease, box-shadow .18s ease",
});

// Community (απόφαση ιδιοκτήτη 16/10/2026, βήμα 1): το κέλυφος με δύο ενότητες. Χάρτης και Ομάδες είναι προς το παρόν
// κενές οθόνες· η πρόσβαση ελέγχεται από τη βάση (community_my_access), όχι από τον ρόλο στον browser.
export default function Page() {
  const t = useTranslations("Community");
  const { session, loading } = useAuth();
  const [access, setAccess] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState("map");

  const load = useCallback(() => {
    setFailed(false);
    communityMyAccess().then(setAccess).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (session) load();
    // Χωρίς σύνδεση (προς το παρόν ανοιχτά, lib/platform/accessPolicy.js): ο επισκέπτης βλέπει τις ίδιες οθόνες. Τα δεδομένα
    // των μελών δεν φορτώνονται (η βάση τα δίνει μόνο σε εγκεκριμένα μέλη)· οι εγγραφές θέλουν λογαριασμό.
    else if (!loading) setAccess({ can_read: true, can_write: true, moderator: false, restricted_until: null, guest: true });
  }, [session, loading, load]);

  if (loading) return null;
  if (loginWall(session, "community")) return <SignedOutNotice />;

  return (
    <div style={{ ...container, maxWidth: 1100 }}>
      <div style={{ padding: "24px 0 0" }}>
        <h1 style={h1}>{t("title")}</h1>
        {failed ? (
          <LoadError what={t("loadWhat")} onRetry={load} />
        ) : !access ? null : !access.can_read ? (
          <div data-community-denied style={{ ...card, marginTop: 16 }}>
            <b style={{ fontWeight: 600 }}>{t("deniedTitle")}</b>
            <p style={{ ...muted, margin: "6px 0 0" }}>{t("deniedBody")}</p>
          </div>
        ) : (
          <>
            <div role="tablist" style={{ ...segWrap, margin: "6px 0 16px" }}>
              {[["map", "tabMap"], ["groups", "tabGroups"]].map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} data-community-tab={k} style={seg(tab === k)} onClick={() => setTab(k)}>
                  {t(label)}
                </button>
              ))}
            </div>
            {tab === "map" ? (
              <div data-community-pane="map">
                <CommunityMap access={access} />
              </div>
            ) : (
              <div data-community-pane="groups">
                <CommunityGroups access={access} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

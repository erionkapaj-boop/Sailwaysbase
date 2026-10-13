"use client";
import TopUpSheet from "./credits/TopUpSheet";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { formatCredits } from "../../../lib/platform/credits";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import {
  listMyPings,
  claimBookingRequest,
  declineBookingRequest,
  respondToReplacementOffer,
  withdrawReplacementCandidacy,
  getPlatformSetting,
  departureLabel,
} from "../../../lib/platform/db";
import Stars from "./Stars";
import { card, sectionLabel, muted, button, colors, money } from "../../../lib/platform/theme";
import LoadError from "./LoadError";
import { reviewCategoriesForRole } from "../../../lib/platform/reviewCategories";

const CLIENT_CATEGORIES = reviewCategoriesForRole("client");

const CLAIM_ERROR_CODES = [
  "request_not_open",
  "already_resolved",
  "date_overlap",
  "insufficient_wallet",
  "not_pinged",
  "skipper_not_eligible",
  "request_expired",
  "already_covered",
  "not_a_replacement_offer",
  "not_a_candidate",
  "client_cannot_pay",
];

// Πρόταση από τη διαχείριση, όχι αίτημα πελάτη: ήρθε επειδή σε διάλεξαν
// ονομαστικά, και αξίζει να διαβάζεται διαφορετικά από ένα ερώτημα που έφυγε
// σε πολλούς.
const OFFER_LABEL_KEYS = {
  admin_direct: "offerDirect",
  admin_replacement: "offerReplacement",
};

export default function PingsInbox({ skipperId }) {
  const t = useTranslations("PingsInbox");
  const { refreshNotifications, userRow } = useAuth();
  const balance = Number(userRow?.wallet_balance ?? 0);
  // Όταν τα credits δεν φτάνουν: αγορά επιτόπου, χωρίς να φύγεις από εδώ.
  // { need, requestId, fee }: τι περιμένει να συνεχίσει μετά την αγορά.
  const [topUp, setTopUp] = useState(null);
  const [pings, setPings] = useState([]);
  const [defaultFee, setDefaultFee] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const [loadFailed, setLoadFailed] = useState(false);
  // Ποτέ δεν πετά: μια αποτυχία φαίνεται ως «δεν φορτώθηκαν», όχι ως άδεια λίστα.
  async function load() {
    try {
      setPings(await listMyPings(skipperId));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }
  useEffect(() => {
    load();
    // Το κόστος της διεκδίκησης δίπλα στο κουμπί που το χρεώνει.
    getPlatformSetting("skipper_claim_fee").then(setDefaultFee).catch(() => {});
  }, [skipperId]);

  // Η αντικατάσταση δεν «κλειδώνει» τίποτα στην αποδοχή — μόνο δηλώνει
  // ενδιαφέρον, διαλέγει ο πελάτης. Κάθε άλλη προέλευση συνεχίζει να δουλεύει
  // όπως πριν: όποιος διεκδικήσει πρώτος την παίρνει.
  async function handleClaim(requestId, isReplacement, fee) {
    setError("");
    // Η διεκδίκηση χρεώνει τώρα· η δήλωση ενδιαφέροντος σε αντικατάσταση όχι.
    if (!isReplacement && fee > balance) {
      setTopUp({ need: fee, requestId, fee });
      return;
    }
    setBusyId(requestId);
    try {
      if (isReplacement) await respondToReplacementOffer(requestId, skipperId, true);
      else await claimBookingRequest(requestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      const code = (err.message || "").match(/[a-z_]+/)?.[0];
      if (code === "insufficient_wallet") setTopUp({ need: Math.max(1, Number(fee) || 1), requestId, fee });
      else setError(CLAIM_ERROR_CODES.includes(code) ? t(code) : friendlyError(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleWithdraw(requestId) {
    setBusyId(requestId);
    setError("");
    try {
      await withdrawReplacementCandidacy(requestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      const code = (err.message || "").match(/[a-z_]+/)?.[0];
      setError(CLAIM_ERROR_CODES.includes(code) ? t(code) : friendlyError(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(requestId, isReplacement) {
    setBusyId(requestId);
    setError("");
    try {
      if (isReplacement) await respondToReplacementOffer(requestId, skipperId, false);
      else await declineBookingRequest(requestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      setError(friendlyError(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  // Ένα αίτημα που έληξε μένει «open» μέχρι το νυχτερινό κλείσιμο — δεν
  // δείχνεται, γιατί η αποδοχή του θα αποτύγχανε ούτως ή άλλως. Εξαίρεση: ο
  // υποψήφιος αντικατάστασης, που μένει ορατός όσο ο πελάτης έχει ακόμα
  // χρόνο να διαλέξει (ώστε να μπορεί και να ανακαλέσει).
  const now = Date.now();
  const future = (iso) => !iso || new Date(iso).getTime() > now;
  const pending = pings.filter((p) => {
    const r = p.booking_requests;
    if (p.status !== "pending" || r?.status !== "open") return false;
    if (r.origin === "admin_replacement" && p.candidate_at) return future(r.client_decide_by);
    return future(r.expires_at) && (r.origin !== "admin_replacement" || future(r.client_decide_by));
  });

  return (
    <div>
      <h2 style={sectionLabel}>{t("title")}<span style={{ marginLeft: 8, opacity: 0.55 }}>{pending.length}</span></h2>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {loadFailed && <LoadError what={t("loadWhat")} onRetry={load} compact />}
      {!loadFailed && pending.length === 0 && <div style={{ ...card, textAlign: "center", padding: "20px 22px" }}><p style={{ ...muted, margin: 0 }}>{t("empty")}</p></div>}
      {pending.map((p) => (
        <PingCard
          key={p.id}
          p={p}
          fee={p.booking_requests.claim_fee_amount != null ? Number(p.booking_requests.claim_fee_amount) : defaultFee}
          busy={busyId === p.booking_requests.id}
          onClaim={() =>
            handleClaim(
              p.booking_requests.id,
              p.booking_requests.origin === "admin_replacement",
              Number(p.booking_requests.claim_fee_amount != null ? p.booking_requests.claim_fee_amount : defaultFee) || 0
            )
          }
          onDecline={() => handleDecline(p.booking_requests.id, p.booking_requests.origin === "admin_replacement")}
          onWithdraw={() => handleWithdraw(p.booking_requests.id)}
        />
      ))}
      <TopUpSheet
        open={Boolean(topUp)}
        need={topUp?.need || 0}
        balance={balance}
        onClose={() => setTopUp(null)}
        continueLabel={t("continueClaim")}
        onContinue={() => topUp && handleClaim(topUp.requestId, false, topUp.fee)}
      />
    </div>
  );
}

// Δικό της component (όχι απλώς inline μέσα στο .map) ώστε κάθε κάρτα να
// έχει το δικό της showBreakdown — ίδιο μοτίβο με το SkipperCard της
// αναζήτησης: ο πελάτης βλέπει την ανάλυση του επαγγελματία πριν διαλέξει,
// οπότε ο επαγγελματίας πρέπει συμμετρικά να μπορεί να δει την ανάλυση του
// πελάτη πριν αποφασίσει να διεκδικήσει.
function PingCard({ p, fee, busy, onClaim, onDecline, onWithdraw }) {
  const t = useTranslations("PingsInbox");
  const f = useFormat();
  const L = useLocalData();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const r = p.booking_requests;
  const cp = r.client_profiles;
  const isOffer = r.origin && r.origin !== "client";
  const isReplacement = r.origin === "admin_replacement";
  // Στην αντικατάσταση η αποδοχή δεν κλειδώνει τίποτα — μόνο δηλώνει
  // ενδιαφέρον. Αν το έχει ήδη κάνει, δεν έχει νόημα να ξαναδείχνονται τα
  // κουμπιά· περιμένει την επιλογή του πελάτη.
  const isWaitingAsCandidate = isReplacement && Boolean(p.candidate_at);

  return (
    <div
      style={{
        ...card,
        // Μια πρόταση που σου έγινε ονομαστικά δεν πρέπει να χάνεται
        // ανάμεσα σε αιτήματα που έφυγαν σε δέκα άτομα.
        borderLeft: isOffer ? `3px solid ${colors.ink}` : card.borderLeft,
      }}
    >
      {isOffer && (
        <p style={{ ...muted, fontSize: 12, margin: "0 0 8px", color: colors.ink, fontWeight: 500 }}>
          {t(OFFER_LABEL_KEYS[r.origin] || "offerDirect")}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 15 }}>
            {L.text(departureLabel(r))} · {L.text(r.boat_types?.name)}
          </div>
          {(r.party_size != null || r.private_cabin != null) && (
            <p style={{ ...muted, fontSize: 13, margin: "2px 0 0" }}>
              {r.party_size != null && <>{t("partySize", { count: r.party_size })}</>}
              {r.party_size != null && r.private_cabin != null ? " · " : ""}
              {r.private_cabin != null && <>{t("privateCabin", { value: r.private_cabin ? t("yes") : t("no") })}</>}
            </p>
          )}
          <p style={{ ...muted, margin: "6px 0 0" }}>
            <span style={money}>{f.dateRange(r.start_date, r.end_date)}</span>
          </p>
          <p style={{ ...muted, fontSize: 12, margin: "2px 0 0" }}>{t("sentAt", { date: f.dateTime(r.created_at) })}</p>
          {isOffer ? (
            <p {...(r.note ? { "data-user-text": true } : {})} style={{ ...muted, margin: "4px 0 0" }}>
              {isReplacement
                ? t("replacementIntro")
                : t("directIntro")}
              {r.note && <> {t("quotedNote", { note: r.note })}</>}
            </p>
          ) : (
            <>
              <p style={{ ...muted, margin: "4px 0 0" }}>
                {t("client")}{" "}
                {cp?.reliability_percentage != null ? (
                  t.rich("clientReliability", {
                    pct: cp.reliability_percentage,
                    m: (c) => <span style={{ ...money, color: colors.ink }}>{c}</span>,
                  })
                ) : (
                  t("newClient")
                )}
                {" · "}
                {cp?.rating_count > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowBreakdown((v) => !v)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
                    aria-expanded={showBreakdown}
                  >
                    <span style={{ ...money, color: colors.ink }}>{cp.rating_avg.toFixed(1)}</span>
                    {" ★ "}
                    <span style={money}>({cp.rating_count})</span>
                  </button>
                ) : (
                  <>
                    <span style={{ ...money, color: colors.ink }}>—</span>
                    {" ★ "}
                    <span style={money}>(0)</span>
                  </>
                )}
              </p>
              {showBreakdown && cp?.rating_count > 0 && (
                <div
                  style={{
                    margin: "6px 0 0",
                    padding: "10px 12px",
                    background: colors.bgSoft || "#F7F5F0",
                    borderRadius: 8,
                  }}
                >
                  {CLIENT_CATEGORIES.map((c) => {
                    const catRating = cp[`rating_avg_${c.key}`];
                    return (
                      <div
                        key={c.key}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "3px 0" }}
                      >
                        <span style={{ fontSize: 12.5, color: colors.inkSoft }}>{c.label}</span>
                        {catRating != null ? (
                          <Stars rating={catRating} count={cp.rating_count} size={11} showEmptyLabel={false} />
                        ) : (
                          <span style={{ fontSize: 12, color: colors.inkSoft }}>{t("noneYet")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {(cp?.users?.nationalities?.country_name || cp?.users?.user_languages?.length > 0) && (
                <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
                  {cp?.users?.nationalities?.flag_emoji ? `${cp.users.nationalities.flag_emoji} ` : ""}
                  {L.text(cp?.users?.nationalities?.country_name)}
                  {cp?.users?.nationalities?.country_name && cp?.users?.user_languages?.length > 0 ? " · " : ""}
                  {cp?.users?.user_languages?.map((ul) => ul.languages?.name).filter(Boolean).map(L.text).join(", ")}
                </p>
              )}
            </>
          )}
          {/* The amount next to the decision, not in the wallet afterwards. For a
              replacement the charge happens only if the client chooses you,
              not now, so the text differs to avoid misleading. */}
          {fee != null && (
            <p style={{ ...muted, fontSize: 12.5, margin: "6px 0 0" }}>
              {Number(fee) === 0 ? (
                t("noFee")
              ) : isReplacement ? (
                t.rich("feeReplacement", {
                  credits: formatCredits(fee),
                  m: (c) => <span style={{ ...money, color: colors.ink }}>{c}</span>,
                })
              ) : (
                t.rich("feeClaim", {
                  credits: formatCredits(fee),
                  m: (c) => <span style={{ ...money, color: colors.ink }}>{c}</span>,
                })
              )}
            </p>
          )}
        </div>
        {/* Declining counts as answering. Without it, the only way to look
            responsive would be to claim everything — exactly the behaviour
            the score should discourage. */}
        {isWaitingAsCandidate ? (
          <div style={{ flex: "0 1 300px" }}>
            <p style={{ fontSize: 13, color: colors.ink, margin: 0 }}>
              {r.client_decide_by
                ? t("waitingUntil", { date: f.dateTime(r.client_decide_by) })
                : t("waiting")}
            </p>
            <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 8px", lineHeight: 1.5 }}>
              {t("waitingNote")}
            </p>
            <button style={button("secondary")} disabled={busy} onClick={onWithdraw}>
              {busy ? "..." : t("withdraw")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
            <button style={button("primary")} disabled={busy} onClick={onClaim}>
              {busy ? "..." : isReplacement ? t("interest") : t("claim")}
            </button>
            <button style={button("secondary")} disabled={busy} onClick={onDecline}>
              {t("decline")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

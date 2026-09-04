"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { listMyPings, claimBookingRequest, declineBookingRequest, getPlatformSetting, departureLabel } from "../../../lib/platform/db";
import Stars from "./Stars";
import { card, sectionLabel, muted, button, colors, money } from "../../../lib/platform/theme";
import { formatDateTime, formatDate } from "../../../lib/platform/notifications";
import { reviewCategoriesForRole } from "../../../lib/platform/reviewCategories";

const CLIENT_CATEGORIES = reviewCategoriesForRole("client");

const CLAIM_ERRORS = {
  request_not_open: "Το αίτημα δεν είναι πια ανοιχτό — κάποιος άλλος πρόλαβε ή έληξε.",
  already_resolved: "Έχεις ήδη απαντήσει σε αυτό το αίτημα.",
  date_overlap: "Έχεις ήδη επιβεβαιωμένη κράτηση που επικαλύπτεται με αυτές τις ημερομηνίες.",
  insufficient_wallet: "Δεν έχεις αρκετό υπόλοιπο wallet για το claim fee.",
  skipper_not_eligible: "Το προφίλ σου δεν είναι εγκεκριμένο.",
  request_expired: "Η πρόταση έληξε.",
  already_covered: "Η δουλειά καλύφθηκε ήδη από κάποιον άλλον.",
};

// Πρόταση από τη διαχείριση, όχι αίτημα πελάτη: ήρθε επειδή σε διάλεξαν
// ονομαστικά, και αξίζει να διαβάζεται διαφορετικά από ένα ερώτημα που έφυγε
// σε πολλούς.
const OFFER_LABEL = {
  admin_direct: "Πρόταση από τη διαχείριση",
  admin_replacement: "Αντικατάσταση — ο πελάτης έμεινε χωρίς πλήρωμα",
};

export default function PingsInbox({ skipperId }) {
  const { refreshNotifications } = useAuth();
  const [pings, setPings] = useState([]);
  const [defaultFee, setDefaultFee] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setPings(await listMyPings(skipperId));
  }
  useEffect(() => {
    load();
    // Το κόστος της διεκδίκησης δίπλα στο κουμπί που το χρεώνει.
    getPlatformSetting("skipper_claim_fee").then(setDefaultFee).catch(() => {});
  }, [skipperId]);

  async function handleClaim(requestId) {
    setBusyId(requestId);
    setError("");
    try {
      await claimBookingRequest(requestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      const code = (err.message || "").match(/[a-z_]+/)?.[0];
      setError(CLAIM_ERRORS[code] || err.message || String(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(requestId) {
    setBusyId(requestId);
    setError("");
    try {
      await declineBookingRequest(requestId, skipperId);
      await load();
      refreshNotifications();
    } catch (err) {
      setError(err.message || String(err));
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const pending = pings.filter((p) => p.status === "pending" && p.booking_requests?.status === "open");

  return (
    <div>
      <h2 style={sectionLabel}>Εισερχόμενα αιτήματα ({pending.length})</h2>
      {error && <p style={{ color: colors.danger }}>{error}</p>}
      {pending.length === 0 && <p style={muted}>Δεν υπάρχουν εκκρεμή αιτήματα αυτή τη στιγμή.</p>}
      {pending.map((p) => (
        <PingCard
          key={p.id}
          p={p}
          fee={p.booking_requests.claim_fee_amount != null ? Number(p.booking_requests.claim_fee_amount) : defaultFee}
          busy={busyId === p.booking_requests.id}
          onClaim={() => handleClaim(p.booking_requests.id)}
          onDecline={() => handleDecline(p.booking_requests.id)}
        />
      ))}
    </div>
  );
}

// Δικό της component (όχι απλώς inline μέσα στο .map) ώστε κάθε κάρτα να
// έχει το δικό της showBreakdown — ίδιο μοτίβο με το SkipperCard της
// αναζήτησης: ο πελάτης βλέπει την ανάλυση του επαγγελματία πριν διαλέξει,
// οπότε ο επαγγελματίας πρέπει συμμετρικά να μπορεί να δει την ανάλυση του
// πελάτη πριν αποφασίσει να διεκδικήσει.
function PingCard({ p, fee, busy, onClaim, onDecline }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const r = p.booking_requests;
  const cp = r.client_profiles;
  const isOffer = r.origin && r.origin !== "client";

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
          {OFFER_LABEL[r.origin] || "Πρόταση από τη διαχείριση"}
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 15 }}>
            {departureLabel(r)} · {r.boat_types?.name}
          </div>
          {(r.party_size != null || r.private_cabin != null) && (
            <p style={{ ...muted, fontSize: 13, margin: "2px 0 0" }}>
              {r.party_size != null && <>Άτομα: {r.party_size}</>}
              {r.party_size != null && r.private_cabin != null ? " · " : ""}
              {r.private_cabin != null && <>Ιδιωτική καμπίνα: {r.private_cabin ? "Ναι" : "Όχι"}</>}
            </p>
          )}
          <p style={{ ...muted, margin: "6px 0 0" }}>
            <span style={money}>{formatDate(r.start_date)}</span> → <span style={money}>{formatDate(r.end_date)}</span>
          </p>
          <p style={{ ...muted, fontSize: 12, margin: "2px 0 0" }}>Στάλθηκε {formatDateTime(r.created_at)}</p>
          {isOffer ? (
            <p style={{ ...muted, margin: "4px 0 0" }}>
              Σε επέλεξαν απευθείας για αυτή τη δουλειά.
              {r.note && <> «{r.note}»</>}
            </p>
          ) : (
            <>
              <p style={{ ...muted, margin: "4px 0 0" }}>
                Πελάτης:{" "}
                {cp?.reliability_percentage != null ? (
                  <>
                    <span style={{ ...money, color: colors.ink }}>{cp.reliability_percentage}%</span> αξιοπιστία
                  </>
                ) : (
                  "νέος πελάτης"
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
                          <span style={{ fontSize: 12, color: colors.inkSoft }}>Καμία ακόμα</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {(cp?.users?.nationalities?.country_name || cp?.users?.user_languages?.length > 0) && (
                <p style={{ ...muted, fontSize: 12.5, margin: "4px 0 0" }}>
                  {cp?.users?.nationalities?.flag_emoji ? `${cp.users.nationalities.flag_emoji} ` : ""}
                  {cp?.users?.nationalities?.country_name}
                  {cp?.users?.nationalities?.country_name && cp?.users?.user_languages?.length > 0 ? " · " : ""}
                  {cp?.users?.user_languages?.map((ul) => ul.languages?.name).filter(Boolean).join(", ")}
                </p>
              )}
            </>
          )}
          {/* Το ποσό δίπλα στην απόφαση, όχι στο πορτοφόλι μετά. */}
          {fee != null && (
            <p style={{ ...muted, fontSize: 12.5, margin: "6px 0 0" }}>
              {Number(fee) === 0 ? (
                "Χωρίς χρέωση διεκδίκησης."
              ) : (
                <>
                  Με τη διεκδίκηση χρεώνεσαι <span style={{ ...money, color: colors.ink }}>{fee}€</span>.
                </>
              )}
            </p>
          )}
        </div>
        {/* Declining counts as answering. Without it, the only way to look
            responsive would be to claim everything — exactly the behaviour
            the score should discourage. */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button style={button("primary")} disabled={busy} onClick={onClaim}>
            {busy ? "..." : "Διεκδίκηση"}
          </button>
          <button style={button("secondary")} disabled={busy} onClick={onDecline}>
            Δεν με ενδιαφέρει
          </button>
        </div>
      </div>
    </div>
  );
}

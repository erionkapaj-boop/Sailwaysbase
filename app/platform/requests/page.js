"use client";
import LowCreditsBanner from "../components/credits/LowCreditsBanner";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import { useAuth } from "../AuthContext";
import useActiveRole from "../useActiveRole";
import { listMyBookingRequests, getMyClientProfile, createMissingProfile, departureLabel } from "../../../lib/platform/db";
import PingsInbox from "../components/PingsInbox";
import DeliveryPingsInbox from "../components/DeliveryPingsInbox";
import RequestPanel from "../components/RequestPanel";
import BoardRequestPanel from "../components/BoardRequestPanel";
import Toast from "../components/Toast";
import { container, card, h1, sectionLabel, muted, button, badge, colors, money } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";
import PendingReadyBanner from "../components/PendingReadyBanner";
import RequestDraftLine from "../components/RequestDraftLine";
import { friendlyError } from "../../../lib/platform/friendlyError";
import LoadError from "../components/LoadError";
import { noteFailure } from "../../../lib/platform/health";

function statusFor(r) {
  if (r.status === "expired_unclaimed" && r.client_charged_at && r.fee_amount > 0) {
    return ["statusExpiredRefunded", "warn"];
  }
  return REQ_STATUS[r.status] || [null, "neutral"];
}

const REQ_STATUS = {
  matched: ["statusMatched", "success"],
  // Τα αιτήματα από το 0122 δεν χρεώνονται αν δεν γίνουν δεκτά· μόνο τα
  // παλιότερα, χρεωμένα στην αποστολή, είχαν επιστροφή (statusFor).
  expired_unclaimed: ["statusExpired", "warn"],
  cancelled: ["statusCancelled", "danger"],
};

// Ένας λογαριασμός μπορεί ταυτόχρονα να δέχεται αιτήματα (ως επαγγελματίας)
// και να στέλνει (ως πελάτης, π.χ. για να νοικιάσει πλήρωμα στο δικό του
// σκάφος) — δύο κατευθύνσεις του ίδιου πράγματος, όχι δύο άσχετες λίστες σε
// δύο διαφορετικές σελίδες.
export default function RequestsPage() {
  const t = useTranslations("RequestsPage");
  const L = useLocalData();
  const f = useFormat();
  const { session, userRow, profile, isAdmin, loading, refresh, loadError } = useAuth();
  const activeRole = useActiveRole();
  const [requests, setRequests] = useState([]);
  const [clientProfile, setClientProfile] = useState(null);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  async function load() {
    setBusy(true);
    setLoadFailed(false);
    try {
      let [r, cp] = await Promise.all([listMyBookingRequests(), getMyClientProfile()]);
      // Κάθε λογαριασμός μπορεί να στείλει αίτημα, και οι επαγγελματίες. Αν
      // λείπει το προφίλ πελάτη (π.χ. εγγραφή ως επαγγελματίας), φτιάχνεται
      // εδώ αθόρυβα αντί να εμφανίζεται ως σφάλμα.
      if (!cp) {
        try {
          await createMissingProfile("client");
          cp = await getMyClientProfile();
        } catch {}
      }
      setRequests(r);
      setClientProfile(cp);
    } catch {
      // Χωρίς αυτό η σελίδα έμενε άδεια σαν να μην υπάρχει κανένα αίτημα.
      setLoadFailed(true);
      noteFailure("requests_load");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session]);

  if (loading) return <div style={container}>{t("loading")}</div>;
  if (!session) return <SignedOutNotice />;

  // Κάθε ρόλος βλέπει μόνο τα δικά του: ο Επαγγελματίας όσα του στάλθηκαν / ανέλαβε, ο Πελάτης όσα έστειλε.
  const isProfessional = activeRole === "professional";
  const boardRequests = requests.filter((r) => r.board_open && (r.status === "open" || r.status === "matched"));
  const openRequests = requests.filter((r) => r.status === "open" && !r.board_open);
  const closedRequests = requests.filter((r) => r.status !== "open" && r.status !== "matched");

  async function recreateClientProfile() {
    setCreating(true);
    setCreateError("");
    try {
      await createMissingProfile("client");
      await refresh();
      await load();
    } catch (err) {
      setCreateError(friendlyError(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={container}>
      <h1 style={{ ...h1, marginBottom: 24 }}>{t("title")}</h1>
      <PendingReadyBanner />
      <RequestDraftLine />

      {isProfessional && (
        <div style={{ marginBottom: 32 }}>
          {!profile && (
            <p style={muted}>{t("needsProfile")}</p>
          )}
          {profile?.approval_status === "pending" && (
            <div style={{ ...card, borderLeft: `3px solid ${colors.warn}` }}>
              <b style={{ fontWeight: 600 }}>{t("pendingTitle")}</b>
              <p style={{ ...muted, margin: "6px 0 0" }}>
                {t("pendingBody")}
              </p>
            </div>
          )}
          {profile?.approval_status === "rejected" && (
            <div style={{ ...card, borderLeft: `3px solid ${colors.danger}` }}>
              <b style={{ fontWeight: 600 }}>{t("rejectedTitle")}</b>
              <p style={{ ...muted, margin: "6px 0 0" }}>{t("rejectedBody")}</p>
            </div>
          )}
          {profile?.approval_status === "approved" && (
            <>
              <LowCreditsBanner />
              <PingsInbox skipperId={profile.id} />
              <DeliveryPingsInbox skipperId={profile.id} />
            </>
          )}
        </div>
      )}

      {!isProfessional && (
      <div>
        {loadFailed ? (
          <LoadError what={t("loadWhat")} onRetry={load} />
        ) : !clientProfile && !busy ? (
          <div style={card}>
            <b>{t("notReadyTitle")}</b>
            <p style={muted}>{t("notReadyBody")}</p>
            <button style={button("primary")} disabled={creating} onClick={recreateClientProfile}>
              {creating ? t("completing") : t("complete")}
            </button>
            {createError && <p style={{ color: colors.danger, marginTop: 8 }}>{createError}</p>}
          </div>
        ) : (
          <>
            <h2 style={sectionLabel}>{t("sentTitle")}<span style={{ marginLeft: 8, opacity: 0.55 }}>{openRequests.length + boardRequests.filter((r) => r.status === "open").length}</span></h2>
            {busy && <p style={muted}>{t("loading")}</p>}
            {boardRequests.map((r) => (
              <BoardRequestPanel key={r.id} request={r} onChanged={load} onToastMessage={setToast} />
            ))}
            {openRequests.length === 0 && boardRequests.length === 0 && !busy && (
              <div style={{ ...card, textAlign: "center" }}>
                <p style={{ ...muted, margin: "0 0 14px" }}>
                  {t("emptyBody")}
                </p>
                <Link href="/platform" style={{ ...button("secondary"), textDecoration: "none" }}>
                  {t("findCrew")}
                </Link>
              </div>
            )}
            {openRequests.map((r) => (
              <RequestPanel key={r.id} request={r} onChanged={load} onToastMessage={setToast} />
            ))}

            {closedRequests.length > 0 && (
              <>
                <h2 style={{ ...sectionLabel, marginTop: 32 }}>{t("historyTitle")}</h2>
                {closedRequests.map((r) => (
                  <div key={r.id} style={{ ...card, opacity: 0.75 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <span>
                        {L.text(departureLabel(r))} · <span style={money}>{f.dateRange(r.start_date, r.end_date)}</span>
                      </span>
                      <span style={badge(statusFor(r)[1])}>{statusFor(r)[0] ? t(statusFor(r)[0]) : r.status}</span>
                    </div>
                    <p style={{ ...muted, fontSize: 12, margin: "4px 0 0" }}>{t("sentAt", { date: f.dateTime(r.created_at) })}</p>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
      )}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

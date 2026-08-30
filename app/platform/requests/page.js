"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { listMyBookingRequests, getMyClientProfile, createMissingProfile, departureLabel } from "../../../lib/platform/db";
import PingsInbox from "../components/PingsInbox";
import RequestPanel from "../components/RequestPanel";
import Toast from "../components/Toast";
import { formatDateTime, formatDate } from "../../../lib/platform/notifications";
import { container, card, h1, sectionLabel, muted, button, badge, colors, money } from "../../../lib/platform/theme";

const REQ_STATUS = {
  matched: ["Βρέθηκε επαγγελματίας", "success"],
  expired_unclaimed: ["Άκαρπο — έγινε credit", "warn"],
  cancelled: ["Ακυρώθηκε", "danger"],
};

// Ένας λογαριασμός μπορεί ταυτόχρονα να δέχεται αιτήματα (ως επαγγελματίας)
// και να στέλνει (ως πελάτης, π.χ. για να νοικιάσει πλήρωμα στο δικό του
// σκάφος) — δύο κατευθύνσεις του ίδιου πράγματος, όχι δύο άσχετες λίστες σε
// δύο διαφορετικές σελίδες.
export default function RequestsPage() {
  const { session, userRow, profile, isAdmin, loading, refresh, loadError } = useAuth();
  const [requests, setRequests] = useState([]);
  const [clientProfile, setClientProfile] = useState(null);
  const [busy, setBusy] = useState(true);
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  async function load() {
    setBusy(true);
    try {
      const [r, cp] = await Promise.all([listMyBookingRequests(), getMyClientProfile()]);
      setRequests(r);
      setClientProfile(cp);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session]);

  if (loading) return <div style={container}>Φόρτωση...</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;

  const isProfessional = userRow?.role === "skipper" || isAdmin;
  const openRequests = requests.filter((r) => r.status === "open");
  const closedRequests = requests.filter((r) => r.status !== "open" && r.status !== "matched");

  async function recreateClientProfile() {
    setCreating(true);
    setCreateError("");
    try {
      await createMissingProfile("client");
      await refresh();
      await load();
    } catch (err) {
      setCreateError(err.message || String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={container}>
      <h1 style={h1}>Αιτήματα</h1>

      {isProfessional && (
        <div style={{ marginBottom: 32 }}>
          {!profile && (
            <p style={muted}>Χρειάζεται επαγγελματικό προφίλ για να δέχεσαι αιτήματα.</p>
          )}
          {profile?.approval_status === "pending" && (
            <div style={{ ...card, borderLeft: `3px solid ${colors.warn}` }}>
              <b style={{ fontWeight: 600 }}>Το προφίλ σου περιμένει έγκριση.</b>
              <p style={{ ...muted, margin: "6px 0 0" }}>
                Μέχρι τότε δεν εμφανίζεσαι σε αναζητήσεις και δεν λαμβάνεις αιτήματα.
              </p>
            </div>
          )}
          {profile?.approval_status === "rejected" && (
            <div style={{ ...card, borderLeft: `3px solid ${colors.danger}` }}>
              <b style={{ fontWeight: 600 }}>Το προφίλ σου απορρίφθηκε.</b>
              <p style={{ ...muted, margin: "6px 0 0" }}>Ενημέρωσε τα στοιχεία σου και επικοινώνησε με τον admin.</p>
            </div>
          )}
          {profile?.approval_status === "approved" && <PingsInbox skipperId={profile.id} />}
        </div>
      )}

      <div>
        {!clientProfile && !busy ? (
          <div style={{ ...card, borderColor: colors.danger }}>
            <b>Δεν βρέθηκε προφίλ πελάτη για τον λογαριασμό σου.</b>
            <p style={muted}>Πάτα το κουμπί για να το φτιάξουμε τώρα, ώστε να μπορείς να στείλεις αιτήματα.</p>
            <button style={button("primary")} disabled={creating} onClick={recreateClientProfile}>
              {creating ? "..." : "Δημιουργία προφίλ πελάτη"}
            </button>
            {createError && <p style={{ color: colors.danger, marginTop: 8 }}>{createError}</p>}
          </div>
        ) : (
          <>
            <h2 style={sectionLabel}>Εξερχόμενα αιτήματα ({openRequests.length})</h2>
            {busy && <p style={muted}>Φόρτωση...</p>}
            {openRequests.length === 0 && !busy && <p style={muted}>Δεν υπάρχουν εκκρεμή αιτήματα αυτή τη στιγμή.</p>}
            {openRequests.map((r) => (
              <RequestPanel key={r.id} request={r} onChanged={load} onToastMessage={setToast} />
            ))}

            {closedRequests.length > 0 && (
              <>
                <h2 style={{ ...sectionLabel, marginTop: 32 }}>Ιστορικό αιτημάτων</h2>
                {closedRequests.map((r) => (
                  <div key={r.id} style={{ ...card, opacity: 0.75 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <span>
                        {departureLabel(r)} · <span style={money}>{formatDate(r.start_date)}</span> →{" "}
                        <span style={money}>{formatDate(r.end_date)}</span>
                      </span>
                      <span style={badge(REQ_STATUS[r.status]?.[1] || "neutral")}>{REQ_STATUS[r.status]?.[0] || r.status}</span>
                    </div>
                    <p style={{ ...muted, fontSize: 12, margin: "4px 0 0" }}>Στάλθηκε {formatDateTime(r.created_at)}</p>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

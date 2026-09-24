"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../AuthContext";
import {
  adminGetUser,
  adminGetUserOverview,
  adminApproveSkipper,
  adminRejectSkipper,
  adminSetTestAccount,
  adminSetStaffAdmin,
  adminDeleteAccount,
  adminRestoreAccount,
  adminSuspendAccount,
  adminReactivateAccount,
  adminVerifyUser,
  adminResetPin,
  loginAsTestAccount,
  departureLabel,
} from "../../../../../lib/platform/db";
import { computeCrewHighlights, labelForRole } from "../../../../../lib/platform/roles";
import { STATUS_LABEL, Status, WALLET_TYPE_LABEL, ProCredentials, VERIFY_HINT } from "../../ui";
import Stat from "../../../components/Stat";
import Stars from "../../../components/Stars";
import BackButton from "../../../components/BackButton";
import { useConfirm } from "../../../components/ConfirmDialog";
import {
  container,
  card,
  h1,
  h2,
  muted,
  button,
  badge,
  colors,
  money,
} from "../../../../../lib/platform/theme";
import { formatDate, formatDateTime, timeAgo } from "../../../../../lib/platform/notifications";

const DELETE_ERRORS = {
  has_pending_activity: "Έχει ανοιχτό αίτημα ή επιβεβαιωμένη κράτηση. Πρέπει να τακτοποιηθούν πρώτα.",
  already_deleted: "Ο λογαριασμός έχει ήδη διαγραφεί.",
  user_not_found: "Δεν βρέθηκε ο λογαριασμός.",
  cannot_delete_admin: "Ο κύριος λογαριασμός διαχειριστή δεν διαγράφεται.",
  cannot_delete_self: "Δεν μπορείς να διαγράψεις τον δικό σου λογαριασμό από εδώ.",
  not_deleted: "Ο λογαριασμός δεν είναι διαγραμμένος.",
  cannot_impersonate_admin: "Δεν γίνεται «Σύνδεση ως» πάνω σε λογαριασμό admin.",
  cannot_remove_last_admin: "Δεν μπορείς να αφαιρέσεις τα δικαιώματα admin από τον μόνο admin που έχει απομείνει.",
  cannot_suspend_admin: "Λογαριασμός admin δεν μπορεί να τεθεί σε αναστολή.",
  already_suspended: "Ο λογαριασμός είναι ήδη σε αναστολή.",
  reason_required: "Χρειάζεται λόγος για την αναστολή.",
  not_suspended: "Ο λογαριασμός δεν είναι σε αναστολή.",
};

function Row({ left, right, tone = "neutral" }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span>{left}</span>
        {right && <span style={badge(tone)}>{STATUS_LABEL[right] || right}</span>}
      </div>
    </div>
  );
}

function Chips({ items }) {
  if (!items?.length) return <p style={muted}>—</p>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((t) => (
        <span key={t} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>
          {t}
        </span>
      ))}
    </div>
  );
}

export default function AdminUserViewPage() {
  const { id } = useParams();
  const router = useRouter();
  const { session, userRow, loading, startViewAs } = useAuth();

  const [target, setTarget] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  const [suspendReason, setSuspendReason] = useState("");
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [notice, setNotice] = useState("");
  const [tempPin, setTempPin] = useState(null);
  const [deleteReason, setDeleteReason] = useState("");

  async function load() {
    setBusy(true);
    try {
      const u = await adminGetUser(id);
      setTarget(u);
      if (u) setData(await adminGetUserOverview(id, u.role));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!id || (userRow?.role !== "admin" && !userRow?.is_staff_admin)) return;
    load();
  }, [id, userRow]);

  async function handleApprove() {
    setActionBusy(true);
    setActionError("");
    setNotice("");
    try {
      await adminApproveSkipper(id);
      await load();
      setNotice("Το προφίλ εγκρίθηκε και εμφανίζεται πλέον στις αναζητήσεις.");
    } catch (err) {
      setActionError(err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReject(isRevoke = false) {
    const name = target.full_name || target.phone_number;
    const msg = isRevoke
      ? `${name}: ανάκληση της έγκρισης; Δεν θα εμφανίζεται πλέον σε αναζητήσεις μέχρι να εγκριθεί ξανά.`
      : `${name}: απόρριψη του προφίλ;`;
    if (!(await confirm(msg))) return;
    setActionBusy(true);
    setActionError("");
    setNotice("");
    try {
      await adminRejectSkipper(id, rejectNote.trim() || null);
      setRejectNote("");
      await load();
      setNotice(isRevoke ? "Η έγκριση ανακλήθηκε." : "Το προφίλ απορρίφθηκε.");
    } catch (err) {
      setActionError(err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleVerify() {
    setActionBusy(true);
    setActionError("");
    setNotice("");
    try {
      await adminVerifyUser(id);
      await load();
      setNotice("Ο λογαριασμός επαληθεύτηκε και ο χρήστης ειδοποιήθηκε.");
    } catch (err) {
      setActionError(err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleResetPin() {
    const name = target.full_name || target.phone_number;
    if (
      !(await confirm(
        `${name}: νέος προσωρινός κωδικός; Ο τωρινός κωδικός θα σταματήσει να δουλεύει. Χρησιμοποίησέ το μόνο αν σου το ζήτησε ο ίδιος.`,
        { tone: "primary" }
      ))
    )
      return;
    setActionBusy(true);
    setActionError("");
    setTempPin(null);
    try {
      const { pin } = await adminResetPin(id);
      setTempPin(pin);
    } catch (err) {
      setActionError(err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleToggleTestAccount() {
    const name = target.full_name || target.phone_number;
    if (
      !target.is_test_account &&
      !(await confirm(
        `${name}: να σημειωθεί ως λογαριασμός δοκιμών; Αυτό επιτρέπει «Σύνδεση ως», που αλλάζει τον κωδικό του λογαριασμού. Μόνο για ψεύτικους λογαριασμούς δοκιμών, ποτέ για πραγματικό πελάτη.`
      ))
    )
      return;
    setActionBusy(true);
    setActionError("");
    try {
      await adminSetTestAccount(id, !target.is_test_account);
      await load();
    } catch (err) {
      setActionError(err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleToggleStaffAdmin() {
    const name = target.full_name || target.phone_number;
    const ok = await confirm(
      target.is_staff_admin
        ? `${name}: αφαίρεση των δικαιωμάτων διαχειριστή;`
        : `${name}: να δοθούν δικαιώματα διαχειριστή; Θα βλέπει και θα αλλάζει τα πάντα εδώ: χρήστες, χρήματα, ρυθμίσεις. Δώσ' τα μόνο σε άτομο που εμπιστεύεσαι απόλυτα.`
    );
    if (!ok) return;
    setActionBusy(true);
    setActionError("");
    try {
      await adminSetStaffAdmin(id, !target.is_staff_admin);
      await load();
    } catch (err) {
      setActionError(DELETE_ERRORS[err.message] || err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleSuspend(e) {
    e.preventDefault();
    if (!suspendReason.trim()) {
      setActionError("Χρειάζεται λόγος για την αναστολή.");
      return;
    }
    setActionBusy(true);
    setActionError("");
    try {
      await adminSuspendAccount(id, suspendReason);
      setSuspendReason("");
      setShowSuspendForm(false);
      await load();
    } catch (err) {
      setActionError(DELETE_ERRORS[err.message] || err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReactivate() {
    setActionBusy(true);
    setActionError("");
    try {
      await adminReactivateAccount(id);
      await load();
    } catch (err) {
      setActionError(DELETE_ERRORS[err.message] || err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleLoginAs() {
    if (
      !(await confirm(
        `Θα γίνει πραγματική σύνδεση ως ${target.full_name || target.phone_number}. Ο κωδικός PIN του θα επαναφερθεί αυτόματα. Συνέχεια;`,
        { tone: "primary" }
      ))
    )
      return;
    setActionBusy(true);
    setActionError("");
    try {
      await loginAsTestAccount(id);
      router.push(target.role === "admin" ? "/platform/admin" : "/platform/requests");
    } catch (err) {
      setActionError(DELETE_ERRORS[err.message] || err.message || String(err));
      setActionBusy(false);
    }
  }

  // What deleting this account will touch, said before the admin confirms —
  // open requests get cancelled and refunded; confirmed bookings do not.
  function deletionImpact() {
    const today = new Date().toISOString().slice(0, 10);
    const openReqs = (data?.requests || []).filter((r) => r.status === "open").length;
    const upcoming = (data?.bookings || []).filter((b) => b.status === "confirmed" && b.end_date >= today).length;
    const pendingPings = (data?.pings || []).filter((p) => p.status === "pending").length;
    const lines = [];
    if (openReqs > 0)
      lines.push(`${openReqs === 1 ? "Το 1 ανοιχτό αίτημά του ακυρώνεται" : `Τα ${openReqs} ανοιχτά αιτήματά του ακυρώνονται`} και το τέλος επιστρέφεται ως credit.`);
    if (pendingPings > 0)
      lines.push(`Αφαιρείται από ${pendingPings === 1 ? "1 αίτημα" : `${pendingPings} αιτήματα`} που περίμεναν απάντησή του.`);
    if (upcoming > 0)
      lines.push(`ΠΡΟΣΟΧΗ: ${upcoming === 1 ? "η 1 επιβεβαιωμένη κράτησή του ΔΕΝ ακυρώνεται" : `οι ${upcoming} επιβεβαιωμένες κρατήσεις του ΔΕΝ ακυρώνονται`}. Αν χρειάζεται, τακτοποίησέ τες ξεχωριστά.`);
    return lines;
  }

  async function handleDeleteAccount() {
    const name = target.full_name || target.phone_number;
    const impact = deletionImpact();
    const ok = await confirm(
      `${name}: διαγραφή λογαριασμού; Δεν θα μπορεί να συνδεθεί και κρύβεται από την πλατφόρμα. Τίποτα δεν σβήνεται και μπορείς να τον επαναφέρεις από αυτή τη σελίδα όποτε θελήσεις.` +
        (impact.length ? `\n\n${impact.join("\n")}` : "")
    );
    if (!ok) return;
    setActionBusy(true);
    setActionError("");
    setNotice("");
    try {
      const res = await adminDeleteAccount(id, deleteReason.trim() || null);
      setDeleteReason("");
      await load();
      setNotice(
        "Ο λογαριασμός διαγράφηκε." +
          (res?.cancelled_requests > 0
            ? ` ${res.cancelled_requests === 1 ? "Ακυρώθηκε 1 ανοιχτό αίτημα" : `Ακυρώθηκαν ${res.cancelled_requests} ανοιχτά αιτήματα`} και επιστράφηκαν ${res.refunded}€ ως credit.`
            : "") +
          " Μπορείς να τον επαναφέρεις από κάτω."
      );
    } catch (err) {
      setActionError(DELETE_ERRORS[err.message] || err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRestoreAccount() {
    const name = target.full_name || target.phone_number;
    if (!(await confirm(`${name}: επαναφορά λογαριασμού; Θα μπορεί ξανά να συνδέεται και θα ειδοποιηθεί.`, { tone: "primary" })))
      return;
    setActionBusy(true);
    setActionError("");
    setNotice("");
    try {
      await adminRestoreAccount(id);
      await load();
      setNotice("Ο λογαριασμός επανήλθε και ο χρήστης ειδοποιήθηκε.");
    } catch (err) {
      setActionError(DELETE_ERRORS[err.message] || err.message || String(err));
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) return <div style={container}>Φόρτωση…</div>;
  if (!session) return <div style={container}>Χρειάζεται σύνδεση.</div>;
  if (userRow?.role !== "admin" && !userRow?.is_staff_admin)
    return <div style={container}>Πρόσβαση μόνο για admin.</div>;

  return (
    <div style={container}>
      <BackButton href="/platform/admin/users" />

      {busy && !target && <p style={muted}>Φόρτωση…</p>}
      {error && <p style={{ color: colors.danger }}>{error}</p>}

      {target && (
        <>
          <h1 style={{ ...h1, marginTop: 14, marginBottom: 6 }}>{target.full_name || "(χωρίς όνομα)"}</h1>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            <Status value={target.role === "skipper" ? "skipper" : target.role} />
            {data?.role === "skipper" && data.profile?.role && (
              <span style={badge("neutral")}>{labelForRole(data.profile.role)}</span>
            )}
            <Status value={target.status} />
          </div>
          <p style={{ ...muted, margin: "0 0 4px" }}>
            <span style={money}>{target.phone_number}</span>
            {target.email ? ` · ${target.email}` : ""}
          </p>
          <p style={{ ...muted, fontSize: 12.5, margin: 0 }}>
            Εγγραφή {formatDateTime(target.created_at)}
            {" · "}
            {target.last_seen_at ? `τελευταία φορά μέσα ${timeAgo(target.last_seen_at)}` : "δεν έχει μπει ποτέ"}
          </p>

          {notice && (
            <div style={{ ...card, marginTop: 14, borderLeft: `3px solid ${colors.success}` }}>{notice}</div>
          )}
          {actionError && <p style={{ color: colors.danger, marginTop: 10, fontSize: 13 }}>{actionError}</p>}

          {/* Pending verification — used to be actionable only from the list,
              and this page didn't even say the account was waiting. */}
          {!target.phone_verified_at && target.role !== "admin" && target.status !== "deleted" && (
            <div style={{ ...card, marginTop: 16, borderLeft: `3px solid ${colors.warn}` }}>
              <b style={{ fontWeight: 600 }}>Περιμένει επαλήθευση</b>
              <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13.5 }}>{VERIFY_HINT}</p>
              <button style={button("primary")} disabled={actionBusy} onClick={handleVerify}>
                {actionBusy ? "…" : "Επαλήθευση"}
              </button>
            </div>
          )}

          {target.role !== "admin" && target.status !== "deleted" && target.status !== "suspended" && (
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                style={button("secondary")}
                onClick={() => {
                  startViewAs({ id: target.id, name: target.full_name, phone: target.phone_number, role: target.role });
                  router.push("/platform/requests");
                }}
              >
                Προβολή ως {target.full_name || target.phone_number}
              </button>
              {target.is_test_account && (
                <button style={button("primary")} disabled={actionBusy} onClick={handleLoginAs}>
                  Σύνδεση ως {target.full_name || target.phone_number}
                </button>
              )}
              <span style={{ ...muted, fontSize: 12.5, flexBasis: "100%" }}>
                «Προβολή ως»: βλέπεις τις σελίδες του όπως τις βλέπει ο ίδιος, χωρίς να μπορείς να κάνεις ενέργειες.
              </span>
            </div>
          )}

          {data?.role === "client" && (
            <>
              <div style={{ ...card, display: "flex", gap: 36, flexWrap: "wrap", marginTop: 20 }}>
                <Stat label="Υπόλοιπο" value={`${data.profile?.wallet_balance ?? 0}€`} />
                <Link
                  href={`/platform/admin/finance?phone=${encodeURIComponent(target.phone_number || "")}`}
                  style={{ alignSelf: "flex-end", fontSize: 12.5, color: colors.ink }}
                >
                  Φόρτωση υπολοίπου
                </Link>
                <Stat
                  label="Αξιοπιστία"
                  value={
                    data.profile?.reliability_percentage != null
                      ? `${data.profile.reliability_percentage}%`
                      : "—"
                  }
                />
                <Stat label="Ολοκληρωμένες" value={data.profile?.completed_bookings_count ?? 0} />
                <div style={{ flexBasis: "100%" }}>
                  <Stars rating={data.profile?.rating_avg} count={data.profile?.rating_count ?? 0} />
                </div>
              </div>

              <h2 style={h2}>Αιτήματα ({data.requests.length})</h2>
              {data.requests.length === 0 && <p style={muted}>Κανένα αίτημα.</p>}
              {data.requests.map((r) => (
                <Row
                  key={r.id}
                  left={
                    <>
                      {departureLabel(r)} · <span style={money}>{formatDate(r.start_date)}</span> →{" "}
                      <span style={money}>{formatDate(r.end_date)}</span>
                    </>
                  }
                  right={r.status}
                />
              ))}

              <h2 style={h2}>Κρατήσεις ({data.bookings.length})</h2>
              {data.bookings.length === 0 && <p style={muted}>Καμία κράτηση.</p>}
              {data.bookings.map((b) => (
                <Row
                  key={b.id}
                  left={
                    <>
                      {departureLabel(b)} · <span style={money}>{formatDate(b.start_date)}</span> →{" "}
                      <span style={money}>{formatDate(b.end_date)}</span>
                    </>
                  }
                  right={b.status}
                  tone={b.status === "confirmed" || b.status === "completed" ? "success" : "neutral"}
                />
              ))}
            </>
          )}

          {data?.role === "skipper" && !data.profile && (
            <p style={{ ...muted, marginTop: 20 }}>Δεν υπάρχει προφίλ επαγγελματία για αυτόν τον λογαριασμό.</p>
          )}

          {data?.role === "skipper" && data.profile && (
            <>
              {/* The only action this screen allows — everything else here is
                  read-only "view as". Approving/rejecting acts on the real
                  row, not on what the admin happens to be looking at. */}
              {(data.profile.approval_status === "pending" || data.profile.approval_status === "rejected") && (
                <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
                  <b style={{ fontWeight: 600 }}>
                    {data.profile.approval_status === "pending"
                      ? "Το προφίλ περιμένει έγκριση"
                      : "Το προφίλ έχει απορριφθεί"}
                  </b>
                  <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13.5 }}>
                    Έλεγξε ότι το δίπλωμα και η εμπειρία ταιριάζουν με την ιδιότητα. Με την έγκριση ο επαγγελματίας
                    εμφανίζεται στις αναζητήσεις.
                  </p>
                  <ProCredentials profile={data.profile} roleLabel={labelForRole(data.profile.role)} />
                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <button style={button("primary")} disabled={actionBusy} onClick={handleApprove}>
                      {actionBusy ? "..." : "Έγκριση"}
                    </button>
                    {data.profile.approval_status === "pending" && (
                      <button style={button("secondary")} disabled={actionBusy} onClick={() => handleReject(false)}>
                        {actionBusy ? "..." : "Απόρριψη"}
                      </button>
                    )}
                  </div>
                  {data.profile.approval_status === "pending" && (
                    <input
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Λόγος απόρριψης (προαιρετικό)"
                      style={{
                        width: "100%",
                        marginTop: 10,
                        padding: "8px 10px",
                        fontSize: 13,
                        fontFamily: "inherit",
                        borderRadius: 8,
                        border: `1px solid ${colors.border}`,
                        boxSizing: "border-box",
                      }}
                    />
                  )}
                </div>
              )}
              {data.profile.approval_status === "approved" && (
                <div style={{ ...card, marginTop: 20 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
                    <span style={badge("success")}>Εγκεκριμένο</span>
                    <button style={button("secondary")} disabled={actionBusy} onClick={() => handleReject(true)}>
                      {actionBusy ? "..." : "Ανάκληση έγκρισης"}
                    </button>
                  </div>
                  <ProCredentials profile={data.profile} roleLabel={labelForRole(data.profile.role)} />
                </div>
              )}

              <div style={{ ...card, display: "flex", gap: 36, flexWrap: "wrap", marginTop: 20 }}>
                <Stat label="Υπόλοιπο" value={`${data.profile.wallet_balance}€`} />
                <Link
                  href={`/platform/admin/finance?phone=${encodeURIComponent(target.phone_number || "")}`}
                  style={{ alignSelf: "flex-end", fontSize: 12.5, color: colors.ink }}
                >
                  Φόρτωση υπολοίπου
                </Link>
                <Stat label="Τιμή/ημέρα" value={`${data.profile.price_per_day}€`} />
                <Stat
                  label="Βαθμίδα"
                  value={
                    data.profile.tier === "high"
                      ? "Υψηλή"
                      : data.profile.tier === "low"
                      ? "Χαμηλή"
                      : "Μεσαία"
                  }
                />
                <Stat
                  label="Αξιοπιστία"
                  value={
                    data.profile.reliability_percentage != null
                      ? `${data.profile.reliability_percentage}%`
                      : "—"
                  }
                />
                <Stat label="Έγκριση" value={STATUS_LABEL[data.profile.approval_status] || data.profile.approval_status} />
                <div style={{ flexBasis: "100%" }}>
                  <Stars rating={data.profile.rating_avg} count={data.profile.rating_count ?? 0} />
                </div>
              </div>

              <h2 style={h2}>Προφίλ</h2>
              <div style={card}>
                <p style={{ ...muted, margin: "0 0 6px" }}>Χαρακτηριστικά που βλέπει ο πελάτης</p>
                <Chips
                  items={computeCrewHighlights(data.profile, { languageCount: data.languages.length })}
                />

                <p style={{ ...muted, margin: "16px 0 6px" }}>Γλώσσες</p>
                <Chips items={data.languages} />

                <p style={{ ...muted, margin: "16px 0 6px" }}>Τύποι σκαφών</p>
                <Chips items={data.boatTypes} />
              </div>

              {/* Positive declarations, so an empty list means "findable
                  nowhere" — the opposite of what the old blackout view here
                  claimed. Ports are per window now, not one global list. */}
              <h2 style={h2}>Διαθεσιμότητα ({data.availability.length})</h2>
              {data.availability.length === 0 && (
                <p style={muted}>Καμία δηλωμένη περίοδος, άρα δεν εμφανίζεται σε αναζητήσεις.</p>
              )}
              {data.availability.map((w) => (
                <div key={w.id} style={card}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    <span style={money}>{formatDate(w.start_date)}</span> → <span style={money}>{formatDate(w.end_date)}</span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Chips
                      items={(w.availability_window_regions || []).map((r) => r.regions?.name).filter(Boolean)}
                    />
                  </div>
                </div>
              ))}

              <h2 style={h2}>Αιτήματα που του στάλθηκαν ({data.pings.length})</h2>
              {data.pings.length === 0 && <p style={muted}>Κανένα.</p>}
              {data.pings.map((p) => (
                <Row
                  key={p.id}
                  left={
                    <>
                      {departureLabel(p.booking_requests)} ·{" "}
                      <span style={money}>{formatDate(p.booking_requests?.start_date)}</span> →{" "}
                      <span style={money}>{formatDate(p.booking_requests?.end_date)}</span>
                    </>
                  }
                  right={p.status}
                />
              ))}

              <h2 style={h2}>Κρατήσεις ({data.bookings.length})</h2>
              {data.bookings.length === 0 && <p style={muted}>Καμία κράτηση.</p>}
              {data.bookings.map((b) => (
                <Row
                  key={b.id}
                  left={
                    <>
                      {departureLabel(b)} · <span style={money}>{formatDate(b.start_date)}</span> →{" "}
                      <span style={money}>{formatDate(b.end_date)}</span>
                    </>
                  }
                  right={b.status}
                  tone={b.status === "confirmed" || b.status === "completed" ? "success" : "neutral"}
                />
              ))}
            </>
          )}

          {data?.wallet?.length > 0 && (
            <>
              <h2 style={h2}>Κινήσεις πορτοφολιού</h2>
              {data.wallet.map((w) => (
                <Row
                  key={w.id}
                  left={
                    <>
                      <span style={money}>{formatDate(w.created_at?.slice(0, 10))}</span> · {WALLET_TYPE_LABEL[w.type] || w.type}
                    </>
                  }
                  right={`${w.amount > 0 ? "+" : ""}${w.amount}€`}
                  tone={w.amount > 0 ? "success" : "neutral"}
                />
              ))}
            </>
          )}

          {target.role !== "admin" && target.status !== "deleted" && (
            <div style={{ ...card, marginTop: 28 }}>
              <b style={{ fontWeight: 600 }}>Κωδικός σύνδεσης</b>
              <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13.5 }}>
                Αν ο χρήστης ξέχασε τον κωδικό του ή κλειδώθηκε από λάθος προσπάθειες, δώσ' του έναν προσωρινό.
                Ξεκλειδώνει και τον λογαριασμό.
              </p>
              {tempPin ? (
                <div style={{ padding: "12px 14px", background: "#EAF2EE", borderRadius: 10, fontSize: 13.5 }}>
                  Προσωρινός κωδικός: <b style={{ ...money, fontSize: 20, letterSpacing: "0.08em" }}>{tempPin}</b>
                  <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
                    Πες τον στον χρήστη τηλεφωνικά (<span style={money}>{target.phone_number}</span>). Μόλις μπει, να
                    τον αλλάξει από «Το προφίλ μου», «Αλλαγή κωδικού». Δεν θα ξαναεμφανιστεί εδώ.
                  </p>
                </div>
              ) : (
                <button style={button("secondary")} disabled={actionBusy} onClick={handleResetPin}>
                  Νέος προσωρινός κωδικός
                </button>
              )}
            </div>
          )}

          {/* Moved down from the very top of the page, where a one-tap
              checkbox granting full admin rights sat above the person's name. */}
          {target.status !== "deleted" && (
            <div style={{ ...card, marginTop: 28 }}>
              <b style={{ fontWeight: 600 }}>Προχωρημένες ρυθμίσεις</b>
              <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13 }}>Σπάνια χρειάζονται και ζητούν επιβεβαίωση.</p>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(target.is_test_account)}
                  disabled={actionBusy || target.role === "admin"}
                  onChange={handleToggleTestAccount}
                  style={{ marginTop: 3 }}
                />
                <span>
                  Λογαριασμός δοκιμών
                  <span style={{ ...muted, display: "block", fontSize: 12.5 }}>
                    Μόνο για ψεύτικους λογαριασμούς. Επιτρέπει «Σύνδεση ως» (αλλάζει τον κωδικό του).
                  </span>
                </span>
              </label>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, cursor: "pointer", marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={Boolean(target.is_staff_admin)}
                  disabled={actionBusy || target.role === "admin"}
                  onChange={handleToggleStaffAdmin}
                  style={{ marginTop: 3 }}
                />
                <span>
                  Δικαιώματα διαχειριστή
                  <span style={{ ...muted, display: "block", fontSize: 12.5 }}>
                    Μπαίνει και σε αυτή τη διαχείριση με το ίδιο τηλέφωνο και κωδικό. Μόνο για άτομο εμπιστοσύνης.
                  </span>
                </span>
              </label>
            </div>
          )}

          {target.status === "deleted" ? (
            <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.danger}` }}>
              <b style={{ fontWeight: 600 }}>Διαγραμμένος λογαριασμός</b>
              <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13.5 }}>
                {target.deleted_at && <>Διαγράφηκε: {formatDateTime(target.deleted_at)}<br /></>}
                {target.deletion_reason && <>Λόγος: {target.deletion_reason}<br /></>}
                Δεν μπορεί να συνδεθεί και δεν φαίνεται πουθενά στην πλατφόρμα. Τίποτα δεν έχει σβηστεί.
              </p>
              <button style={button("primary")} disabled={actionBusy} onClick={handleRestoreAccount}>
                {actionBusy ? "…" : "Επαναφορά λογαριασμού"}
              </button>
            </div>
          ) : (
            <>
              {target.status === "suspended" ? (
                <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
                  <b style={{ fontWeight: 600 }}>Σε αναστολή</b>
                  <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13.5 }}>
                    {target.suspension_reason || "(χωρίς καταγεγραμμένο λόγο)"}
                  </p>
                  <button style={{ ...button("primary") }} disabled={actionBusy} onClick={handleReactivate}>
                    {actionBusy ? "…" : "Επαναφορά"}
                  </button>
                </div>
              ) : (
                target.role !== "admin" &&
                !target.is_staff_admin && (
                  <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
                    <b style={{ fontWeight: 600 }}>Αναστολή λογαριασμού</b>
                    <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13.5 }}>
                      Προσωρινό «πάγωμα»: δεν μπορεί να συνδεθεί και δεν εμφανίζεται σε αναζητήσεις, μέχρι να τον
                      επαναφέρεις. Βλέπεις τον λόγο σε κάθε λίστα, για να μην ξεχαστεί.
                    </p>
                    {showSuspendForm ? (
                      <form onSubmit={handleSuspend}>
                        <textarea
                          required
                          rows={2}
                          placeholder="Λόγος αναστολής"
                          value={suspendReason}
                          onChange={(e) => setSuspendReason(e.target.value)}
                          style={{
                            width: "100%",
                            fontFamily: "inherit",
                            fontSize: 13.5,
                            padding: 8,
                            borderRadius: 8,
                            border: `1px solid ${colors.border}`,
                            marginBottom: 8,
                            boxSizing: "border-box",
                          }}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="submit" style={{ ...button("primary") }} disabled={actionBusy}>
                            {actionBusy ? "…" : "Επιβεβαίωση αναστολής"}
                          </button>
                          <button
                            type="button"
                            style={{ ...button("secondary") }}
                            onClick={() => {
                              setShowSuspendForm(false);
                              setSuspendReason("");
                              setActionError("");
                            }}
                          >
                            Άκυρο
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button style={{ ...button("secondary") }} onClick={() => setShowSuspendForm(true)}>
                        Αναστολή
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Any account except the main admin and yourself (0087). */}
              {target.role !== "admin" && target.id !== userRow?.id && (
                <div style={{ ...card, marginTop: 12, borderLeft: `3px solid ${colors.danger}` }}>
                  <b style={{ fontWeight: 600 }}>Διαγραφή λογαριασμού</b>
                  <p style={{ ...muted, margin: "6px 0 12px", fontSize: 13.5 }}>
                    Ο λογαριασμός κρύβεται από την πλατφόρμα και δεν μπορεί να συνδεθεί. Τίποτα δεν σβήνεται
                    (ιστορικό, αξιολογήσεις, υπόλοιπο) και μπορείς να τον επαναφέρεις από εδώ όποτε θελήσεις.
                    Τα ανοιχτά του αιτήματα ακυρώνονται με επιστροφή χρημάτων.
                  </p>
                  {deletionImpact().some((l) => l.startsWith("ΠΡΟΣΟΧΗ")) && (
                    <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 10px" }}>
                      {deletionImpact().find((l) => l.startsWith("ΠΡΟΣΟΧΗ"))}
                    </p>
                  )}
                  <input
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Λόγος (προαιρετικό)"
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: 13,
                      fontFamily: "inherit",
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      boxSizing: "border-box",
                      marginBottom: 10,
                    }}
                  />
                  <button
                    style={{ ...button("primary"), background: colors.danger, borderColor: colors.danger }}
                    disabled={actionBusy}
                    onClick={handleDeleteAccount}
                  >
                    {actionBusy ? "…" : "Διαγραφή λογαριασμού"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {confirmDialog}
    </div>
  );
}

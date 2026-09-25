"use client";
import { useState } from "react";
import { Panel, ProCredentials, colors, muted, button, VERIFY_HINT } from "../../ui";
import { badge } from "../../../../../lib/platform/theme";
import { labelForRole } from "../../../../../lib/platform/roles";
import {
  adminVerifyUser,
  adminApproveSkipper,
  adminRejectSkipper,
  adminSuspendAccount,
  adminReactivateAccount,
  adminDeleteAccount,
  adminRestoreAccount,
  adminSetTestAccount,
  adminSetStaffAdmin,
} from "../../../../../lib/platform/db";
import { formatDateTime } from "../../../../../lib/platform/notifications";
import { Hint, fieldInput, errorLabel } from "./shared";

// Ό,τι αλλάζει την κατάσταση του λογαριασμού — ξεχωριστά από τα «Στοιχεία &
// πρόσβαση», που μόνο διορθώνουν. Οι επικίνδυνες ενέργειες περνούν πάντα από
// confirm(), και ό,τι χρειάζεται λόγο τον ζητά πριν προχωρήσει.
export default function ActionsTab({ data, id, reload, confirm, viewerId }) {
  const u = data.user;
  const sp = data.skipper_profile;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [rejectNote, setRejectNote] = useState("");
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const name = u.full_name || u.phone_number;

  async function run(fn, successMsg) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fn();
      await reload();
      if (successMsg) setNotice(successMsg);
      return res;
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    await run(() => adminVerifyUser(id), "Ο λογαριασμός επαληθεύτηκε και ο χρήστης ειδοποιήθηκε.");
  }

  async function handleApprove() {
    await run(() => adminApproveSkipper(id), "Το προφίλ εγκρίθηκε και εμφανίζεται πλέον στις αναζητήσεις.");
  }

  async function handleReject(isRevoke) {
    const msg = isRevoke
      ? `${name}: ανάκληση της έγκρισης; Δεν θα εμφανίζεται πλέον σε αναζητήσεις μέχρι να εγκριθεί ξανά.`
      : `${name}: απόρριψη του προφίλ;`;
    if (!(await confirm(msg))) return;
    await run(async () => {
      await adminRejectSkipper(id, rejectNote.trim() || null);
      setRejectNote("");
    }, isRevoke ? "Η έγκριση ανακλήθηκε." : "Το προφίλ απορρίφθηκε.");
  }

  async function handleSuspend(e) {
    e.preventDefault();
    if (!suspendReason.trim()) {
      setError("Χρειάζεται λόγος για την αναστολή.");
      return;
    }
    await run(async () => {
      await adminSuspendAccount(id, suspendReason);
      setSuspendReason("");
      setShowSuspendForm(false);
    });
  }

  async function handleReactivate() {
    await run(() => adminReactivateAccount(id));
  }

  function deletionImpact() {
    const today = new Date().toISOString().slice(0, 10);
    const openReqs = (data.requests || []).filter((r) => r.status === "open").length;
    const pendingPings = (data.pings || []).filter((p) => p.status === "pending").length;
    const upcoming = [...(data.bookings_client || []), ...(data.bookings_pro || [])].filter(
      (b) => b.status === "confirmed" && b.end_date >= today
    ).length;
    const lines = [];
    if (openReqs > 0)
      lines.push(`${openReqs === 1 ? "Το 1 ανοιχτό αίτημά του ακυρώνεται" : `Τα ${openReqs} ανοιχτά αιτήματά του ακυρώνονται`} και το τέλος επιστρέφεται ως credit.`);
    if (pendingPings > 0)
      lines.push(`Αφαιρείται από ${pendingPings === 1 ? "1 αίτημα" : `${pendingPings} αιτήματα`} που περίμεναν απάντησή του.`);
    if (upcoming > 0)
      lines.push(`ΠΡΟΣΟΧΗ: ${upcoming === 1 ? "η 1 επιβεβαιωμένη κράτησή του ΔΕΝ ακυρώνεται" : `οι ${upcoming} επιβεβαιωμένες κρατήσεις του ΔΕΝ ακυρώνονται`}. Αν χρειάζεται, τακτοποίησέ τες ξεχωριστά.`);
    return lines;
  }

  async function handleDelete() {
    const impact = deletionImpact();
    const ok = await confirm(
      `${name}: διαγραφή λογαριασμού; Δεν θα μπορεί να συνδεθεί και κρύβεται από την πλατφόρμα. Τίποτα δεν σβήνεται και μπορείς να τον επαναφέρεις από αυτή τη σελίδα όποτε θελήσεις.` +
        (impact.length ? `\n\n${impact.join("\n")}` : "")
    );
    if (!ok) return;
    const res = await run(() => adminDeleteAccount(id, deleteReason.trim() || null));
    if (res) {
      setDeleteReason("");
      setNotice(
        "Ο λογαριασμός διαγράφηκε." +
          (res.cancelled_requests > 0
            ? ` ${res.cancelled_requests === 1 ? "Ακυρώθηκε 1 ανοιχτό αίτημα" : `Ακυρώθηκαν ${res.cancelled_requests} ανοιχτά αιτήματα`} και επιστράφηκαν ${res.refunded}€ ως credit.`
            : "") +
          " Μπορείς να τον επαναφέρεις από κάτω."
      );
    }
  }

  async function handleRestore() {
    if (!(await confirm(`${name}: επαναφορά λογαριασμού; Θα μπορεί ξανά να συνδέεται και θα ειδοποιηθεί.`, { tone: "primary" }))) return;
    await run(() => adminRestoreAccount(id), "Ο λογαριασμός επανήλθε και ο χρήστης ειδοποιήθηκε.");
  }

  async function handleToggleTestAccount() {
    if (
      !u.is_test_account &&
      !(await confirm(`${name}: να σημειωθεί ως λογαριασμός δοκιμών; Μόνο για ψεύτικους λογαριασμούς δοκιμών, ποτέ για πραγματικό πελάτη.`))
    )
      return;
    await run(() => adminSetTestAccount(id, !u.is_test_account));
  }

  async function handleToggleStaffAdmin() {
    const ok = await confirm(
      u.is_staff_admin
        ? `${name}: αφαίρεση των δικαιωμάτων διαχειριστή;`
        : `${name}: να δοθούν δικαιώματα διαχειριστή; Θα βλέπει και θα αλλάζει τα πάντα εδώ: χρήστες, χρήματα, ρυθμίσεις. Δώσ' τα μόνο σε άτομο που εμπιστεύεσαι απόλυτα.`
    );
    if (!ok) return;
    await run(() => adminSetStaffAdmin(id, !u.is_staff_admin));
  }

  return (
    <>
      {error && <p style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{error}</p>}
      {notice && <p style={{ color: colors.success, fontSize: 13, marginBottom: 10 }}>{notice}</p>}

      {!u.phone_verified_at && u.role !== "admin" && u.status !== "deleted" && (
        <Panel title="Επαλήθευση λογαριασμού">
          <Hint>{VERIFY_HINT}</Hint>
          <button style={button("primary")} disabled={busy} onClick={handleVerify}>
            {busy ? "…" : "Επαλήθευση"}
          </button>
        </Panel>
      )}

      {sp && (sp.approval_status === "pending" || sp.approval_status === "rejected") && (
        <Panel title={sp.approval_status === "pending" ? "Έγκριση επαγγελματία" : "Προφίλ απορριφθέν"}>
          <Hint>Έλεγξε ότι το δίπλωμα και η εμπειρία ταιριάζουν με την ιδιότητα. Με την έγκριση ο επαγγελματίας εμφανίζεται στις αναζητήσεις.</Hint>
          <ProCredentials profile={sp} roleLabel={labelForRole(sp.role)} />
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button style={button("primary")} disabled={busy} onClick={handleApprove}>
              {busy ? "…" : "Έγκριση"}
            </button>
            {sp.approval_status === "pending" && (
              <button style={button("secondary")} disabled={busy} onClick={() => handleReject(false)}>
                {busy ? "…" : "Απόρριψη"}
              </button>
            )}
          </div>
          {sp.approval_status === "pending" && (
            <input
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Λόγος απόρριψης (προαιρετικό)"
              style={{ ...fieldInput, marginTop: 10 }}
            />
          )}
        </Panel>
      )}

      {sp && sp.approval_status === "approved" && (
        <Panel title="Έγκριση επαγγελματία">
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <span style={badge("success")}>Εγκεκριμένο</span>
            <button style={button("secondary")} disabled={busy} onClick={() => handleReject(true)}>
              {busy ? "…" : "Ανάκληση έγκρισης"}
            </button>
          </div>
        </Panel>
      )}

      {u.status === "deleted" ? (
        <Panel title="Διαγραμμένος λογαριασμός">
          <Hint>
            {u.deleted_at && <>Διαγράφηκε: {formatDateTime(u.deleted_at)}<br /></>}
            {u.deletion_reason && <>Λόγος: {u.deletion_reason}<br /></>}
            Δεν μπορεί να συνδεθεί και δεν φαίνεται πουθενά στην πλατφόρμα. Τίποτα δεν έχει σβηστεί.
          </Hint>
          <button style={button("primary")} disabled={busy} onClick={handleRestore}>
            {busy ? "…" : "Επαναφορά λογαριασμού"}
          </button>
        </Panel>
      ) : (
        <>
          {u.status === "suspended" ? (
            <Panel title="Σε αναστολή">
              <Hint>{u.suspension_reason || "(χωρίς καταγεγραμμένο λόγο)"}</Hint>
              <button style={button("primary")} disabled={busy} onClick={handleReactivate}>
                {busy ? "…" : "Επαναφορά"}
              </button>
            </Panel>
          ) : (
            u.role !== "admin" &&
            !u.is_staff_admin && (
              <Panel title="Αναστολή λογαριασμού">
                <Hint>
                  Προσωρινό «πάγωμα»: δεν μπορεί να συνδεθεί και δεν εμφανίζεται σε αναζητήσεις, μέχρι να τον επαναφέρεις.
                </Hint>
                {showSuspendForm ? (
                  <form onSubmit={handleSuspend}>
                    <textarea
                      required
                      rows={2}
                      placeholder="Λόγος αναστολής"
                      value={suspendReason}
                      onChange={(e) => setSuspendReason(e.target.value)}
                      style={{ ...fieldInput, marginBottom: 8, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="submit" style={button("primary")} disabled={busy}>
                        {busy ? "…" : "Επιβεβαίωση αναστολής"}
                      </button>
                      <button
                        type="button"
                        style={button("secondary")}
                        onClick={() => {
                          setShowSuspendForm(false);
                          setSuspendReason("");
                          setError("");
                        }}
                      >
                        Άκυρο
                      </button>
                    </div>
                  </form>
                ) : (
                  <button style={button("secondary")} onClick={() => setShowSuspendForm(true)}>
                    Αναστολή
                  </button>
                )}
              </Panel>
            )
          )}

          {u.role !== "admin" && u.id !== viewerId && (
            <Panel title="Διαγραφή λογαριασμού">
              <Hint>
                Ο λογαριασμός κρύβεται από την πλατφόρμα και δεν μπορεί να συνδεθεί. Τίποτα δεν σβήνεται (ιστορικό,
                αξιολογήσεις, υπόλοιπο) και μπορείς να τον επαναφέρεις από εδώ όποτε θελήσεις. Τα ανοιχτά του αιτήματα
                ακυρώνονται με επιστροφή χρημάτων.
              </Hint>
              {deletionImpact().some((l) => l.startsWith("ΠΡΟΣΟΧΗ")) && (
                <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 10px" }}>
                  {deletionImpact().find((l) => l.startsWith("ΠΡΟΣΟΧΗ"))}
                </p>
              )}
              <input
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Λόγος (προαιρετικό)"
                style={{ ...fieldInput, marginBottom: 10 }}
              />
              <button style={{ ...button("primary"), background: colors.danger, borderColor: colors.danger }} disabled={busy} onClick={handleDelete}>
                {busy ? "…" : "Διαγραφή λογαριασμού"}
              </button>
            </Panel>
          )}
        </>
      )}

      {u.status !== "deleted" && (
        <Panel title="Προχωρημένες ρυθμίσεις" subtitle="Σπάνια χρειάζονται και ζητούν επιβεβαίωση.">
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={Boolean(u.is_test_account)}
              disabled={busy || u.role === "admin"}
              onChange={handleToggleTestAccount}
              style={{ marginTop: 3 }}
            />
            <span>
              Λογαριασμός δοκιμών
              <span style={{ ...muted, display: "block", fontSize: 12.5 }}>Μόνο για ψεύτικους λογαριασμούς.</span>
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13.5, cursor: "pointer", marginTop: 12 }}>
            <input
              type="checkbox"
              checked={Boolean(u.is_staff_admin)}
              disabled={busy || u.role === "admin"}
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
        </Panel>
      )}
    </>
  );
}

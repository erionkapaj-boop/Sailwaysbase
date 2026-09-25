"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import { Panel, RowMain, Empty, colors, muted, money, button, ProCredentials, VERIFY_HINT, STATUS_LABEL, waitingFor, safeImageUrl } from "../ui";
import {
  adminListAccounts,
  adminVerifyUser,
  adminListPendingSkippers,
  adminApproveSkipper,
  adminRejectSkipper,
  adminListPendingSecondaryRoles,
  adminApproveSecondaryRole,
  adminRejectSecondaryRole,
  adminListPhotosToReview,
  adminApprovePhoto,
  adminClearPhoto,
} from "../../../../lib/platform/db";
import { labelForRole } from "../../../../lib/platform/roles";
import { useConfirm } from "../../components/ConfirmDialog";

const noteInput = {
  width: "100%",
  marginTop: 10,
  padding: "8px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  boxSizing: "border-box",
  color: colors.ink,
  background: colors.bg,
};

const item = { borderBottom: `1px solid ${colors.border}`, padding: "14px 16px" };

function DetailsLink({ userId }) {
  return (
    <Link href={`/platform/admin/user/${userId}`} style={{ textDecoration: "none" }}>
      <span style={button("secondary")}>Στοιχεία</span>
    </Link>
  );
}

// Everything that is waiting on the admin, in one place. New-signup
// verification used to live as a tab inside Χρήστες while professional
// approval had its own page — two kinds of "approval" in two places, and
// after two weeks away it wasn't clear which was which.
export default function PendingPage() {
  const refreshCounts = useRefreshAdminCounts();
  const [confirm, confirmDialog] = useConfirm();
  const [signups, setSignups] = useState([]);
  const [pros, setPros] = useState([]);
  const [roles, setRoles] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState({});
  const [merged, setMerged] = useState(null);

  async function load() {
    const [a, b, c, d] = await Promise.allSettled([
      adminListAccounts({ pendingVerificationOnly: true, sort: "recent" }),
      adminListPendingSkippers(),
      adminListPendingSecondaryRoles(),
      adminListPhotosToReview(),
    ]);
    if (a.status === "fulfilled") setSignups(a.value);
    if (b.status === "fulfilled") setPros(b.value);
    if (c.status === "fulfilled") setRoles(c.value);
    if (d.status === "fulfilled") setPhotos(d.value);
    const failed = [a, b, c, d].find((r) => r.status === "rejected");
    if (failed) setError(failed.reason?.message || String(failed.reason));
    setLoaded(true);
  }
  useEffect(() => {
    load();
  }, []);

  async function run(id, fn, message) {
    setBusyId(id);
    setError("");
    setNotice("");
    setMerged(null);
    try {
      const result = await fn();
      await load();
      refreshCounts();
      setNotice(message);
      return result;
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyId(null);
    }
  }

  const verify = (u) =>
    run(u.id, () => adminVerifyUser(u.id), `${u.full_name || u.phone_number}: επαληθεύτηκε και ειδοποιήθηκε.`);

  async function approvePro(s) {
    const result = await run(
      s.user_id,
      () => adminApproveSkipper(s.user_id),
      `${s.full_name || "Ο επαγγελματίας"}: εγκρίθηκε και εμφανίζεται πλέον στις αναζητήσεις.`
    );
    // The approval merges a returning professional back onto their old
    // history when it recognises them — worth saying, since their numbers
    // will suddenly not be zero.
    if (result?.completed_bookings_count > 0) setMerged(result);
  }

  async function rejectPro(s) {
    if (!(await confirm(`${s.full_name || "Επαγγελματίας"}: απόρριψη του προφίλ;`))) return;
    run(s.user_id, () => adminRejectSkipper(s.user_id, notes[s.user_id] || null), `${s.full_name || "Το προφίλ"}: απορρίφθηκε.`);
  }

  const approveRole = (r) =>
    run(r.id, () => adminApproveSecondaryRole(r.id), `${r.full_name}: εγκρίθηκε ως ${labelForRole(r.role)}.`);

  async function rejectRole(r) {
    if (!(await confirm(`${r.full_name}: απόρριψη της ιδιότητας ${labelForRole(r.role)};`))) return;
    run(r.id, () => adminRejectSecondaryRole(r.id, notes[r.id] || null), `${r.full_name}: η ιδιότητα απορρίφθηκε.`);
  }

  const approvePhoto = (p) => run(`photo-${p.user_id}`, () => adminApprovePhoto(p.user_id), `${p.full_name || "Φωτογραφία"}: εγκρίθηκε.`);

  async function removePhoto(p) {
    if (!(await confirm(`${p.full_name || "Χρήστης"}: αφαίρεση φωτογραφίας; Ειδοποιείται με τον λόγο και μπορεί να ανεβάσει νέα.`))) return;
    run(`photo-${p.user_id}`, () => adminClearPhoto(p.user_id, notes[`photo-${p.user_id}`] || ""), `${p.full_name || "Φωτογραφία"}: αφαιρέθηκε.`);
  }

  const total = signups.length + pros.length + roles.length + photos.length;

  return (
    <AdminShell
      title="Εκκρεμότητες"
      subtitle={
        !loaded ? "Φόρτωση…" : total === 0 ? "Τίποτα δεν περιμένει εσένα αυτή τη στιγμή." : `${total} περιμένουν απόφασή σου.`
      }
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
      {notice && (
        <div
          style={{
            background: "#EAF2EE",
            border: `1px solid ${colors.success}`,
            borderRadius: 10,
            padding: "12px 14px",
            marginBottom: 14,
            fontSize: 13.5,
          }}
        >
          {notice}
          {merged && (
            <>
              {" "}
              Συνδέθηκε με παλιό ιστορικό: <b style={money}>{merged.completed_bookings_count}</b> ολοκληρωμένες κρατήσεις.
            </>
          )}
        </div>
      )}

      <Panel
        title={`Νέες εγγραφές για επαλήθευση (${signups.length})`}
        subtitle={signups.length > 0 ? VERIFY_HINT : undefined}
        padded={false}
      >
        {loaded && signups.length === 0 && <Empty>Καμία νέα εγγραφή δεν περιμένει.</Empty>}
        {signups.map((u) => (
          <div key={u.id} style={item}>
            <RowMain
              title={u.full_name || "(χωρίς όνομα)"}
              meta={
                <>
                  <span style={money}>{u.phone_number}</span>
                  {u.email ? ` · ${u.email}` : ""}
                  <br />
                  {u.role === "skipper" ? `Επαγγελματίας${u.crew_role ? ` (${labelForRole(u.crew_role)})` : ""}` : STATUS_LABEL[u.role] || u.role}
                  {" · "}
                  <span style={{ color: colors.warn }}>{waitingFor(u.created_at)}</span>
                </>
              }
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button style={button("primary")} disabled={busyId === u.id} onClick={() => verify(u)}>
                {busyId === u.id ? "…" : "Επαλήθευση"}
              </button>
              <DetailsLink userId={u.id} />
            </div>
          </div>
        ))}
      </Panel>

      <Panel
        title={`Επαγγελματίες για έγκριση (${pros.length})`}
        subtitle={
          pros.length > 0
            ? "Έλεγξε ότι το δίπλωμα και η εμπειρία ταιριάζουν με την ιδιότητα. Μέχρι να εγκριθούν δεν εμφανίζονται σε καμία αναζήτηση."
            : undefined
        }
        padded={false}
      >
        {loaded && pros.length === 0 && <Empty>Κανένας επαγγελματίας δεν περιμένει έγκριση.</Empty>}
        {pros.map((s) => (
          <div key={s.id} style={item}>
            <RowMain
              title={s.full_name || "(χωρίς όνομα)"}
              meta={
                <>
                  <span style={money}>{s.users?.phone_number}</span>
                  {" · "}
                  <span style={{ color: colors.warn }}>{waitingFor(s.created_at)}</span>
                </>
              }
            />
            <div style={{ margin: "10px 0 0" }}>
              <ProCredentials profile={s} roleLabel={labelForRole(s.role)} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={button("primary")} disabled={busyId === s.user_id} onClick={() => approvePro(s)}>
                {busyId === s.user_id ? "…" : "Έγκριση"}
              </button>
              <button style={button("secondary")} disabled={busyId === s.user_id} onClick={() => rejectPro(s)}>
                Απόρριψη
              </button>
              <DetailsLink userId={s.user_id} />
            </div>
            <input
              placeholder="Λόγος απόρριψης (προαιρετικό, καταγράφεται)"
              value={notes[s.user_id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [s.user_id]: e.target.value }))}
              style={noteInput}
            />
          </div>
        ))}
      </Panel>

      <Panel
        title={`Επιπλέον ιδιότητες για έγκριση (${roles.length})`}
        subtitle={
          roles.length > 0
            ? "Ήδη εγκεκριμένοι επαγγελματίες που ζήτησαν να προσφέρουν και άλλη ιδιότητα (π.χ. skipper που θέλει να δουλεύει και ως cook)."
            : undefined
        }
        padded={false}
      >
        {loaded && roles.length === 0 && <Empty>Καμία εκκρεμής αίτηση.</Empty>}
        {roles.map((r) => (
          <div key={r.id} style={item}>
            <RowMain
              title={`${r.full_name || "Χωρίς όνομα"} · ζητά ${labelForRole(r.role)}`}
              meta={
                <>
                  <span style={money}>{r.phone_number}</span>
                  {" · "}
                  <span style={{ color: colors.warn }}>{waitingFor(r.created_at)}</span>
                </>
              }
            />
            <div style={{ margin: "10px 0 0" }}>
              <ProCredentials profile={r} roleLabel={labelForRole(r.role)} omit={["Ηλικία", "Φύλο"]} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={button("primary")} disabled={busyId === r.id} onClick={() => approveRole(r)}>
                {busyId === r.id ? "…" : "Έγκριση"}
              </button>
              <button style={button("secondary")} disabled={busyId === r.id} onClick={() => rejectRole(r)}>
                Απόρριψη
              </button>
            </div>
            <input
              placeholder="Λόγος απόρριψης (προαιρετικό, καταγράφεται)"
              value={notes[r.id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              style={noteInput}
            />
          </div>
        ))}
      </Panel>
      <Panel
        title={`Φωτογραφίες προς έλεγχο (${photos.length})`}
        subtitle={
          photos.length > 0
            ? "Νέες ή αλλαγμένες φωτογραφίες — φαίνονται ήδη στην εφαρμογή. Πάτα μία για πλήρες μέγεθος και έλεγξε αν δείχνει τηλέφωνο, email, site, social ή QR code."
            : undefined
        }
      >
        {loaded && photos.length === 0 && <Empty>Καμία φωτογραφία δεν περιμένει έλεγχο.</Empty>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
          {photos.map((p) => {
            const src = safeImageUrl(p.photo_url);
            const key = `photo-${p.user_id}`;
            return (
              <div key={p.user_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, minWidth: 0 }}>
                {src ? (
                  <a href={src} target="_blank" rel="noopener noreferrer" title="Άνοιγμα σε πλήρες μέγεθος">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Φωτογραφία: ${p.full_name || ""}`} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, display: "block" }} />
                  </a>
                ) : (
                  <p style={{ color: colors.danger, fontSize: 12.5, margin: 0 }}>Μη έγκυρη διεύθυνση — αφαίρεσέ τη.</p>
                )}
                <Link href={`/platform/admin/user/${p.user_id}`} style={{ display: "block", marginTop: 8, fontSize: 13.5, fontWeight: 500, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.full_name || "(χωρίς όνομα)"}
                </Link>
                <div style={{ ...muted, fontSize: 12 }}>
                  {p.role === "skipper" ? `Επαγγελματίας${p.crew_role ? ` · ${labelForRole(p.crew_role)}` : ""}` : "Πελάτης"}
                </div>
                <input
                  placeholder="Λόγος αφαίρεσης (τον βλέπει ο χρήστης)"
                  value={notes[key] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                  style={{ ...noteInput, marginTop: 8 }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button style={{ ...button("primary"), flex: 1, padding: "7px 10px", fontSize: 13 }} disabled={busyId === key} onClick={() => approvePhoto(p)}>
                    {busyId === key ? "…" : "Εντάξει"}
                  </button>
                  <button style={{ ...button("secondary"), flex: 1, padding: "7px 10px", fontSize: 13 }} disabled={busyId === key} onClick={() => removePhoto(p)}>
                    Αφαίρεση
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      {confirmDialog}
    </AdminShell>
  );
}

"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useLocalData } from "../../useLocalData";
import AdminShell, { useRefreshAdminCounts } from "../AdminShell";
import { Panel, Chip, IconDisc, colors, muted, money, button, ProCredentials, waitingFor, safeImageUrl } from "../ui";
import Avatar from "../../components/Avatar";
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

// Ποιος περιμένει: φωτογραφία, όνομα, σήμα ιδιότητας και πόση ώρα περιμένει.
function Who({ name, photo, phone, role, since }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Avatar src={safeImageUrl(photo)} name={name} size={44} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span data-user-text style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {role && <Chip tone="brand" icon="anchor">{role}</Chip>}
          {since && <Chip tone="warn" icon="clock">{waitingFor(since)}</Chip>}
          {phone && <span style={{ ...muted, fontSize: 12.5 }}><span style={money}>{phone}</span></span>}
        </span>
      </span>
    </div>
  );
}

function DetailsLink({ userId }) {
  const t = useTranslations("AdminApprovals");
  return (
    <Link href={`/platform/admin/user/${userId}`} style={{ textDecoration: "none" }}>
      <span style={button("secondary")}>{t("details")}</span>
    </Link>
  );
}

// Everything that is waiting on the admin, in one place. New-signup
// verification used to live as a tab inside Χρήστες while professional
// approval had its own page — two kinds of "approval" in two places, and
// after two weeks away it wasn't clear which was which.
export default function PendingPage() {
  const t = useTranslations("AdminApprovals");
  const L = useLocalData();
  const nm = (o) => L.person(o);
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
      setError(friendlyError(err));
    } finally {
      setBusyId(null);
    }
  }

  const verify = (u) =>
    run(u.id, () => adminVerifyUser(u.id), t("verified", { name: nm(u) || u.phone_number }));

  async function approvePro(s) {
    const result = await run(
      s.user_id,
      () => adminApproveSkipper(s.user_id),
      t("proApproved", { name: nm(s) || t("theProfessional") })
    );
    // The approval merges a returning professional back onto their old
    // history when it recognises them — worth saying, since their numbers
    // will suddenly not be zero.
    if (result?.completed_bookings_count > 0) setMerged(result);
  }

  async function rejectPro(s) {
    if (!(await confirm(t("confirmRejectPro", { name: nm(s) || t("professional") })))) return;
    run(s.user_id, () => adminRejectSkipper(s.user_id, notes[s.user_id] || null), t("proRejected", { name: nm(s) || t("theProfile") }));
  }

  const approveRole = (r) =>
    run(r.id, () => adminApproveSecondaryRole(r.id), t("roleApproved", { name: nm(r), role: labelForRole(r.role) }));

  async function rejectRole(r) {
    if (!(await confirm(t("confirmRejectRole", { name: nm(r), role: labelForRole(r.role) })))) return;
    run(r.id, () => adminRejectSecondaryRole(r.id, notes[r.id] || null), t("roleRejected", { name: nm(r) }));
  }

  const approvePhoto = (p) => run(`photo-${p.user_id}`, () => adminApprovePhoto(p.user_id), t("photoApproved", { name: nm(p) || t("photo") }));

  async function removePhoto(p) {
    if (!(await confirm(t("confirmRemovePhoto", { name: nm(p) || t("user") })))) return;
    run(`photo-${p.user_id}`, () => adminClearPhoto(p.user_id, notes[`photo-${p.user_id}`] || ""), t("photoRemoved", { name: nm(p) || t("photo") }));
  }

  const total = signups.length + pros.length + roles.length + photos.length;

  return (
    <AdminShell
      title={t("title")}
      subtitle={!loaded ? t("loading") : total > 0 ? t("waitingCount", { count: total }) : undefined}
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
              {t.rich("mergedHistory", { count: merged.completed_bookings_count, b: (c) => <b style={money}>{c}</b> })}
            </>
          )}
        </div>
      )}

      {signups.length > 0 && <Panel
        title={t("signupsTitle", { count: signups.length })}
        padded={false}
      >
        {signups.map((u) => (
          <div key={u.id} style={item}>
            <Who name={nm(u) || t("noName")} photo={u.photo_url} phone={u.phone_number} role={u.role === "skipper" ? (u.crew_role ? labelForRole(u.crew_role) : t("professional")) : null} since={u.created_at} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button style={button("primary")} disabled={busyId === u.id} onClick={() => verify(u)}>
                {busyId === u.id ? "…" : t("verify")}
              </button>
              <DetailsLink userId={u.id} />
            </div>
          </div>
        ))}
      </Panel>}

      {pros.length > 0 && <Panel
        title={t("prosTitle", { count: pros.length })}
        padded={false}
      >
        {pros.map((s) => (
          <div key={s.id} style={item}>
            <Who name={nm(s) || t("noName")} photo={s.photo_url} phone={s.users?.phone_number} role={labelForRole(s.role)} since={s.created_at} />
            <div style={{ margin: "10px 0 0" }}>
              <ProCredentials profile={s} roleLabel={labelForRole(s.role)} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={button("primary")} disabled={busyId === s.user_id} onClick={() => approvePro(s)}>
                {busyId === s.user_id ? "…" : t("approve")}
              </button>
              <button style={button("secondary")} disabled={busyId === s.user_id} onClick={() => rejectPro(s)}>
                {t("reject")}
              </button>
              <DetailsLink userId={s.user_id} />
            </div>
            <input
              placeholder={t("rejectReason")}
              value={notes[s.user_id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [s.user_id]: e.target.value }))}
              style={noteInput}
            />
          </div>
        ))}
      </Panel>}

      {roles.length > 0 && <Panel
        title={t("rolesTitle", { count: roles.length })}
        padded={false}
      >
        {roles.map((r) => (
          <div key={r.id} style={item}>
            <Who name={nm(r) || t("noNameShort")} photo={r.photo_url} phone={r.phone_number} role={labelForRole(r.role)} since={r.created_at} />
            <div style={{ margin: "10px 0 0" }}>
              <ProCredentials profile={r} roleLabel={labelForRole(r.role)} omit={["age", "gender"]} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button style={button("primary")} disabled={busyId === r.id} onClick={() => approveRole(r)}>
                {busyId === r.id ? "…" : t("approve")}
              </button>
              <button style={button("secondary")} disabled={busyId === r.id} onClick={() => rejectRole(r)}>
                {t("reject")}
              </button>
            </div>
            <input
              placeholder={t("rejectReason")}
              value={notes[r.id] || ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              style={noteInput}
            />
          </div>
        ))}
      </Panel>}
      {photos.length > 0 && <Panel
        title={t("photosTitle", { count: photos.length })}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
          {photos.map((p) => {
            const src = safeImageUrl(p.photo_url);
            const key = `photo-${p.user_id}`;
            return (
              <div key={p.user_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 12, padding: 10, minWidth: 0 }}>
                {src ? (
                  <a href={src} target="_blank" rel="noopener noreferrer" title={t("openFullSize")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={t("photoAlt", { name: nm(p) || "" })} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, display: "block" }} />
                  </a>
                ) : (
                  <p style={{ color: colors.danger, fontSize: 12.5, margin: 0 }}>{t("invalidUrl")}</p>
                )}
                <Link href={`/platform/admin/user/${p.user_id}`} style={{ display: "block", marginTop: 8, fontSize: 13.5, fontWeight: 500, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nm(p) || t("noName")}
                </Link>
                <div style={{ ...muted, fontSize: 12 }}>
                  {p.role === "skipper" ? (p.crew_role ? t("professionalDotRole", { role: labelForRole(p.crew_role) }) : t("professional")) : t("client")}
                </div>
                <input
                  placeholder={t("internalNote")}
                  value={notes[key] || ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [key]: e.target.value }))}
                  style={{ ...noteInput, marginTop: 8 }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button style={{ ...button("primary"), flex: 1, padding: "7px 10px", fontSize: 13 }} disabled={busyId === key} onClick={() => approvePhoto(p)}>
                    {busyId === key ? "…" : t("ok")}
                  </button>
                  <button style={{ ...button("secondary"), flex: 1, padding: "7px 10px", fontSize: 13 }} disabled={busyId === key} onClick={() => removePhoto(p)}>
                    {t("remove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>}
      {loaded && total === 0 && (
        <div data-approvals-clear style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 16px" }}>
          <IconDisc icon="check" tone="success" size={64} />
          <span style={{ ...muted, fontSize: 14 }}>{t("nothingWaiting")}</span>
        </div>
      )}
      {confirmDialog}
    </AdminShell>
  );
}

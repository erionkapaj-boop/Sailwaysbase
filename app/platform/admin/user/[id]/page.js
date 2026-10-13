"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "../../../useFormat";
import { useLocalData } from "../../../useLocalData";
import AdminShell from "../../AdminShell";
import { useAuth } from "../../../AuthContext";
import BackButton from "../../../components/BackButton";
import { useConfirm } from "../../../components/ConfirmDialog";
import { adminAccountDetail, adminVerifyUser, adminResetPin } from "../../../../../lib/platform/db";
import { labelForRole } from "../../../../../lib/platform/roles";
import { Status, colors, muted, button, money } from "../../ui";
import { badge } from "../../../../../lib/platform/theme";
import { TAB_DEFS, TabBar, Avatar, useErrorLabel } from "./shared";
import OverviewTab from "./OverviewTab";
import ProfileTab from "./ProfileTab";
import BookingsTab from "./BookingsTab";
import AvailabilityTab from "./AvailabilityTab";
import FinanceTab from "./FinanceTab";
import ActionsTab from "./ActionsTab";
import HistoryTab from "./HistoryTab";

const TAB_COMPONENTS = {
  overview: OverviewTab,
  profile: ProfileTab,
  bookings: BookingsTab,
  availability: AvailabilityTab,
  finance: FinanceTab,
  actions: ActionsTab,
  history: HistoryTab,
};

// Ό,τι χρειάζεται προσοχή, σε μία στοίβα ψηλά στη σελίδα — αυτό απαντά αμέσως
// στο "υπάρχει πρόβλημα;" χωρίς να χρειάζεται ο admin να ψάξει καρτέλα-καρτέλα.
function IssueRow({ tone, text, onFix, fixLabel, onView, userText }) {
  const t = useTranslations("AdminUser");
  const toneColor = tone === "danger" ? colors.danger : colors.warn;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 14px",
        marginBottom: 6,
        borderRadius: 10,
        border: `1px solid ${toneColor}33`,
        background: tone === "danger" ? "#F7EDEB" : "#F7F0E2",
      }}
    >
      <span {...(userText ? { "data-user-text": "" } : {})} style={{ fontSize: 13.5, color: colors.ink }}>{text}</span>
      <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {onFix && (
          <button type="button" style={{ ...button("primary"), padding: "5px 10px", fontSize: 12 }} onClick={onFix}>
            {fixLabel}
          </button>
        )}
        {onView && (
          <button type="button" style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }} onClick={onView}>
            {t("view")}
          </button>
        )}
      </span>
    </div>
  );
}

function AdminUserInner() {
  const t = useTranslations("AdminUser");
  const f = useFormat();
  const L = useLocalData();
  const errorLabel = useErrorLabel();
  const personName = (p) => L.person(p);
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, userRow, loading, startViewAs } = useAuth();
  const [confirm, confirmDialog] = useConfirm();

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState(TAB_DEFS.some((x) => x.key === tabParam) ? tabParam : "overview");

  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [tempPin, setTempPin] = useState(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await adminAccountDetail(id));
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || (userRow?.role !== "admin" && !userRow?.is_staff_admin && !userRow?.is_owner)) return;
    load();
  }, [id, userRow, load]);

  // Το προσωρινό PIN ΔΕΝ καθαρίζει εδώ: εμφανίζεται μόνο μία φορά, κι ένα
  // κλικ σε καρτέλα πριν το διαβάσει ο admin θα απαιτούσε νέο reset.
  function goTab(key) {
    setTab(key);
    router.replace(`/platform/admin/user/${id}?tab=${key}`, { scroll: false });
  }

  async function handleQuickVerify() {
    setQuickBusy(true);
    setQuickError("");
    try {
      await adminVerifyUser(id);
      await load();
    } catch (err) {
      setQuickError(errorLabel(err));
    } finally {
      setQuickBusy(false);
    }
  }

  async function handleResetPin() {
    const name = personName(target) || target.phone_number;
    if (
      !(await confirm(t("resetPinConfirm", { name }), {
        tone: "primary",
        confirmLabel: t("resetPinConfirmLabel"),
      }))
    )
      return;
    setQuickBusy(true);
    setQuickError("");
    setTempPin(null);
    try {
      const { pin } = await adminResetPin(id);
      setTempPin(pin);
      await load();
    } catch (err) {
      setQuickError(errorLabel(err));
    } finally {
      setQuickBusy(false);
    }
  }

  if (loading) return <div style={{ padding: 32, ...muted }}>{t("loading")}</div>;
  if (!session) return <div style={{ padding: 32 }}>{t("loginRequired")}</div>;
  if (userRow?.role !== "admin" && !userRow?.is_staff_admin && !userRow?.is_owner)
    return <div style={{ padding: 32 }}>{t("adminOnly")}</div>;

  const target = data?.user;

  const problems = [];
  if (target) {
    if (!target.phone_verified_at && target.role !== "admin" && target.status !== "deleted")
      problems.push({ tone: "warn", text: t("problems.unverified"), onFix: handleQuickVerify, fixLabel: t("problems.verifyFix") });
    if (data.skipper_profile?.approval_status === "pending")
      problems.push({ tone: "warn", text: t("problems.proPending"), view: "actions" });
    if (data.skipper_profile?.approval_status === "rejected")
      problems.push({ tone: "warn", text: t("problems.proRejected"), view: "actions" });
    if (target.status === "suspended")
      problems.push({ tone: "danger", text: target.suspension_reason ? t("problems.suspendedReason", { reason: target.suspension_reason }) : t("problems.suspended"), view: "actions", userText: Boolean(target.suspension_reason) });
    if (target.status === "deleted")
      problems.push({ tone: "danger", text: target.deletion_reason ? t("problems.deletedReason", { reason: target.deletion_reason }) : t("problems.deleted"), view: "actions", userText: Boolean(target.deletion_reason) });
    const openDisputes = (data.disputes || []).filter((d) => !d.resolved_at).length;
    if (openDisputes > 0)
      problems.push({ tone: "warn", text: t("problems.disputes", { count: openDisputes }), view: "finance" });
    const openFlags = (data.flags || []).filter((f) => !f.resolved_at).length;
    if (openFlags > 0)
      problems.push({ tone: "warn", text: t("problems.flags", { count: openFlags }), view: "overview" });
    if (target.photo_url && !target.photo_reviewed_at && target.status !== "deleted")
      problems.push({ tone: "warn", text: t("problems.photo"), view: "profile" });
    const newMsgs = (data.contact_messages || []).filter((m) => m.status === "new").length;
    if (newMsgs > 0)
      problems.push({ tone: "warn", text: t("problems.messages", { count: newMsgs }), view: "overview" });
  }

  const canViewAs = target && target.role !== "admin" && target.status !== "deleted" && target.status !== "suspended";
  const canResetPin = target && target.role !== "admin" && target.status !== "deleted";

  const tabs = data
    ? TAB_DEFS.filter((d) => !d.show || d.show(data)).map((d) => ({ ...d, n: d.count ? d.count(data) : 0 }))
    : [];
  // Ένας παλιός σύνδεσμος ?tab=availability πάνω σε λογαριασμό πελάτη (χωρίς
  // προφίλ επαγγελματία) δεν πρέπει να δείχνει μια καρτέλα που δεν φαίνεται
  // καν στη μπάρα — πέφτει πίσω στην Επισκόπηση.
  const activeTab = tabs.some((x) => x.key === tab) ? tab : "overview";
  const ActiveTab = TAB_COMPONENTS[activeTab] || OverviewTab;

  return (
    <AdminShell
      title={target ? personName(target) || t("noName") : busy ? t("loading") : t("account")}
      avatar={target && <Avatar url={target.photo_url} name={personName(target)} size={44} />}
      actions={<BackButton href="/platform/admin/users" />}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      {target && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            <Status value={target.role === "skipper" ? "skipper" : target.role} />
            {data.skipper_profile?.role && <span style={badge("neutral")}>{labelForRole(data.skipper_profile.role)}</span>}
            {target.status !== "active" && <Status value={target.status} />}
            {!target.phone_verified_at && target.role !== "admin" && <span style={badge("warn")}>{t("badges.unverified")}</span>}
            {target.pin_change_required && <span style={badge("warn")}>{t("badges.tempPin")}</span>}
            {target.is_test_account && <span style={badge("neutral")}>{t("badges.test")}</span>}
            {target.role === "admin" || target.is_owner ? (
              <span style={badge("brand")}>{t("badges.owner")}</span>
            ) : (
              target.is_staff_admin && <span style={badge("brand")}>{t("badges.staff")}</span>
            )}
          </div>
          <p style={{ ...muted, margin: "0 0 4px" }}>
            <span style={money}>{target.phone_number}</span>
            {target.email ? ` · ${target.email}` : ""}
          </p>
          <p style={{ ...muted, fontSize: 12.5, margin: "0 0 16px" }}>
            {t("signedUp", { date: f.dateTime(target.created_at) })}
            {" · "}
            {target.last_seen_at ? t("lastSeen", { ago: f.timeAgo(target.last_seen_at) }) : t("neverSeen")}
          </p>

          {problems.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {problems.map((p, i) => (
                <IssueRow key={i} tone={p.tone} text={p.text} onFix={p.onFix} fixLabel={p.fixLabel} userText={p.userText} onView={p.view ? () => goTab(p.view) : undefined} />
              ))}
            </div>
          )}

          {quickError && <p style={{ color: colors.danger, fontSize: 13, marginBottom: 10 }}>{quickError}</p>}

          {(canViewAs || canResetPin) && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {canViewAs && (
                  <button
                    style={button("secondary")}
                    onClick={() => {
                      startViewAs({ id: target.id, name: target.full_name, phone: target.phone_number, role: target.role });
                      router.push("/platform/requests");
                    }}
                  >
                    {t("viewAs")}
                  </button>
                )}
                {canResetPin && (
                  <button style={button("secondary")} disabled={quickBusy} onClick={handleResetPin}>
                    {t("tempPinButton")}
                  </button>
                )}
              </div>

              {tempPin && (
                <div style={{ marginTop: 10, padding: "12px 14px", background: "#EAF2EE", borderRadius: 10, fontSize: 13.5 }}>
                  {t("tempPinIs")} <b style={{ ...money, fontSize: 20, letterSpacing: "0.08em" }}>{tempPin}</b>
                  <p style={{ margin: "8px 0 10px", lineHeight: 1.5 }}>
                    {t.rich("tempPinNote", { number: target.phone_number, phone: (c) => <span style={money}>{c}</span> })}
                  </p>
                  <button type="button" style={{ ...button("secondary"), padding: "5px 12px", fontSize: 12.5 }} onClick={() => setTempPin(null)}>
                    {t("tempPinDone")}
                  </button>
                </div>
              )}
            </div>
          )}

          <TabBar tabs={tabs} active={activeTab} onChange={goTab} />
          <ActiveTab data={data} id={id} reload={load} confirm={confirm} onSelectTab={goTab} viewerId={userRow?.id} router={router} />
        </>
      )}

      {busy && !target && <p style={muted}>{t("loading")}</p>}
      {/* admin_account_detail επιστρέφει null (όχι σφάλμα) για id που δεν υπάρχει. */}
      {!busy && !error && !target && <p style={muted}>{t("notFound")}</p>}
      {confirmDialog}
    </AdminShell>
  );
}

export default function AdminUserViewPage() {
  return (
    <Suspense fallback={null}>
      <AdminUserInner />
    </Suspense>
  );
}

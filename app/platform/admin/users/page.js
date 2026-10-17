"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../useFormat";
import { useLocalData } from "../../useLocalData";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminShell, { useAdminCounts, useRefreshAdminCounts } from "../AdminShell";
import { useAuth } from "../../AuthContext";
import { safeImageUrl, Panel, Toolbar, Row, Empty, Chip, Segments, colors, muted, money, button } from "../ui";
import Avatar from "../../components/Avatar";
import Icon from "../../components/Icon";
import { CREW_ROLES, labelForRole } from "../../../../lib/platform/roles";
import { adminListAccounts, adminVerifyUser, adminReactivateAccount, adminRestoreAccount } from "../../../../lib/platform/db";
import { useConfirm } from "../../components/ConfirmDialog";

const control = {
  padding: "7px 10px",
  fontSize: 13,
  fontFamily: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: colors.card,
  color: colors.ink,
  boxSizing: "border-box",
};

// Same control, redrawn arrow instead of the raw per-browser <select> default.
const selectControl = {
  ...control,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  paddingRight: 28,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${colors.inkSoft.replace(
    "#",
    "%23"
  )}' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 9px center",
  cursor: "pointer",
};

// Admins are one person today. Making them a third of the filter was giving a
// third of the screen to a row you already know the contents of.
const TABS = [
  { key: "client", role: "client" },
  { key: "pro", role: "skipper" },
  { key: "all", role: null },
  // Ξεχωριστό κουτί, όχι ανακατεμένο με τους ενεργούς (βρέθηκε πραγματικό
  // bug: admin_list_accounts δεν φιλτράριζε καθόλου status, οπότε ένας
  // διαγραμμένος λογαριασμός έμενε ορατός στη λίστα "Πελάτες" σαν να ήταν
  // ενεργός). Ο ίδιος λογαριασμός θα ξαναφανεί εδώ αυτόματα αν διαγραφεί —
  // δεν χρειάζεται δικό του state, μόνο ξεχωριστό φίλτρο.
  { key: "deleted", role: null, deletedOnly: true },
  // 0075: εγγραφές χωρίς SMS OTP (δεν είναι ακόμα ενεργό) — περιμένουν το
  // «Επαλήθευση» παρακάτω πριν μπορέσουν να κάνουν οτιδήποτε (VerificationGate
  // στο PlatformShell.js).
  { key: "pending", role: null, pendingVerificationOnly: true },
  // 0078: επ' αόριστο σταματημένοι — σκόπιμα ξεχωριστό κουτί από τους
  // "Διαγραμμένοι", ώστε ο admin να μην ξεχνάει ότι υπάρχουν και να μπορεί
  // να τους επαναφέρει με ένα κλικ.
  { key: "suspended", role: null, suspendedOnly: true },
];

const iconButton = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: "50%", border: `1px solid ${colors.border}`, background: colors.card, color: colors.ink, cursor: "pointer", padding: 0 };

const TAB_ICON = { client: "user", pro: "anchor", all: "users", deleted: "trash", pending: "clock", suspended: "lock" };

const SORTS = ["recent", "active", "name", "rating", "bookings", "age"];

function UsersInner() {
  const t = useTranslations("AdminUsers");
  const f = useFormat();
  const L = useLocalData();
  const personName = (p) => L.person(p);
  const refreshCounts = useRefreshAdminCounts();
  const router = useRouter();
  const searchParams = useSearchParams();
  const counts = useAdminCounts();
  const { startViewAs } = useAuth();

  // Έρχεται εδώ από το κουτί «εγκεκριμένοι χωρίς διαθεσιμότητα» στην
  // Επισκόπηση — μόνο επαγγελματίες μπορούν να ταιριάξουν, οπότε κλειδώνει
  // την καρτέλα κιόλας, αλλιώς ο σύνδεσμος θα έδειχνε τη λίστα πελατών.
  const invisibleOnly = searchParams.get("filter") === "invisible";
  // Τα άλλα κουτιά της Επισκόπησης («Χρήστες», «Επαγγελματίες», «Πελάτες»)
  // δείχνουν εδώ με ?tab=..., ώστε να ανοίγουν κατευθείαν στη σωστή καρτέλα
  // αντί να αφήνουν τον admin να την ψάξει μόνος του.
  const tabParam = searchParams.get("tab");
  // ?q=... opens with a search already filled in — e.g. from a contact
  // message by a visitor who can't log in, to find the account by phone.
  const initialSearch = searchParams.get("q") || "";
  const initialTab = invisibleOnly
    ? "pro"
    : TABS.some((t) => t.key === tabParam)
    ? tabParam
    : initialSearch
    ? "all"
    : "client";

  const [tab, setTab] = useState(initialTab);
  // ?crew=cook: από την Επισκόπηση, κατευθείαν στους επαγγελματίες μιας ιδιότητας.
  const [crewRole, setCrewRole] = useState(() => (initialTab === "pro" && searchParams.get("crew")) || "");
  const [sort, setSort] = useState("recent");
  const [search, setSearch] = useState(initialSearch);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const active = TABS.find((t) => t.key === tab);
      setList(
        await adminListAccounts({
          role: active?.role || null,
          crewRole: tab === "pro" && crewRole ? crewRole : null,
          search,
          sort,
          invisibleOnly,
          deletedOnly: Boolean(active?.deletedOnly),
          pendingVerificationOnly: Boolean(active?.pendingVerificationOnly),
          suspendedOnly: Boolean(active?.suspendedOnly),
        })
      );
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }, [tab, crewRole, sort, search, invisibleOnly]);

  // Filters re-query rather than filtering in the page: the sort has to happen
  // over the whole table, not over whatever slice was already fetched.
  useEffect(() => {
    load();
  }, [tab, crewRole, sort, invisibleOnly]);

  function enterViewAs(u) {
    startViewAs({ id: u.id, name: u.full_name, phone: u.phone_number, role: u.role });
    router.push("/platform/requests");
  }

  async function handleVerify(u) {
    setBusy(true);
    setError("");
    try {
      await adminVerifyUser(u.id);
      await load();
      refreshCounts();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  async function handleRestore(u) {
    if (!(await confirm(t("restoreConfirm", { name: personName(u) || u.phone_number }), { tone: "primary" })))
      return;
    setBusy(true);
    setError("");
    try {
      await adminRestoreAccount(u.id);
      await load();
      refreshCounts();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  async function handleReactivate(u) {
    setBusy(true);
    setError("");
    try {
      await adminReactivateAccount(u.id);
      await load();
      refreshCounts();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title={t("title")}
      subtitle={t("subtitle")}
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      {invisibleOnly && (
        <div
          style={{
            ...button("secondary"),
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            marginBottom: 12,
            cursor: "default",
          }}
        >
          <span style={{ fontSize: 13 }}>
            {t("filterInvisible")}
          </span>
          <Link href="/platform/admin/users" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}>{t("clear")}</span>
          </Link>
        </div>
      )}

      <Panel padded={false}>
        <Segments
          value={tab}
          items={TABS.filter((tb) => !invisibleOnly || tb.key === "pro").map((tb) => ({ key: tb.key, label: t(`tabs.${tb.key}`), icon: TAB_ICON[tb.key], count: tb.key === tab && !busy ? list.length : null }))}
          onChange={(k) => {
            setTab(k);
            if (k !== "pro") setCrewRole("");
          }}
        />

        <Toolbar>
          {/* Only professionals have a crew role, so the filter only appears
              where it means something. */}
          {tab === "pro" && (
            <select style={{ ...selectControl, flex: "1 1 150px" }} value={crewRole} onChange={(e) => setCrewRole(e.target.value)}>
              <option value="">{t("allRoles")}</option>
              {CREW_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
          <select style={{ ...selectControl, flex: "1 1 190px" }} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((k) => (
              <option key={k} value={k}>
                {t(`sorts.${k}`)}
              </option>
            ))}
          </select>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
            style={{ display: "flex", gap: 8, flex: "2 1 220px" }}
          >
            <input
              style={{ ...control, flex: 1, minWidth: 0 }}
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" style={{ ...button("secondary"), padding: "6px 12px", fontSize: 13 }}>
              {t("search")}
            </button>
          </form>
        </Toolbar>

        {busy && <Empty>{t("loading")}</Empty>}
        {!busy && list.length === 0 && <Empty>{t("empty")}</Empty>}

        {list.map((u) => {
          return (
            <Row key={u.id}>
              <Link href={`/platform/admin/user/${u.id}`} data-user-row style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 220px", textDecoration: "none", color: "inherit" }}>
                <Avatar src={safeImageUrl(u.photo_url)} name={personName(u)} size={44} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span data-user-text style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: colors.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {personName(u) || t("noName")}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                    <Chip tone={u.role === "admin" ? "danger" : u.role === "skipper" ? "brand" : "neutral"} icon={u.role === "skipper" ? "anchor" : u.role === "admin" ? "shield" : "user"}>
                      {u.crew_role ? labelForRole(u.crew_role) : t(`roleChip.${u.role === "skipper" ? "pro" : u.role === "admin" ? "admin" : "client"}`)}
                    </Chip>
                    {u.status === "deleted" ? (
                      <Chip tone="neutral" icon="trash">{t("statusChip.deleted")}</Chip>
                    ) : u.status === "suspended" ? (
                      <Chip tone="danger" icon="lock">{t("statusChip.suspended")}</Chip>
                    ) : !u.phone_verified_at && u.role !== "admin" ? (
                      <Chip tone="warn" icon="clock">{t("statusChip.review")}</Chip>
                    ) : u.approval_status && u.approval_status !== "approved" ? (
                      <Chip tone="warn" icon="clock">{t("statusChip.review")}</Chip>
                    ) : (
                      <Chip tone="success" icon="check">{t("statusChip.active")}</Chip>
                    )}
                    {u.rating_count > 0 && (
                      <span style={{ ...muted, fontSize: 12.5 }}>
                        <span style={money}>{Number(u.rating_avg).toFixed(1)}</span>★
                      </span>
                    )}
                  </span>
                  <span style={{ ...muted, fontSize: 12.5, display: "block", marginTop: 4 }}>
                    <span style={money}>{u.phone_number}</span>
                    {" · "}
                    <span style={{ color: u.last_seen_at ? colors.inkSoft : colors.warn }}>
                      {u.last_seen_at ? f.timeAgo(u.last_seen_at) : t("neverSeen")}
                    </span>
                  </span>
                  {u.status === "suspended" && u.suspension_reason && (
                    <span data-user-text style={{ display: "block", marginTop: 3, fontSize: 12.5, color: colors.warn }}>{t("suspension", { reason: u.suspension_reason })}</span>
                  )}
                </span>
              </Link>
              <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, maxWidth: "100%", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {u.status === "deleted" && (
                  <button style={{ ...button("primary"), padding: "6px 12px", fontSize: 13 }} disabled={busy} onClick={() => handleRestore(u)}>
                    {t("restore")}
                  </button>
                )}
                {/* 0075: εγγραφή χωρίς SMS OTP — VerificationGate (PlatformShell.js) τον μπλοκάρει μέχρι το «Επαλήθευση». */}
                {!u.phone_verified_at && u.role !== "admin" && u.status !== "deleted" && (
                  <button style={{ ...button("primary"), padding: "6px 12px", fontSize: 13 }} disabled={busy} onClick={() => handleVerify(u)}>
                    {t("verify")}
                  </button>
                )}
                {/* 0078: επαναφορά με ένα κλικ. */}
                {u.status === "suspended" && (
                  <button style={{ ...button("primary"), padding: "6px 12px", fontSize: 13 }} disabled={busy} onClick={() => handleReactivate(u)}>
                    {t("restore")}
                  </button>
                )}
                {/* Η «Προβολή ως» δεν έχει νόημα σε κρυμμένο/σταματημένο λογαριασμό (η σύνδεση μπλοκάρεται ούτως ή άλλως). */}
                {u.role !== "admin" && u.status !== "deleted" && u.status !== "suspended" && (
                  <button type="button" aria-label={t("viewAs")} title={t("viewAs")} onClick={() => enterViewAs(u)} style={{ ...iconButton }}>
                    <Icon name="eye" size={18} />
                  </button>
                )}
                <Link href={`/platform/admin/user/${u.id}`} aria-label={t("details")} title={t("details")} style={{ ...iconButton, textDecoration: "none" }}>
                  <Icon name="chev" size={18} />
                </Link>
              </span>
            </Row>
          );
        })}
      </Panel>

      {/* Το "Δοκιμαστικά δεδομένα" (δημιουργία ψεύτικων λογαριασμών) μετακόμισε
          * στο Ghost Mode — είναι εργαλείο δοκιμών, όχι διαχείριση πραγματικών
          * χρηστών, και τώρα που υπάρχει δικό του hub γι' αυτό δεν έχει λόγο
          * να ζει κολλημένο κάτω από αυτή τη λίστα. */}
      {confirmDialog}
    </AdminShell>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={null}>
      <UsersInner />
    </Suspense>
  );
}

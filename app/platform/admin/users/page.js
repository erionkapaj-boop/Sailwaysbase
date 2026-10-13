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
import { Panel, Toolbar, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { badge } from "../../../../lib/platform/theme";
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

const SORTS = ["recent", "active", "name", "rating", "bookings", "age"];

function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

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

      <Panel title={`${t(`tabs.${tab}`)} (${list.length})`} padded={false}>
        <Toolbar>
          {TABS.map((tb) => (
            <button
              key={tb.key}
              disabled={invisibleOnly && tb.key !== "pro"}
              onClick={() => {
                setTab(tb.key);
                if (tb.key !== "pro") setCrewRole("");
              }}
              style={{
                ...button(tab === tb.key ? "primary" : "secondary"),
                padding: "6px 13px",
                fontSize: 13,
                opacity: invisibleOnly && tb.key !== "pro" ? 0.4 : 1,
              }}
            >
              {t(`tabs.${tb.key}`)}
            </button>
          ))}
        </Toolbar>

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
          const age = ageFrom(u.date_of_birth);
          return (
            <Row key={u.id}>
              <RowMain
                title={personName(u) || t("noName")}
                photoUrl={u.photo_url}
                meta={
                  <>
                    <span style={money}>{u.phone_number}</span>
                    {u.crew_role && ` · ${labelForRole(u.crew_role)}`}
                    {age != null && ` · ${t("yearsOld", { age })}`}
                    {u.rating_count > 0 && (
                      <>
                        {" · "}
                        <span style={money}>{Number(u.rating_avg).toFixed(1)}</span>★ (
                        <span style={money}>{u.rating_count}</span>)
                      </>
                    )}
                    {u.completed_bookings_count > 0 && (
                      <>
                        {" · "}
                        {t.rich("bookingsCount", { count: u.completed_bookings_count, n: (c) => <span style={money}>{c}</span> })}
                      </>
                    )}
                    <br />
                    {/* The one thing the old list couldn't answer: is this
                        account alive? It decides who you'd hand work to. */}
                    <span style={{ color: u.last_seen_at ? colors.inkSoft : colors.warn }}>
                      {u.last_seen_at ? t("lastSeen", { ago: f.timeAgo(u.last_seen_at) }) : t("neverSeen")}
                    </span>
                    {/* Ο λόγος αναστολής φαίνεται εδώ κατευθείαν — αυτό
                        * ζητήθηκε ρητά: να μη χρειάζεται ο admin να ανοίξει το
                        * Στοιχεία για να θυμηθεί γιατί τον σταμάτησε. */}
                    {u.status === "suspended" && u.suspension_reason && (
                      <>
                        <br />
                        <span data-user-text style={{ color: colors.warn }}>{t("suspension", { reason: u.suspension_reason })}</span>
                      </>
                    )}
                  </>
                }
              />
              <span
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexShrink: 0,
                  // Caps it to the row's own width once Row's wrap has
                  // dropped it to its own line (a flex item with
                  // flexShrink:0 otherwise ignores the row entirely and
                  // just sizes to its content) — without this, a status
                  // badge plus three buttons ran straight off the edge of
                  // the screen instead of using its own flexWrap to stack
                  // onto a second line. A ceiling, not a fixed width: on a
                  // wide screen where it still fits beside RowMain on one
                  // line, this never comes into play.
                  maxWidth: "100%",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {u.approval_status && u.approval_status !== "approved" && <Status value={u.approval_status} />}
                {u.status !== "active" && <Status value={u.status} />}
                {!u.phone_verified_at && u.role !== "admin" && u.status !== "deleted" && (
                  <span style={badge("warn")}>{t("awaitingVerification")}</span>
                )}
                {u.status === "deleted" && (
                  <button
                    style={{ ...button("primary"), padding: "5px 10px", fontSize: 12 }}
                    disabled={busy}
                    onClick={() => handleRestore(u)}
                  >
                    {t("restore")}
                  </button>
                )}
                {/* 0075: εγγραφή χωρίς SMS OTP (ή χωρίς επαλήθευση admin
                    * ακόμα) — VerificationGate στο PlatformShell.js τον
                    * μπλοκάρει παντού μέχρι να πατηθεί αυτό. */}
                {!u.phone_verified_at && u.role !== "admin" && u.status !== "deleted" && (
                  <button
                    style={{ ...button("primary"), padding: "5px 10px", fontSize: 12 }}
                    disabled={busy}
                    onClick={() => handleVerify(u)}
                  >
                    {t("verify")}
                  </button>
                )}
                {/* Η "Προβολή ως" δεν βγάζει νόημα πάνω σε
                    * έναν κρυμμένο/σταματημένο λογαριασμό — η σύνδεση θα
                    * μπλοκαριστεί ούτως ή άλλως (signInWithPin αρνείται
                    status='deleted'/'suspended'). */}
                {u.role !== "admin" && u.status !== "deleted" && u.status !== "suspended" && (
                  <button
                    style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
                    onClick={() => enterViewAs(u)}
                  >
                    {t("viewAs")}
                  </button>
                )}
                {/* 0078: επαναφορά με ένα κλικ, χωρίς λόγο (μόνο η αναστολή
                    * χρειάζεται λόγο) — ίδιο μοτίβο με το «Επαλήθευση». */}
                {u.status === "suspended" && (
                  <button
                    style={{ ...button("primary"), padding: "5px 10px", fontSize: 12 }}
                    disabled={busy}
                    onClick={() => handleReactivate(u)}
                  >
                    {t("restore")}
                  </button>
                )}
                <Link href={`/platform/admin/user/${u.id}`} style={{ textDecoration: "none" }}>
                  <span style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}>{t("details")}</span>
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

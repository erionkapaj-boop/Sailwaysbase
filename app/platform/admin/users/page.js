"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { useAuth } from "../../AuthContext";
import { Panel, Toolbar, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { CREW_ROLES, labelForRole } from "../../../../lib/platform/roles";
import { adminListAccounts, adminSeedDemoUsers } from "../../../../lib/platform/db";
import { timeAgo } from "../../../../lib/platform/notifications";

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

// Admins are one person today. Making them a third of the filter was giving a
// third of the screen to a row you already know the contents of.
const TABS = [
  { key: "client", label: "Πελάτες", role: "client" },
  { key: "pro", label: "Επαγγελματίες", role: "skipper" },
  { key: "all", label: "Όλοι", role: null },
];

const SORTS = [
  ["recent", "Νεότερη εγγραφή"],
  ["active", "Πιο πρόσφατα ενεργοί"],
  ["name", "Όνομα (Α–Ω)"],
  ["rating", "Βαθμολογία"],
  ["bookings", "Ολοκληρωμένες κρατήσεις"],
  ["age", "Ηλικία (μεγαλύτεροι πρώτα)"],
];

function ageFrom(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function UsersInner() {
  const router = useRouter();
  const counts = useAdminCounts();
  const { startViewAs } = useAuth();

  const [tab, setTab] = useState("client");
  const [crewRole, setCrewRole] = useState("");
  const [sort, setSort] = useState("recent");
  const [search, setSearch] = useState("");
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

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
        })
      );
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }, [tab, crewRole, sort, search]);

  // Filters re-query rather than filtering in the page: the sort has to happen
  // over the whole table, not over whatever slice was already fetched.
  useEffect(() => {
    load();
  }, [tab, crewRole, sort]);

  function enterViewAs(u) {
    startViewAs({ id: u.id, name: u.full_name, phone: u.phone_number, role: u.role });
    router.push(u.role === "skipper" ? "/platform/skipper" : "/platform/client");
  }

  async function seed() {
    setSeeding(true);
    try {
      setSeedResult(await adminSeedDemoUsers());
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <AdminShell
      title="Χρήστες"
      subtitle="Πελάτες και επαγγελματίες ανά ιδιότητα. «Προβολή ως» ανοίγει τις πραγματικές σελίδες του λογαριασμού."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <Panel title={`${TABS.find((t) => t.key === tab)?.label} (${list.length})`} padded={false}>
        <Toolbar>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                if (t.key !== "pro") setCrewRole("");
              }}
              style={{ ...button(tab === t.key ? "primary" : "secondary"), padding: "6px 13px", fontSize: 13 }}
            >
              {t.label}
            </button>
          ))}
        </Toolbar>

        <Toolbar>
          {/* Only professionals have a crew role, so the filter only appears
              where it means something. */}
          {tab === "pro" && (
            <select style={{ ...control, flex: "1 1 150px" }} value={crewRole} onChange={(e) => setCrewRole(e.target.value)}>
              <option value="">Όλες οι ιδιότητες</option>
              {CREW_ROLES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
          <select style={{ ...control, flex: "1 1 190px" }} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
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
              placeholder="Τηλέφωνο, όνομα ή email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" style={{ ...button("secondary"), padding: "6px 12px", fontSize: 13 }}>
              Αναζήτηση
            </button>
          </form>
        </Toolbar>

        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && list.length === 0 && <Empty>Κανένας λογαριασμός δεν ταιριάζει.</Empty>}

        {list.map((u) => {
          const age = ageFrom(u.date_of_birth);
          return (
            <Row key={u.id}>
              <RowMain
                title={u.full_name || "(χωρίς όνομα)"}
                meta={
                  <>
                    <span style={money}>{u.phone_number}</span>
                    {u.crew_role && ` · ${labelForRole(u.crew_role)}`}
                    {age != null && ` · ${age} ετών`}
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
                        <span style={money}>{u.completed_bookings_count}</span> κρατήσεις
                      </>
                    )}
                    <br />
                    {/* The one thing the old list couldn't answer: is this
                        account alive? It decides who you'd hand work to. */}
                    <span style={{ color: u.last_seen_at ? colors.inkSoft : colors.warn }}>
                      {u.last_seen_at ? `Ενεργός ${timeAgo(u.last_seen_at)}` : "Δεν έχει μπει ποτέ"}
                    </span>
                  </>
                }
              />
              <span
                style={{
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                  flexShrink: 0,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {u.approval_status && u.approval_status !== "approved" && <Status value={u.approval_status} />}
                {u.status !== "active" && <Status value={u.status} />}
                {u.role !== "admin" && (
                  <button
                    style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}
                    onClick={() => enterViewAs(u)}
                  >
                    Προβολή ως
                  </button>
                )}
                <Link href={`/platform/admin/user/${u.id}`} style={{ textDecoration: "none" }}>
                  <span style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}>Στοιχεία</span>
                </Link>
              </span>
            </Row>
          );
        })}
      </Panel>

      <Panel
        title="Δοκιμαστικά δεδομένα"
        subtitle="7 ψεύτικοι λογαριασμοί (5 επαγγελματίες, 2 πελάτες), όλοι με κωδικό 123456. Αν ξανατρέξει δεν διπλασιάζει τίποτα."
      >
        <button style={button("secondary")} disabled={seeding} onClick={seed}>
          {seeding ? "Δημιουργία…" : "Δημιουργία δοκιμαστικών λογαριασμών"}
        </button>
        {seedResult && (
          <div style={{ ...muted, fontSize: 13, marginTop: 12 }}>
            {seedResult.created?.length > 0 && (
              <>
                <div style={{ color: colors.success }}>Δημιουργήθηκαν {seedResult.created.length}:</div>
                {seedResult.created.map((c) => (
                  <div key={c} style={money}>
                    {c}
                  </div>
                ))}
              </>
            )}
            {seedResult.skipped?.length > 0 && <div style={{ marginTop: 6 }}>Υπήρχαν ήδη: {seedResult.skipped.length}</div>}
          </div>
        )}
      </Panel>
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

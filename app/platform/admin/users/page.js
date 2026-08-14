"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { useAuth } from "../../AuthContext";
import { Panel, Toolbar, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { adminListUsers, adminSeedDemoUsers } from "../../../../lib/platform/db";

const inputStyle = {
  padding: "8px 11px",
  fontSize: 14,
  fontFamily: "inherit",
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  background: colors.card,
  color: colors.ink,
  boxSizing: "border-box",
};

function UsersInner() {
  const router = useRouter();
  const counts = useAdminCounts();
  const { startViewAs } = useAuth();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  const load = useCallback(async (opts) => {
    setBusy(true);
    setError("");
    try {
      setList(await adminListUsers(opts));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load({});
  }, [load]);

  function enterViewAs(u) {
    startViewAs({ id: u.id, name: u.full_name, phone: u.phone_number, role: u.role });
    router.push(u.role === "skipper" ? "/platform/skipper" : "/platform/client");
  }

  async function seed() {
    setSeeding(true);
    setError("");
    try {
      setSeedResult(await adminSeedDemoUsers());
      await load({});
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <AdminShell
      title="Χρήστες"
      subtitle="Αναζήτηση με τηλέφωνο ή όνομα. «Προβολή ως» ανοίγει τις πραγματικές σελίδες του λογαριασμού."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <Panel title={`Λογαριασμοί (${list.length})`} padded={false}>
        <Toolbar>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load({ search, role: roleFilter });
            }}
            style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}
          >
            <input
              style={{ ...inputStyle, flex: "2 1 190px", minWidth: 0 }}
              placeholder="Τηλέφωνο ή όνομα"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              style={{ ...inputStyle, flex: "1 1 130px" }}
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                load({ search, role: e.target.value });
              }}
            >
              <option value="">Όλοι οι ρόλοι</option>
              <option value="client">Πελάτες</option>
              <option value="skipper">Επαγγελματίες</option>
              <option value="admin">Admins</option>
            </select>
            <button type="submit" style={button("secondary")}>
              Αναζήτηση
            </button>
          </form>
        </Toolbar>

        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && list.length === 0 && <Empty>Κανένας χρήστης δεν ταιριάζει.</Empty>}

        {list.map((u) => (
          <Row key={u.id}>
            <RowMain
              title={u.full_name || "(χωρίς όνομα)"}
              meta={
                <>
                  <span style={money}>{u.phone_number}</span>
                  {u.email ? ` · ${u.email}` : ""}
                </>
              }
            />
            <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Status value={u.role} />
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
        ))}
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
            {seedResult.skipped?.length > 0 && (
              <div style={{ marginTop: 6 }}>Υπήρχαν ήδη: {seedResult.skipped.length}</div>
            )}
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

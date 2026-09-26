"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import AdminShell from "../AdminShell";
import { labelForRole } from "../../../../lib/platform/roles";
import { Panel, Toolbar, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { adminListBookings, departureLabel } from "../../../../lib/platform/db";
import LoadError from "../../components/LoadError";
import { formatDate } from "../../../../lib/platform/notifications";

const FILTERS = [
  ["upcoming", "Επερχόμενες"],
  ["confirmed", "Επιβεβαιωμένες"],
  ["completed", "Ολοκληρωμένες"],
  ["cancelled", "Ακυρωμένες"],
  ["", "Όλες"],
];

function PersonLink({ label, p }) {
  if (!p) return null;
  return (
    <Link href={`/platform/admin/user/${p.id}`} style={{ color: colors.ink }}>
      {label}: {p.name || "(χωρίς όνομα)"}
    </Link>
  );
}

function BookingsInner() {
  const searchParams = useSearchParams();
  // Δίνει στα κουτιά της Επισκόπησης («Επερχόμενες», «Ολοκληρωμένες»,
  // «Ακυρώσεις») έναν σύνδεσμο που ανοίγει κατευθείαν στο σωστό φίλτρο.
  const filterParam = searchParams.get("filter");
  const initialFilter = FILTERS.some((f) => f[0] === filterParam) ? filterParam : "upcoming";

  const [all, setAll] = useState([]);
  const [filter, setFilter] = useState(initialFilter);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  function load() {
    setBusy(true);
    setFailed(false);
    adminListBookings()
      .then(setAll)
      .catch((err) => { console.error(err); setFailed(true); })
      .finally(() => setBusy(false));
  }

  useEffect(load, []);

  // Filtering here rather than per-query: the list is capped at 200 rows, and
  // switching a filter should be instant instead of a round trip.
  const list = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    switch (filter) {
      case "upcoming":
        return all.filter((b) => b.status === "confirmed" && b.end_date >= today);
      case "confirmed":
        return all.filter((b) => b.status === "confirmed");
      case "completed":
        return all.filter((b) => b.status === "completed");
      case "cancelled":
        return all.filter((b) => b.status.startsWith("cancelled"));
      default:
        return all;
    }
  }, [all, filter]);

  return (
    <AdminShell title="Όλες οι κρατήσεις" subtitle="Κάθε κράτηση στην πλατφόρμα, νεότερη πρώτη. Πάτα ένα όνομα για τα στοιχεία του.">
      <Panel title={`${FILTERS.find((f) => f[0] === filter)?.[1]} (${list.length})`} padded={false}>
        <Toolbar>
          {FILTERS.map(([key, label]) => (
            <button
              key={key || "all"}
              onClick={() => setFilter(key)}
              style={{
                ...button(filter === key ? "primary" : "secondary"),
                padding: "5px 12px",
                fontSize: 13,
              }}
            >
              {label}
            </button>
          ))}
        </Toolbar>

        {busy && <Empty>Φόρτωση…</Empty>}
        {!busy && failed && <div style={{ padding: 12 }}><LoadError what="οι κρατήσεις" onRetry={load} /></div>}
        {!busy && !failed && list.length === 0 && <Empty>Καμία κράτηση σε αυτή την κατηγορία.</Empty>}

        {list.map((b) => (
          <Row key={b.id}>
            <RowMain
              title={`${departureLabel(b)}${b.boat_types?.name ? " · " + b.boat_types.name : ""}`}
              meta={
                <>
                  <span style={money}>{formatDate(b.start_date)}</span> → <span style={money}>{formatDate(b.end_date)}</span>
                  {b.crew_role ? ` · ${labelForRole(b.crew_role)}` : ""}
                  <br />
                  <PersonLink label="Πελάτης" p={b.people?.client} />
                  {b.people?.client && b.people?.pro ? " · " : ""}
                  <PersonLink label="Επαγγελματίας" p={b.people?.pro} />
                </>
              }
            />
            <Status value={b.status} />
          </Row>
        ))}
      </Panel>
    </AdminShell>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsInner />
    </Suspense>
  );
}

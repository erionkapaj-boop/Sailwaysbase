"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import AdminShell from "../AdminShell";
import { labelForRole } from "../../../../lib/platform/roles";
import { Panel, Toolbar, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { adminListBookings, departureLabel } from "../../../../lib/platform/db";
import LoadError from "../../components/LoadError";
import { useFormat } from "../../useFormat";
import { useLocalData } from "../../useLocalData";

const FILTERS = [
  ["upcoming", "filterUpcoming"],
  ["confirmed", "filterConfirmed"],
  ["completed", "filterCompleted"],
  ["cancelled", "filterCancelled"],
  ["", "filterAll"],
];

function PersonLink({ label, p }) {
  const t = useTranslations("AdminBookings");
  const L = useLocalData();
  if (!p) return null;
  return (
    <Link href={`/platform/admin/user/${p.id}`} style={{ color: colors.ink }}>
      {label}: {L.person({ full_name: p.name, full_name_latin: p.name_latin }) || t("noName")}
    </Link>
  );
}

function BookingsInner() {
  const t = useTranslations("AdminBookings");
  const f = useFormat();
  const L = useLocalData();
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
    <AdminShell title={t("title")} subtitle={t("subtitle")}>
      <Panel title={`${t(FILTERS.find((x) => x[0] === filter)?.[1])} (${list.length})`} padded={false}>
        <Toolbar>
          {FILTERS.map(([key, labelKey]) => (
            <button
              key={key || "all"}
              onClick={() => setFilter(key)}
              style={{
                ...button(filter === key ? "primary" : "secondary"),
                padding: "5px 12px",
                fontSize: 13,
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        </Toolbar>

        {busy && <Empty>{t("loading")}</Empty>}
        {!busy && failed && <div style={{ padding: 12 }}><LoadError what={t("whatBookings")} onRetry={load} /></div>}
        {!busy && !failed && list.length === 0 && <Empty>{t("empty")}</Empty>}

        {list.map((b) => (
          <Row key={b.id}>
            <RowMain
              title={L.text(`${departureLabel(b)}${b.boat_types?.name ? " · " + b.boat_types.name : ""}`)}
              meta={
                <>
                  <span style={money}>{f.date(b.start_date)}</span> → <span style={money}>{f.date(b.end_date)}</span>
                  {b.crew_role ? ` · ${labelForRole(b.crew_role)}` : ""}
                  <br />
                  <PersonLink label={t("client")} p={b.people?.client} />
                  {b.people?.client && b.people?.pro ? " · " : ""}
                  <PersonLink label={t("professional")} p={b.people?.pro} />
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

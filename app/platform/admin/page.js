"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell, { useAdminCounts } from "./AdminShell";
import { Panel, Metric, MetricGrid, Row, RowMain, Empty, Status, colors, muted, money, button } from "./ui";
import { adminRecentActivity, adminActivityCounts } from "../../../lib/platform/db";
import { timeAgo } from "../../../lib/platform/notifications";

const ACTIVITY_LABEL = {
  booking: "Κράτηση",
  signup: "Νέα εγγραφή",
  dispute: "Αναφορά",
};

const ACTIVITY_TONE = {
  booking: colors.success,
  signup: colors.accent,
  dispute: colors.danger,
};

export default function AdminOverview() {
  const counts = useAdminCounts();
  const [activity, setActivity] = useState([]);
  const [live, setLive] = useState({});

  useEffect(() => {
    adminRecentActivity(18).then(setActivity).catch(() => {});
    adminActivityCounts().then(setLive).catch(() => {});
  }, []);

  const needsAttention =
    (counts.coverage_needed || 0) +
    (counts.pending_approvals || 0) +
    (counts.open_disputes || 0) +
    (counts.profiles_invisible || 0);

  return (
    <AdminShell
      title="Επισκόπηση"
      subtitle="Η κατάσταση της πλατφόρμας με μια ματιά."
      counts={counts}
    >
      {/* What needs a person, before anything that merely reports a number.
          An operations screen that opens on totals makes you hunt for the
          work; this one opens on the work. */}
      <Panel
        title="Χρειάζονται ενέργεια"
        subtitle={needsAttention === 0 ? "Τίποτα εκκρεμές αυτή τη στιγμή." : undefined}
        padded={false}
      >
        {needsAttention === 0 ? (
          <Empty>Όλα τακτοποιημένα.</Empty>
        ) : (
          <>
            {/* Coverage first: a client is sitting without a professional
                for a date that is coming, which nothing else on this list
                is. */}
            {counts.coverage_needed > 0 && (
              <Link href="/platform/admin/coverage" style={{ textDecoration: "none" }}>
                <Row tone="attention">
                  <RowMain
                    title={`${counts.coverage_needed} κρατήσεις χωρίς επαγγελματία`}
                    meta="Ακυρώθηκαν και περιμένουν να αναθέσεις αντικαταστάτη."
                  />
                  <span style={{ ...muted, fontSize: 18 }}>›</span>
                </Row>
              </Link>
            )}
            {counts.pending_approvals > 0 && (
              <Link href="/platform/admin/approvals" style={{ textDecoration: "none" }}>
                <Row tone="attention">
                  <RowMain
                    title={`${counts.pending_approvals} προφίλ περιμένουν έγκριση`}
                    meta="Μέχρι να εγκριθούν δεν εμφανίζονται σε καμία αναζήτηση."
                  />
                  <span style={{ ...muted, fontSize: 18 }}>›</span>
                </Row>
              </Link>
            )}
            {counts.open_disputes > 0 && (
              <Link href="/platform/admin/disputes" style={{ textDecoration: "none" }}>
                <Row tone="attention">
                  <RowMain
                    title={`${counts.open_disputes} ανοιχτές αναφορές ακύρωσης`}
                    meta="Κάθε μία έχει επηρεάσει την αξιοπιστία κάποιου."
                  />
                  <span style={{ ...muted, fontSize: 18 }}>›</span>
                </Row>
              </Link>
            )}
            {counts.profiles_invisible > 0 && (
              <Link href="/platform/admin/users?filter=invisible" style={{ textDecoration: "none" }}>
                <Row tone="attention">
                  <RowMain
                    title={`${counts.profiles_invisible} εγκεκριμένοι χωρίς διαθεσιμότητα`}
                    meta="Εγκρίθηκαν αλλά δεν βγαίνουν σε αναζητήσεις — μάλλον δεν το ξέρουν."
                  />
                  <span style={{ ...muted, fontSize: 18 }}>›</span>
                </Row>
              </Link>
            )}
          </>
        )}
      </Panel>

      <MetricGrid>
        <Metric label="Χρήστες" value={counts.users_total ?? "—"} hint={`+${counts.users_new_7d ?? 0} την εβδομάδα`} />
        <Metric label="Επαγγελματίες" value={counts.pros_total ?? "—"} />
        <Metric label="Πελάτες" value={counts.clients_total ?? "—"} />
        <Metric label="Ανοιχτά αιτήματα" value={counts.requests_open ?? "—"} hint="σε αναμονή διεκδίκησης" />
      </MetricGrid>

      <MetricGrid>
        <Metric label="Επερχόμενες κρατήσεις" value={counts.bookings_upcoming ?? "—"} />
        <Metric label="Ολοκληρωμένες" value={counts.bookings_completed ?? "—"} />
        <Metric
          label="Ακυρώσεις (30 ημ.)"
          value={counts.bookings_cancelled_30d ?? "—"}
          tone={counts.bookings_cancelled_30d > 0 ? "attention" : "plain"}
        />
        {/* Δουλειά που έδωσες εσύ και περιμένει απάντηση — χωριστά από τα
            αιτήματα των πελατών, γιατί την παρακολουθείς αλλιώς. */}
        <Metric
          label="Προτάσεις σε αναμονή"
          value={counts.offers_open ?? "—"}
          hint={counts.coverage_offered > 0 ? `${counts.coverage_offered} για κάλυψη ακύρωσης` : "δικές σου αναθέσεις"}
        />
        <Metric
          label="Άκαρπα αιτήματα (7 ημ.)"
          value={counts.requests_unclaimed_7d ?? "—"}
          hint="κανείς δεν τα διεκδίκησε"
          tone={counts.requests_unclaimed_7d > 0 ? "attention" : "plain"}
        />
      </MetricGrid>

      {/* Who is actually opening the app. Dormant accounts look identical to
          live ones in every other list, and the difference decides who you
          can hand short-notice work to. */}
      <MetricGrid>
        <Metric label="Ενεργοί σήμερα" value={live.active_24h ?? "—"} />
        <Metric label="Ενεργοί (7 ημ.)" value={live.active_7d ?? "—"} />
        <Metric label="Ενεργοί (30 ημ.)" value={live.active_30d ?? "—"} />
        <Metric
          label="Δεν μπήκαν ποτέ"
          value={live.never_seen ?? "—"}
          tone={live.never_seen > 0 ? "attention" : "plain"}
        />
      </MetricGrid>

      <Panel title="Πρόσφατη δραστηριότητα" padded={false}>
        {activity.length === 0 && <Empty>Καμία δραστηριότητα ακόμα.</Empty>}
        {activity.map((a, i) => (
          <Row key={`${a.kind}-${a.at}-${i}`}>
            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: ACTIVITY_TONE[a.kind] || colors.inkSoft,
                  flexShrink: 0,
                }}
              />
              <RowMain title={a.label} meta={`${ACTIVITY_LABEL[a.kind] || a.kind} · ${a.detail || ""}`} />
            </span>
            <span style={{ ...muted, fontSize: 11.5, flexShrink: 0 }}>{timeAgo(a.at)}</span>
          </Row>
        ))}
      </Panel>
    </AdminShell>
  );
}

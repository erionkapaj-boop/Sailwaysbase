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

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export default function AdminOverview() {
  const counts = useAdminCounts();
  const [activity, setActivity] = useState([]);
  const [live, setLive] = useState({});

  useEffect(() => {
    adminRecentActivity(18).then(setActivity).catch(() => {});
    adminActivityCounts().then(setLive).catch(() => {});
  }, []);

  const pendingTotal =
    (counts.pending_verification || 0) + (counts.pending_approvals || 0) + (counts.pending_secondary_roles || 0);
  const needsAttention =
    pendingTotal +
    (counts.coverage_needed || 0) +
    (counts.contact_new || 0) +
    (counts.open_disputes || 0) +
    (counts.profiles_invisible || 0) +
    (counts.suspended_count || 0);

  // Everything waiting on you, most time-sensitive first. Each row names the
  // count with the right grammatical number ("1 κράτηση", not "1 κρατήσεις")
  // and says what happens if it's left.
  const pendingParts = [
    counts.pending_verification > 0 &&
      plural(counts.pending_verification, "νέα εγγραφή για επαλήθευση", "νέες εγγραφές για επαλήθευση"),
    counts.pending_approvals > 0 &&
      plural(counts.pending_approvals, "επαγγελματίας για έγκριση", "επαγγελματίες για έγκριση"),
    counts.pending_secondary_roles > 0 &&
      plural(counts.pending_secondary_roles, "αίτηση επιπλέον ιδιότητας", "αιτήσεις επιπλέον ιδιότητας"),
  ].filter(Boolean);

  const rows = [
    counts.coverage_needed > 0 && {
      href: "/platform/admin/coverage",
      title: plural(counts.coverage_needed, "κράτηση έμεινε χωρίς επαγγελματία", "κρατήσεις έμειναν χωρίς επαγγελματία"),
      meta: "Ο επαγγελματίας ακύρωσε — βρες αντικαταστάτη πριν το ταξίδι.",
    },
    pendingTotal > 0 && {
      href: "/platform/admin/approvals",
      title: `Εκκρεμότητες (${pendingTotal})`,
      meta: `${pendingParts.join(" · ")}. Μέχρι να τις δεις, οι νέοι πελάτες δεν στέλνουν αιτήματα και οι επαγγελματίες δεν εμφανίζονται.`,
    },
    counts.contact_new > 0 && {
      href: "/platform/admin/messages",
      title: plural(counts.contact_new, "αναπάντητο μήνυμα επικοινωνίας", "αναπάντητα μηνύματα επικοινωνίας"),
      meta: "Κάποιος περιμένει απάντηση από εσένα.",
    },
    counts.open_disputes > 0 && {
      href: "/platform/admin/disputes",
      title: plural(counts.open_disputes, "ανοιχτή αναφορά ακύρωσης", "ανοιχτές αναφορές ακύρωσης"),
      meta: "Δες τι έγινε και κλείσε την αναφορά.",
    },
    counts.profiles_invisible > 0 && {
      href: "/platform/admin/users?filter=invisible",
      title: plural(counts.profiles_invisible, "επαγγελματίας χωρίς διαθεσιμότητα", "επαγγελματίες χωρίς διαθεσιμότητα"),
      meta:
        counts.profiles_invisible === 1
          ? "Εγκεκριμένος, αλλά δεν βγαίνει σε αναζητήσεις — μάλλον δεν το ξέρει. Ένα τηλέφωνο βοηθά."
          : "Εγκεκριμένοι, αλλά δεν βγαίνουν σε αναζητήσεις — μάλλον δεν το ξέρουν. Ένα τηλέφωνο βοηθά.",
    },
    counts.suspended_count > 0 && {
      href: "/platform/admin/users?tab=suspended",
      title: plural(counts.suspended_count, "λογαριασμός σε αναστολή", "λογαριασμοί σε αναστολή"),
      meta: "Σταματημένοι επ' αόριστο — δες αν ήρθε η ώρα να επαναφερθούν.",
    },
  ].filter(Boolean);

  return (
    <AdminShell title="Επισκόπηση" subtitle="Πρώτα ό,τι περιμένει εσένα, μετά οι αριθμοί.">
      <Panel
        title="Χρειάζονται ενέργεια"
        subtitle={needsAttention === 0 ? "Τίποτα εκκρεμές αυτή τη στιγμή." : undefined}
        padded={false}
      >
        {needsAttention === 0 ? (
          <Empty>Όλα τακτοποιημένα.</Empty>
        ) : (
          rows.map((r) => (
            <Link key={r.href} href={r.href} style={{ textDecoration: "none" }}>
              <Row tone="attention">
                <RowMain title={r.title} meta={r.meta} />
                <span style={{ ...muted, fontSize: 18 }}>›</span>
              </Row>
            </Link>
          ))
        )}
      </Panel>

      <h2 style={{ ...muted, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", margin: "26px 2px 10px" }}>
        Αριθμοί
      </h2>
      <MetricGrid>
        <Metric
          label="Χρήστες"
          value={counts.users_total ?? "—"}
          hint={`+${counts.users_new_7d ?? 0} την εβδομάδα`}
          href="/platform/admin/users?tab=all"
        />
        <Metric label="Επαγγελματίες" value={counts.pros_total ?? "—"} href="/platform/admin/users?tab=pro" />
        <Metric label="Πελάτες" value={counts.clients_total ?? "—"} href="/platform/admin/users?tab=client" />
        {/* Χωρίς σύνδεσμο επίτηδες: δεν υπάρχει καμία οθόνη στο admin που να
            δείχνει τα ανοιχτά αιτήματα πελατών ένα προς ένα — θα ήταν ένα
            κουμπί που δεν πάει πουθενά, ακριβώς το πρόβλημα που φτιάχνουμε. */}
        <Metric label="Ανοιχτά αιτήματα" value={counts.requests_open ?? "—"} hint="περιμένουν επαγγελματία" />
      </MetricGrid>

      <MetricGrid>
        <Metric
          label="Επερχόμενες κρατήσεις"
          value={counts.bookings_upcoming ?? "—"}
          href="/platform/admin/bookings?filter=upcoming"
        />
        <Metric
          label="Ολοκληρωμένες"
          value={counts.bookings_completed ?? "—"}
          href="/platform/admin/bookings?filter=completed"
        />
        <Metric
          label="Ακυρώσεις (30 ημ.)"
          value={counts.bookings_cancelled_30d ?? "—"}
          tone={counts.bookings_cancelled_30d > 0 ? "attention" : "plain"}
          href="/platform/admin/bookings?filter=cancelled"
        />
        {/* Δουλειά που έδωσες εσύ και περιμένει απάντηση — χωριστά από τα
            αιτήματα των πελατών, γιατί την παρακολουθείς αλλιώς. */}
        <Metric
          label="Προτάσεις σε αναμονή"
          value={counts.offers_open ?? "—"}
          hint={counts.coverage_offered > 0 ? `${counts.coverage_offered} για κάλυψη ακύρωσης` : "δικές σου αναθέσεις"}
          href="/platform/admin/offers"
        />
        {/* Χωρίς σύνδεσμο για τον ίδιο λόγο: δεν υπάρχει λίστα άκαρπων
            αιτημάτων πουθενά στο admin ακόμα. */}
        <Metric
          label="Αιτήματα χωρίς απάντηση (7 ημ.)"
          value={counts.requests_unclaimed_7d ?? "—"}
          hint="έληξαν χωρίς να τα αναλάβει κανείς"
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

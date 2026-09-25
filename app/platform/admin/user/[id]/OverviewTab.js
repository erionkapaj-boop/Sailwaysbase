"use client";
import { Panel, MetricGrid, Metric, Empty, colors, muted } from "../../ui";
import Stars from "../../../components/Stars";
import { formatDateTime } from "../../../../../lib/platform/notifications";
import { EventRow } from "./shared";

// Ό,τι χρειάζεται κανείς να δει πρώτο: τα βασικά νούμερα, τι εκκρεμεί ακριβώς
// (πέρα από τα «σοβαρά» issues που φαίνονται ήδη ψηλά στη σελίδα) και οι
// τελευταίες κινήσεις — για να καταλάβει ο admin σε λίγα δευτερόλεπτα πού
// βρίσκεται ο λογαριασμός, χωρίς να ανοίξει άλλη καρτέλα.
export default function OverviewTab({ data, onSelectTab }) {
  const u = data.user;
  const cp = data.client_profile;
  const sp = data.skipper_profile;

  const openDisputes = (data.disputes || []).filter((d) => !d.resolved_at);
  const openFlags = (data.flags || []).filter((f) => !f.resolved_at);
  const newMsgs = (data.contact_messages || []).filter((m) => m.status === "new");
  const recent = (data.timeline || []).slice(0, 6);

  return (
    <>
      <MetricGrid>
        <Metric label="Υπόλοιπο πορτοφολιού" value={`${u.wallet_balance ?? 0}€`} />
        {cp && <Metric label="Αξιοπιστία" value={cp.reliability_percentage != null ? `${cp.reliability_percentage}%` : "—"} />}
        {cp && <Metric label="Ολοκληρωμένες κρατήσεις" value={cp.completed_bookings_count ?? 0} />}
        {sp && <Metric label="Τιμή / ημέρα" value={`${sp.price_per_day}€`} />}
        {sp && <Metric label="Έγκριση" value={sp.approval_status === "approved" ? "Εγκεκριμένο" : sp.approval_status === "rejected" ? "Απορρίφθηκε" : "Σε αναμονή"} />}
        {sp && <Metric label="Αξιοπιστία" value={sp.reliability_percentage != null ? `${sp.reliability_percentage}%` : "—"} />}
      </MetricGrid>

      {(sp || cp) && (
        <Panel title="Αξιολόγηση">
          <Stars rating={sp?.rating_avg ?? cp?.rating_avg} count={(sp?.rating_count ?? cp?.rating_count) || 0} />
        </Panel>
      )}

      {(openDisputes.length > 0 || openFlags.length > 0 || newMsgs.length > 0) && (
        <Panel title="Χρειάζεται προσοχή" padded={false}>
          {openFlags.map((f) => (
            <div key={`flag-${f.id}`} style={{ padding: "10px 16px", borderBottom: `1px solid ${colors.border}`, fontSize: 13.5 }}>
              {f.type === "duplicate_email" ? "Ίδιο email με άλλον λογαριασμό" : f.type}
              {f.related_name && <span style={muted}> · σχετίζεται με {f.related_name}</span>}
              <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>{formatDateTime(f.created_at)}</div>
            </div>
          ))}
          {openDisputes.map((d) => (
            <button
              key={`dispute-${d.id}`}
              onClick={() => onSelectTab("finance")}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 16px",
                fontSize: 13.5,
                background: "none",
                border: "none",
                borderBottom: `1px solid ${colors.border}`,
                cursor: "pointer",
                fontFamily: "inherit",
                color: colors.ink,
              }}
            >
              Ανοιχτή αναφορά ακύρωσης{d.place ? ` · ${d.place}` : ""}
              {d.reason && <div style={{ ...muted, fontSize: 12.5, marginTop: 2 }}>{d.reason}</div>}
            </button>
          ))}
          {newMsgs.map((m) => (
            <div key={`msg-${m.id}`} style={{ padding: "10px 16px", borderBottom: `1px solid ${colors.border}`, fontSize: 13.5 }}>
              Μήνυμα επικοινωνίας χωρίς απάντηση
              <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>{formatDateTime(m.created_at)}</div>
            </div>
          ))}
        </Panel>
      )}

      <Panel
        title="Πρόσφατη δραστηριότητα"
        action={
          <button
            type="button"
            onClick={() => onSelectTab("history")}
            style={{ fontSize: 12.5, color: colors.ink, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
          >
            Όλο το ιστορικό
          </button>
        }
        padded={false}
      >
        {recent.length === 0 && <Empty>Καμία καταγεγραμμένη δραστηριότητα.</Empty>}
        {recent.map((e, i) => (
          <EventRow key={i} event={e} />
        ))}
      </Panel>
    </>
  );
}

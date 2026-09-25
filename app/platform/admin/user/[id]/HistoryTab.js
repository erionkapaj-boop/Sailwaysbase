"use client";
import { useState } from "react";
import { Panel, Empty, Toolbar, button } from "../../ui";
import { EventRow } from "./shared";

// Ένα ενιαίο, χρονολογικό ιστορικό — δημιουργία λογαριασμού, συνδέσεις,
// αιτήματα/κρατήσεις/μεταφορές, χρήματα, αναφορές, σημαίες και κάθε ενέργεια
// admin (επαλήθευση, κωδικοί, αναστολή, διαγραφή...). Το κείμενο
// κάθε γραμμής αποφασίζεται στο adminAudit.js, εδώ μόνο η λίστα.
//
// Φίλτρα γιατί οι συνδέσεις και οι κινήσεις πορτοφολιού πνίγουν όλα τα άλλα
// σε έναν ενεργό λογαριασμό — «τι έκανε ο admin εδώ;» πρέπει να απαντιέται
// με ένα κλικ, όχι με scroll.
const FILTERS = [
  { key: "all", label: "Όλα", match: () => true },
  { key: "admin", label: "Ενέργειες admin", match: (k) => k === "admin_action" || k === "admin_flag" },
  {
    key: "bookings",
    label: "Κρατήσεις & αιτήματα",
    match: (k) => k === "request_sent" || k.startsWith("booking_") || k.startsWith("delivery_") || k === "dispute_reported",
  },
  { key: "money", label: "Χρήματα", match: (k) => k === "wallet_txn" },
  { key: "access", label: "Σύνδεση & τηλέφωνο", match: (k) => k.startsWith("login_") || k === "email_reset_requested" || k === "phone_changed" },
];

export default function HistoryTab({ data }) {
  const [filter, setFilter] = useState("all");
  const timeline = data.timeline || [];
  const active = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const shown = timeline.filter((e) => active.match(e.kind));

  return (
    <Panel
      title={`Ιστορικό (${shown.length})`}
      subtitle={timeline.length >= 500 ? "Εμφανίζονται τα 500 πιο πρόσφατα γεγονότα." : undefined}
      padded={false}
    >
      <Toolbar>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{ ...button(filter === f.key ? "primary" : "secondary"), padding: "5px 11px", fontSize: 12.5 }}
          >
            {f.label}
          </button>
        ))}
      </Toolbar>
      {shown.length === 0 && <Empty>Τίποτα σε αυτή την κατηγορία.</Empty>}
      {shown.map((e, i) => (
        <EventRow key={`${e.kind}-${e.at}-${i}`} event={e} />
      ))}
    </Panel>
  );
}

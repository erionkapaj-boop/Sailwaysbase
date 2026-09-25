"use client";
import { Panel, Empty } from "../../ui";
import { EventRow } from "./shared";

// Ένα ενιαίο, χρονολογικό ιστορικό — δημιουργία λογαριασμού, συνδέσεις,
// αιτήματα/κρατήσεις/μεταφορές, χρήματα, αναφορές, σημαίες και κάθε ενέργεια
// admin (επαλήθευση, κωδικοί, «Σύνδεση ως», αναστολή, διαγραφή...). Το κείμενο
// κάθε γραμμής αποφασίζεται στο adminAudit.js, εδώ μόνο η λίστα.
export default function HistoryTab({ data }) {
  const timeline = data.timeline || [];
  return (
    <Panel title={`Ιστορικό (${timeline.length})`} padded={false}>
      {timeline.length === 0 && <Empty>Καμία καταγεγραμμένη δραστηριότητα.</Empty>}
      {timeline.map((e, i) => (
        <EventRow key={i} event={e} />
      ))}
    </Panel>
  );
}

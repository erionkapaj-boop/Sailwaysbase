"use client";
import { Panel, Empty, colors } from "../../ui";
import { formatDateRange } from "../../../../../lib/platform/notifications";
import { Chips } from "./shared";

// Θετικές δηλώσεις: μια άδεια λίστα σημαίνει «δεν εμφανίζεται πουθενά σε
// αναζήτηση», όχι «απασχολημένος» — ίδιο μοτίβο με την παλιά σελίδα.
export default function AvailabilityTab({ data }) {
  const windows = data.availability || [];
  return (
    <Panel title={`Διαθεσιμότητα (${windows.length})`} padded={false}>
      {windows.length === 0 && <Empty>Καμία δηλωμένη περίοδος, άρα δεν εμφανίζεται σε αναζητήσεις.</Empty>}
      {windows.map((w) => (
        <div key={w.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>{formatDateRange(w.start_date, w.end_date)}</div>
          <div style={{ marginTop: 8 }}>
            <Chips items={w.regions || []} />
          </div>
        </div>
      ))}
    </Panel>
  );
}

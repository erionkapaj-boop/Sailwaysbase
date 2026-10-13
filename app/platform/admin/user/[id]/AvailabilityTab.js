"use client";
import { useTranslations } from "next-intl";
import { useFormat } from "../../../useFormat";
import { Panel, Empty, colors } from "../../ui";
import { Chips } from "./shared";

// Θετικές δηλώσεις: μια άδεια λίστα σημαίνει «δεν εμφανίζεται πουθενά σε
// αναζήτηση», όχι «απασχολημένος» — ίδιο μοτίβο με την παλιά σελίδα.
export default function AvailabilityTab({ data }) {
  const t = useTranslations("AdminUser");
  const f = useFormat();
  const windows = data.availability || [];
  return (
    <Panel title={t("availability.title", { count: windows.length })} padded={false}>
      {windows.length === 0 && <Empty>{t("availability.empty")}</Empty>}
      {windows.map((w) => (
        <div key={w.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: colors.ink }}>{f.dateRange(w.start_date, w.end_date)}</div>
          <div style={{ marginTop: 8 }}>
            <Chips items={w.regions || []} />
          </div>
        </div>
      ))}
    </Panel>
  );
}

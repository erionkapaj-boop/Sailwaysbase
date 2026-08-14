"use client";
import { useEffect, useState } from "react";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { adminListSettings, adminUpdateSetting } from "../../../../lib/platform/db";

// Named and explained here rather than in the database, for the same reason
// the notification wording is: changing how something reads shouldn't need a
// migration, and an operator staring at `unclaimed_expiry_hours` deserves a
// sentence saying what moving it actually does.
const SETTING_META = {
  client_request_fee: {
    label: "Τέλος αιτήματος πελάτη",
    unit: "€",
    help: "Χρεώνεται όταν ο πελάτης στέλνει αίτημα. Επιστρέφεται αν κανείς δεν το διεκδικήσει.",
  },
  skipper_claim_fee: {
    label: "Τέλος διεκδίκησης",
    unit: "€",
    help: "Χρεώνεται στον επαγγελματία τη στιγμή που διεκδικεί ένα αίτημα.",
  },
  unclaimed_expiry_hours: {
    label: "Λήξη άκαρπου αιτήματος",
    unit: "ώρες",
    help: "Πόσο μένει ανοιχτό ένα αίτημα πριν λήξει και επιστραφεί το τέλος.",
  },
  cancellation_flag_review_threshold: {
    label: "Όριο ακυρώσεων για έλεγχο",
    unit: "ακυρώσεις",
    help: "Πόσες ακυρώσεις πριν ένας λογαριασμός σημανθεί για έλεγχο.",
  },
};

export default function SettingsPage() {
  const counts = useAdminCounts();
  const [list, setList] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  async function load() {
    try {
      const rows = await adminListSettings();
      setList(rows);
      setDrafts(Object.fromEntries(rows.map((r) => [r.key, String(r.value)])));
    } catch (err) {
      setError(err.message || String(err));
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(key) {
    setBusyKey(key);
    setError("");
    setSaved("");
    try {
      await adminUpdateSetting(key, drafts[key]);
      setSaved(key);
      await load();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <AdminShell
      title="Ρυθμίσεις"
      subtitle="Ισχύουν αμέσως για κάθε νέα ενέργεια. Δεν αλλάζουν αναδρομικά ό,τι έχει ήδη χρεωθεί."
      counts={counts}
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <Panel title="Τιμές και όρια" padded={false}>
        {list.length === 0 && <Empty>Φόρτωση…</Empty>}
        {list.map((s) => {
          const meta = SETTING_META[s.key] || { label: s.key, unit: "", help: "" };
          const dirty = drafts[s.key] !== String(s.value);
          return (
            <div key={s.key} style={{ borderBottom: `1px solid ${colors.border}`, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <RowMain title={meta.label} meta={meta.help} />
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <input
                    type="number"
                    value={drafts[s.key] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                    style={{
                      width: 90,
                      padding: "8px 10px",
                      fontSize: 14,
                      fontFamily: "inherit",
                      border: `1px solid ${dirty ? colors.warn : colors.border}`,
                      borderRadius: 8,
                      background: colors.card,
                      color: colors.ink,
                    }}
                  />
                  <span style={{ ...muted, fontSize: 13, minWidth: 52 }}>{meta.unit}</span>
                  <button
                    style={button(dirty ? "primary" : "secondary")}
                    disabled={!dirty || busyKey === s.key}
                    onClick={() => save(s.key)}
                  >
                    {busyKey === s.key ? "…" : "Αποθήκευση"}
                  </button>
                </span>
              </div>
              {saved === s.key && (
                <p style={{ color: colors.success, fontSize: 12.5, margin: "8px 0 0" }}>Αποθηκεύτηκε.</p>
              )}
            </div>
          );
        })}
      </Panel>
    </AdminShell>
  );
}

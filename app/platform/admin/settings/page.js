"use client";
import { useEffect, useState } from "react";
import AdminShell from "../AdminShell";
import { Panel, Row, RowMain, Empty, colors, muted, money, button } from "../ui";
import { adminListSettings, adminUpdateSetting } from "../../../../lib/platform/db";
import { useConfirm } from "../../components/ConfirmDialog";

const inputStyle = (dirty) => ({
  padding: "8px 10px",
  fontSize: 14,
  fontFamily: "inherit",
  border: `1px solid ${dirty ? colors.warn : colors.border}`,
  borderRadius: 8,
  background: colors.card,
  color: colors.ink,
});

// Named and explained here rather than in the database, for the same reason
// the notification wording is: changing how something reads shouldn't need a
// migration, and an operator staring at `unclaimed_expiry_hours` deserves a
// sentence saying what moving it actually does.
const SETTING_META = {
  // --- Χρεώσεις ---
  client_request_fee: {
    group: "fees",
    label: "Τέλος αιτήματος πελάτη",
    unit: "€",
    help: "Χρεώνεται όταν ο πελάτης στέλνει αίτημα, ανά θέση. Επιστρέφεται ως credit αν κανείς δεν το αναλάβει.",
  },
  skipper_claim_fee: {
    group: "fees",
    label: "Τέλος αποδοχής επαγγελματία",
    unit: "€",
    help: "Χρεώνεται στον επαγγελματία με ελληνικό κινητό (+30) τη στιγμή που αναλαμβάνει ένα αίτημα.",
  },
  skipper_claim_fee_foreign: {
    group: "fees",
    label: "Τέλος αποδοχής, ξένο κινητό",
    unit: "€",
    help: "Το ίδιο τέλος για επαγγελματία με κινητό άλλης χώρας (προστασία εγχώριας αγοράς). Μια δική σου ανάθεση με συγκεκριμένο τέλος υπερισχύει.",
  },
  // --- Χρόνοι λήξης ---
  unclaimed_expiry_hours: {
    group: "expiry",
    label: "Πόσο ισχύει ένα αίτημα πελάτη",
    unit: "ώρες",
    help: "Μετά από τόσες ώρες χωρίς αποδοχή το αίτημα λήγει και το τέλος επιστρέφεται στον πελάτη ως credit.",
  },
  delivery_expiry_hours: {
    group: "expiry",
    label: "Πόσο ισχύει μια πρόταση μεταφοράς",
    unit: "ώρες",
    help: "Πόσο μένει ανοιχτή μια πρόταση ρόλου σε μεταφορά σκάφους πριν λήξει.",
  },
  // --- Μεταφορές σκάφους ---
  delivery_skipper_rate_per_mile: {
    group: "delivery",
    label: "Βάση υπολογισμού: skipper",
    unit: "€/μίλι",
    help: "Από αυτήν (× μίλια) υπολογίζεται η προμήθεια της πλατφόρμας για skipper. Δεν είναι η αμοιβή του, αυτή τη συμφωνούν ελεύθερα.",
  },
  delivery_hostess_rate_per_mile: {
    group: "delivery",
    label: "Βάση υπολογισμού: hostess",
    unit: "€/μίλι",
    help: "Ίδιο σκεπτικό, για hostess.",
  },
  delivery_cook_rate_per_mile: {
    group: "delivery",
    label: "Βάση υπολογισμού: cook",
    unit: "€/μίλι",
    help: "Ίδιο σκεπτικό, για cook.",
  },
  delivery_deckhand_rate_per_mile: {
    group: "delivery",
    label: "Βάση υπολογισμού: ναύτης",
    unit: "€/μίλι",
    help: "Ίδιο σκεπτικό, για ναύτη.",
  },
  delivery_platform_fee_pct: {
    group: "delivery",
    label: "Ποσοστό προμήθειας",
    unit: "%",
    help: "Ποσοστό επί (μίλια × βάση ρόλου) που αποτελεί τη συνολική προμήθεια πλατφόρμας ανά θέση.",
  },
  delivery_min_fee: {
    group: "delivery",
    label: "Ελάχιστο τέλος",
    unit: "€",
    help: "Το πληρώνει πάντα ο επαγγελματίας όταν αναλαμβάνει· ο πελάτης πληρώνει ό,τι περισσεύει πάνω από αυτό.",
  },
  // --- Σύστημα ---
  otp_enabled: {
    group: "system",
    label: "Επιβεβαίωση κινητού με SMS",
    kind: "toggle",
    help: "«Ναι»: οι νέες εγγραφές επιβεβαιώνονται αυτόματα με κωδικό SMS και το «Ξέχασα τον κωδικό» δουλεύει με SMS. «Όχι»: κάθε νέα εγγραφή την επαληθεύεις εσύ (Εκκρεμότητες).",
    warn: "Βάλε «Ναι» μόνο αφού συνδεθεί πάροχος SMS στο Supabase, αλλιώς κανείς δεν θα μπορεί να εγγραφεί.",
  },
  // --- Αξιοπιστία & ακυρώσεις (τεχνικές) ---
  reliability_min_history: {
    group: "reliability",
    label: "Ελάχιστο ιστορικό για ποσοστό αξιοπιστίας",
    unit: "κρατήσεις",
    help: "Κάτω από τόσες ολοκληρωμένες ή ακυρωμένες κρατήσεις δεν δείχνουμε ποσοστό.",
  },
  cancellation_flag_review_threshold: {
    group: "reliability",
    label: "Όριο ακυρώσεων για έλεγχο",
    unit: "ακυρώσεις",
    help: "Πόσες ακυρώσεις πριν ένας λογαριασμός σημανθεί για έλεγχο.",
  },
  cancel_early_days: {
    group: "reliability",
    label: "Έγκαιρη ακύρωση από",
    unit: "ημέρες πριν",
    help: "Ακύρωση τόσες ή περισσότερες ημέρες πριν το ταξίδι θεωρείται έγκαιρη (ελαφριά βαρύτητα).",
  },
  cancel_late_days: {
    group: "reliability",
    label: "Ακύρωση τελευταίας στιγμής, κάτω από",
    unit: "ημέρες πριν",
    help: "Ακύρωση λιγότερες ημέρες πριν το ταξίδι θεωρείται τελευταίας στιγμής (βαριά).",
  },
  cancel_weight_early: {
    group: "reliability",
    label: "Βαρύτητα έγκαιρης ακύρωσης",
    unit: "",
    help: "Πόσο «μετράει» μια έγκαιρη ακύρωση (1 = όσο μια κανονική).",
  },
  cancel_weight_mid: {
    group: "reliability",
    label: "Βαρύτητα ενδιάμεσης ακύρωσης",
    unit: "",
    help: "Για ακυρώσεις ανάμεσα στην έγκαιρη και στην τελευταίας στιγμής.",
  },
  cancel_weight_late: {
    group: "reliability",
    label: "Βαρύτητα ακύρωσης τελευταίας στιγμής",
    unit: "",
    help: "Πόσο μετράει μια ακύρωση τελευταίας στιγμής.",
  },
  cancel_weight_after_start: {
    group: "reliability",
    label: "Βαρύτητα εγκατάλειψης εν πλω",
    unit: "",
    help: "Ακύρωση αφού έχει ξεκινήσει το ταξίδι, η χειρότερη περίπτωση.",
  },
  cancel_decay_full_months: {
    group: "reliability",
    label: "Μια ακύρωση μετράει ολόκληρη για",
    unit: "μήνες",
    help: "Μέχρι τόσους μήνες μετά μετράει ακέραιη· μετά αρχίζει να «ξεθωριάζει».",
  },
  cancel_decay_zero_months: {
    group: "reliability",
    label: "Μια ακύρωση ξεχνιέται μετά από",
    unit: "μήνες",
    help: "Από τόσους μήνες και μετά δεν μετράει καθόλου.",
  },
  cancel_prior_jobs: {
    group: "reliability",
    label: "Προίκα «καθαρών» δουλειών",
    unit: "δουλειές",
    help: "Κάθε επαγγελματίας ξεκινά σαν να έχει τόσες καθαρές δουλειές, ώστε μία ακύρωση να μην τον καταστρέφει από την αρχή.",
  },
  cancel_full_rate: {
    group: "reliability",
    label: "Ρυθμός ακυρώσεων για μέγιστη ποινή",
    unit: "",
    help: "Όταν οι ακυρώσεις φτάσουν αυτό το ποσοστό των δουλειών (0.5 = μία στις δύο), η θέση στις αναζητήσεις πέφτει στο κατώτατο.",
  },
};

const GROUPS = [
  { key: "fees", title: "Χρεώσεις" },
  { key: "expiry", title: "Χρόνοι λήξης" },
  { key: "delivery", title: "Μεταφορές σκάφους" },
  { key: "system", title: "Σύστημα" },
  {
    key: "reliability",
    title: "Αξιοπιστία & ακυρώσεις (για προχωρημένους)",
    subtitle: "Πώς βαραίνουν οι ακυρώσεις στη σειρά εμφάνισης των επαγγελματιών. Οι προεπιλογές είναι λογικές. Άλλαξέ τες μόνο αν ξέρεις τι θέλεις να πετύχεις.",
    collapsed: true,
  },
  { key: "other", title: "Άλλες" },
];

export default function SettingsPage() {
  const [list, setList] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [confirm, confirmDialog] = useConfirm();

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
    if (
      key === "otp_enabled" &&
      drafts[key] === "1" &&
      !(await confirm(
        "Ενεργοποίηση επιβεβαίωσης με SMS; Αν δεν έχει συνδεθεί πάροχος SMS στο Supabase, κανένας νέος χρήστης δεν θα μπορεί να εγγραφεί."
      ))
    )
      return;
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

  function renderSetting(s) {
    const meta = SETTING_META[s.key] || { label: s.key, unit: "", help: "" };
    const dirty = drafts[s.key] !== String(s.value);
    const field =
      meta.kind === "toggle" ? (
        <select
          value={drafts[s.key] ?? ""}
          onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
          style={{ ...inputStyle(dirty), width: 90 }}
        >
          <option value="0">Όχι</option>
          <option value="1">Ναι</option>
        </select>
      ) : (
        <input
          type="number"
          value={drafts[s.key] ?? ""}
          onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
          style={{ ...inputStyle(dirty), width: 90 }}
        />
      );
    return (
      <div key={s.key} style={{ borderBottom: `1px solid ${colors.border}`, padding: "14px 16px" }}>
        <RowMain title={meta.label} meta={meta.help} />
        {meta.warn && <p style={{ color: colors.warn, fontSize: 12.5, margin: "6px 0 0" }}>{meta.warn}</p>}
        <span style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          {field}
          {meta.unit && <span style={{ ...muted, fontSize: 13 }}>{meta.unit}</span>}
          <button
            style={button(dirty ? "primary" : "secondary")}
            disabled={!dirty || busyKey === s.key}
            onClick={() => save(s.key)}
          >
            {busyKey === s.key ? "…" : "Αποθήκευση"}
          </button>
        </span>
        {saved === s.key && <p style={{ color: colors.success, fontSize: 12.5, margin: "8px 0 0" }}>Αποθηκεύτηκε.</p>}
      </div>
    );
  }

  return (
    <AdminShell
      title="Ρυθμίσεις"
      subtitle="Ισχύουν αμέσως για κάθε νέα ενέργεια. Δεν αλλάζουν αναδρομικά ό,τι έχει ήδη χρεωθεί."
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      {list.length === 0 && <Empty>Φόρτωση…</Empty>}
      {GROUPS.map((g) => {
        const rows = list.filter((s) => (SETTING_META[s.key]?.group || "other") === g.key);
        if (rows.length === 0) return null;
        const body = rows.map((s) => renderSetting(s));
        if (g.collapsed) {
          return (
            <details key={g.key} style={{ marginBottom: 14 }}>
              <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: colors.ink, padding: "8px 2px" }}>
                {g.title}
              </summary>
              <Panel title={g.title} subtitle={g.subtitle} padded={false}>
                {body}
              </Panel>
            </details>
          );
        }
        return (
          <Panel key={g.key} title={g.title} subtitle={g.subtitle} padded={false}>
            {body}
          </Panel>
        );
      })}
      {confirmDialog}
    </AdminShell>
  );
}

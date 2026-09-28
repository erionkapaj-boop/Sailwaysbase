"use client";
import { friendlyError } from "../../../../lib/platform/friendlyError";
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
  credit_price_eur: {
    group: "credits",
    label: "Τιμή ενός credit",
    unit: "€",
    help: "Τιμή αγοράς ενός credit χωρίς πακέτο. Με αυτήν μετατρέπεται σε credits το κόστος των μεταφορών σκάφους.",
  },
  package_starter_credits: { group: "credits", label: "Starter: credits", unit: "credits", help: "" },
  package_starter_price: { group: "credits", label: "Starter: τιμή", unit: "€", help: "" },
  package_professional_credits: { group: "credits", label: "Professional: credits", unit: "credits", help: "" },
  package_professional_price: { group: "credits", label: "Professional: τιμή", unit: "€", help: "" },
  package_pro_credits: { group: "credits", label: "Pro: credits", unit: "credits", help: "" },
  package_pro_price: { group: "credits", label: "Pro: τιμή", unit: "€", help: "" },
  signup_credits_professional: {
    group: "credits",
    label: "Δώρο εγγραφής, επαγγελματίες",
    unit: "credits",
    help: "Πιστώνεται με την επαλήθευση του λογαριασμού.",
  },
  signup_credits_client: {
    group: "credits",
    label: "Δώρο εγγραφής, πελάτες",
    unit: "credits",
    help: "Πιστώνεται με την επαλήθευση του λογαριασμού. 0: κανένα δώρο.",
  },
  client_request_fee: {
    group: "fees",
    label: "Αίτημα πελάτη",
    unit: "credits",
    help: "Ανά θέση, όταν ο πελάτης στέλνει αίτημα. Επιστρέφονται αν κανείς δεν το αναλάβει. 0: δωρεάν για τους πελάτες.",
  },
  skipper_claim_fee: {
    group: "fees",
    label: "Ανάληψη από επαγγελματία",
    unit: "credits",
    help: "Τη στιγμή που ο επαγγελματίας αναλαμβάνει ένα αίτημα.",
  },
  // --- Χρόνοι λήξης ---
  unclaimed_expiry_hours: {
    group: "expiry",
    label: "Πόσο ισχύει ένα αίτημα πελάτη",
    unit: "ώρες",
    help: "Μετά από τόσες ώρες χωρίς αποδοχή το αίτημα λήγει και τα credits επιστρέφονται στον πελάτη.",
  },
  delivery_expiry_hours: {
    group: "expiry",
    label: "Πόσο ισχύει μια πρόταση μεταφοράς",
    unit: "ώρες",
    help: "Πόσο μένει ανοιχτή μια πρόταση ρόλου σε μεταφορά σκάφους πριν λήξει.",
  },
  pro_response_hours: {
    group: "expiry",
    label: "Προθεσμία απάντησης επαγγελματία",
    unit: "ώρες",
    help: "Από την επιβεβαίωση μιας κράτησης, τόσες ώρες έχει ο επαγγελματίας να απαντήσει στα μηνύματα. Αν δεν απαντήσει, ο πελάτης μπορεί να ακυρώσει χωρίς δική του επιβάρυνση.",
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
    help: "Ποσοστό επί (μίλια × βάση ρόλου): το συνολικό κόστος ανά θέση σε €, που μετατρέπεται σε credits με την τιμή του credit.",
  },
  delivery_min_fee: {
    group: "delivery",
    label: "Ελάχιστο κόστος",
    unit: "€",
    help: "Το αντίστοιχο σε credits χρησιμοποιεί ο επαγγελματίας όταν αναλαμβάνει· ο πελάτης το υπόλοιπο, επίσης σε credits.",
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
  { key: "credits", title: "Credits και πακέτα" },
  { key: "fees", title: "Χρεώσεις σε credits" },
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

// Οι τιμές όπως τις βλέπει ο χρήστης στη σελίδα Credits — μόνο όσες έχουν
// αποθηκευτεί.
function CreditPreview({ list }) {
  const v = Object.fromEntries(list.map((r) => [r.key, Number(r.value)]));
  const price = v.credit_price_eur;
  const packs = [
    ["Starter", v.package_starter_credits, v.package_starter_price],
    ["Professional", v.package_professional_credits, v.package_professional_price],
    ["Pro", v.package_pro_credits, v.package_pro_price],
  ].filter(([, c, p]) => c > 0 && p != null);
  if (price == null) return null;
  return (
    <div style={{ padding: "14px 16px", background: colors.seaGlass }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Όπως το βλέπει ο χρήστης (αποθηκευμένες τιμές)</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
        1 credit · {price}€
        {packs.map(([name, c, p]) => {
          const per = p / c;
          const off = price > 0 ? Math.round((1 - per / price) * 100) : 0;
          return (
            <div key={name}>
              {name} · {c} credits · {p}€ <span style={muted}>({Math.round(per * 100) / 100}€ το credit{off > 0 ? `, −${off}%` : ""})</span>
              {off < 0 && <span style={{ color: colors.danger }}> · ακριβότερο από το μεμονωμένο credit</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [list, setList] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState("");
  // Σφάλμα ανά ρύθμιση, κάτω από τη δική της γραμμή: στο κινητό ένα μήνυμα
  // στην κορυφή της σελίδας δεν φαίνεται ποτέ.
  const [rowErrors, setRowErrors] = useState({});
  const [saved, setSaved] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  const dirtyKeys = list.filter((s) => drafts[s.key] !== undefined && drafts[s.key] !== String(s.value)).map((s) => s.key);

  // Αλλαγές που δεν αποθηκεύτηκαν: ερώτηση πριν φύγεις από τη σελίδα.
  useEffect(() => {
    if (dirtyKeys.length === 0) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyKeys.length]);

  async function load() {
    try {
      const rows = await adminListSettings();
      setList(rows);
      setDrafts(Object.fromEntries(rows.map((r) => [r.key, String(r.value)])));
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    load();
  }, []);

  // Αποθηκεύει μία ρύθμιση χωρίς να αγγίξει τις υπόλοιπες αλλαγές που
  // εκκρεμούν. Επιστρέφει true αν πέτυχε.
  async function saveOne(key) {
    setRowErrors((e) => ({ ...e, [key]: "" }));
    try {
      await adminUpdateSetting(key, drafts[key]);
      setList((rows) => rows.map((r) => (r.key === key ? { ...r, value: Number(drafts[key]) } : r)));
      return true;
    } catch (err) {
      setRowErrors((e) => ({ ...e, [key]: friendlyError(err) }));
      return false;
    }
  }

  async function saveAll() {
    setBusyKey("__all__");
    setSaved("");
    for (const key of dirtyKeys) await saveOne(key);
    setBusyKey(null);
  }

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
    setSaved("");
    if (await saveOne(key)) setSaved(key);
    setBusyKey(null);
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
          {dirty && <span style={{ color: colors.warn, fontSize: 12.5 }}>Δεν έχει αποθηκευτεί</span>}
          <button
            style={button(dirty ? "primary" : "secondary")}
            disabled={!dirty || busyKey === s.key}
            onClick={() => save(s.key)}
          >
            {busyKey === s.key ? "…" : "Αποθήκευση"}
          </button>
        </span>
        {rowErrors[s.key] && <p style={{ color: colors.danger, fontSize: 12.5, margin: "8px 0 0" }}>{rowErrors[s.key]}</p>}
        {saved === s.key && !dirty && <p style={{ color: colors.success, fontSize: 12.5, margin: "8px 0 0" }}>Αποθηκεύτηκε.</p>}
      </div>
    );
  }

  return (
    <AdminShell
      ownerOnly
      title="Ρυθμίσεις"
      subtitle="Ισχύουν αμέσως για κάθε νέα ενέργεια. Δεν αλλάζουν αναδρομικά ό,τι έχει ήδη χρεωθεί."
    >
      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      {list.length === 0 && <Empty>Φόρτωση…</Empty>}
      {GROUPS.map((g) => {
        const rows = list.filter((s) => (SETTING_META[s.key]?.group || "other") === g.key);
        if (rows.length === 0) return null;
        const body = rows.map((s) => renderSetting(s));
        if (g.key === "credits") body.push(<CreditPreview key="__preview" list={list} />);
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
      {dirtyKeys.length > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: 12,
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 14px",
            marginTop: 12,
            background: colors.ink,
            color: "#fff",
            borderRadius: 12,
            boxShadow: "0 6px 24px rgba(22,40,60,0.25)",
          }}
        >
          <span style={{ fontSize: 14 }}>
            {dirtyKeys.length === 1 ? "1 αλλαγή δεν έχει αποθηκευτεί" : `${dirtyKeys.length} αλλαγές δεν έχουν αποθηκευτεί`}
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              style={{ ...button("secondary"), background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
              onClick={() => setDrafts(Object.fromEntries(list.map((r) => [r.key, String(r.value)])))}
            >
              Αναίρεση
            </button>
            <button
              type="button"
              style={{ ...button("primary"), background: "#fff", color: colors.ink, borderColor: "#fff" }}
              disabled={busyKey === "__all__"}
              onClick={saveAll}
            >
              {busyKey === "__all__" ? "…" : "Αποθήκευση όλων"}
            </button>
          </span>
        </div>
      )}
      {confirmDialog}
    </AdminShell>
  );
}

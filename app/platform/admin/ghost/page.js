"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { adminListAccounts, adminSeedDemoUsers } from "../../../../lib/platform/db";

// Ghost Mode: αυτό το panel δεν φτιάχνει καινούρια μηχανισμό — μαζεύει σε ένα
// σημείο τα ήδη υπάρχοντα, πραγματικά εργαλεία (Προβολή ως και τη
// δοκιμαστική εγγραφή χωρίς SMS) και εξηγεί πότε χρησιμοποιείς
// ποιο. Η Προβολή ως αφήνει πάντα ορατό, sticky banner με κουμπί εξόδου
// (PlatformShell.js) — δεν χρειάζεται ξεχωριστό εδώ.
const TEST_RANGE_LABEL = "+306980000001 έως +306980000099";

function TestPhoneRow({ u }) {
  return (
    <Row>
      <RowMain
        title={u.full_name || "(χωρίς όνομα)"}
        meta={
          <>
            <span style={money}>{u.phone_number}</span>
            {u.role && ` · ${u.role}`}
          </>
        }
      />
      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Status value={u.status} />
        <Link href={`/platform/admin/user/${u.id}`} style={{ textDecoration: "none" }}>
          <span style={{ ...button("secondary"), padding: "5px 10px", fontSize: 12 }}>Στοιχεία</span>
        </Link>
      </span>
    </Row>
  );
}

function GhostInner() {
  const counts = useAdminCounts();
  const [used, setUsed] = useState(null);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState(null);

  async function loadUsed() {
    try {
      const [active, deleted] = await Promise.all([
        adminListAccounts({ search: "+306980000", limit: 200 }),
        adminListAccounts({ search: "+306980000", limit: 200, deletedOnly: true }),
      ]);
      setUsed([...active, ...deleted].sort((a, b) => a.phone_number.localeCompare(b.phone_number)));
    } catch (err) {
      setError(err.message || String(err));
    }
  }
  useEffect(() => {
    loadUsed();
  }, []);

  // Μετακόμισε εδώ από τη λίστα Χρήστες — εργαλείο δοκιμών, δεν είναι
  // διαχείριση πραγματικού λογαριασμού. Οι 7 λογαριασμοί που φτιάχνει είναι
  // ΜΕΣΑ στη δεσμευμένη σειρά τηλεφώνων (+306980000004 έως 010), οπότε
  // ξαναφορτώνει και τη λίστα από κάτω μετά την επιτυχία.
  async function seed() {
    setSeeding(true);
    try {
      setSeedResult(await adminSeedDemoUsers());
      await loadUsed();
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <AdminShell
      title="Δοκιμές (Ghost Mode)"
      subtitle="Δοκιμή της εφαρμογής από την πλευρά κάθε ρόλου, χωρίς πραγματικούς λογαριασμούς."
      counts={counts}
    >
      <Panel title="1. Δες την εφαρμογή όπως τη βλέπει ένας χρήστης">
        <ol style={{ ...muted, margin: "0 0 12px", paddingLeft: 20, lineHeight: 1.7 }}>
          <li>
            Χρήστες, <b>Στοιχεία</b> του λογαριασμού, και πάτα <b>«Προβολή ως»</b>.
          </li>
          <li>Βλέπεις κάθε σελίδα ακριβώς όπως τη βλέπει εκείνος, χωρίς να μπορείς να κάνεις ενέργειες.</li>
          <li>
            Για να γυρίσεις, πάτα <b>«Έξοδος»</b> στη μπάρα που μένει πάνω σε κάθε σελίδα.
          </li>
        </ol>
        <p style={{ ...muted, margin: "0 0 14px", fontSize: 13 }}>
          Θες να <i>κάνεις</i> κάτι ως χρήστης (να στείλεις αίτημα, να αποδεχτείς κράτηση); Αποσυνδέσου και μπες με
          έναν δοκιμαστικό λογαριασμό (βήμα 2 ή 3 παρακάτω). Σε πραγματικό λογαριασμό δεν γίνεται: θα σήμαινε να
          αλλάξει ο κωδικός του χρήστη.
        </p>
        <Link href="/platform/admin/users" style={{ textDecoration: "none" }}>
          <span style={button("primary")}>Άνοιγμα λίστας χρηστών</span>
        </Link>
      </Panel>

      <Panel title="2. Κάνε μια δοκιμαστική εγγραφή από την αρχή">
        <p style={{ ...muted, margin: "0 0 8px" }}>
          Κάνε εγγραφή όπως ένας νέος χρήστης, αλλά με τηλέφωνο από αυτή τη σειρά. Δεν στέλνεται SMS:
        </p>
        <p style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 600 }}>{TEST_RANGE_LABEL}</p>
        <p style={{ ...muted, margin: "0 0 18px", fontSize: 13 }}>
          Το βήμα του SMS εμφανίζεται ως <b>«🧪 ΠΡΟΣΟΜΟΙΩΣΗ»</b>. Ένα νούμερο της σειράς είναι πάντα ο ίδιος
          λογαριασμός: αν τον διαγράψεις και ξαναγραφτείς, επιστρέφει με το ίδιο ιστορικό.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/platform" style={{ textDecoration: "none" }}>
            <span style={button("primary")}>Άνοιγμα αρχικής σελίδας</span>
          </Link>
          <Link href="/platform/register?as=professional" style={{ textDecoration: "none" }}>
            <span style={button("secondary")}>Απευθείας εγγραφή επαγγελματία</span>
          </Link>
        </div>
      </Panel>

      <Panel
        title="3. Δοκιμαστικά δεδομένα"
        subtitle="7 ψεύτικοι λογαριασμοί (5 επαγγελματίες, 2 πελάτες), όλοι με κωδικό 123456. Αν ξανατρέξει δεν διπλασιάζει τίποτα."
      >
        <button style={button("secondary")} disabled={seeding} onClick={seed}>
          {seeding ? "Δημιουργία…" : "Δημιουργία δοκιμαστικών λογαριασμών"}
        </button>
        {seedResult && (
          <div style={{ ...muted, fontSize: 13, marginTop: 12 }}>
            {seedResult.created?.length > 0 && (
              <>
                <div style={{ color: colors.success }}>Δημιουργήθηκαν {seedResult.created.length}:</div>
                {seedResult.created.map((c) => (
                  <div key={c} style={money}>
                    {c}
                  </div>
                ))}
              </>
            )}
            {seedResult.skipped?.length > 0 && <div style={{ marginTop: 6 }}>Υπήρχαν ήδη: {seedResult.skipped.length}</div>}
          </div>
        )}
      </Panel>

      <Panel title={`Ποια νούμερα της σειράς έχουν ήδη χρησιμοποιηθεί${used ? ` (${used.length})` : ""}`}>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {!used && !error && <Empty>Φόρτωση…</Empty>}
        {used && used.length === 0 && <Empty>Κανένα ακόμα. Όλη η σειρά είναι ελεύθερη.</Empty>}
        {used?.map((u) => (
          <TestPhoneRow key={u.id} u={u} />
        ))}
      </Panel>
    </AdminShell>
  );
}

export default function GhostPage() {
  return <GhostInner />;
}

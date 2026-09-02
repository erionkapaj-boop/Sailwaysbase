"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AdminShell, { useAdminCounts } from "../AdminShell";
import { Panel, Row, RowMain, Empty, Status, colors, muted, money, button } from "../ui";
import { adminListAccounts } from "../../../../lib/platform/db";

// Ghost Mode: αυτό το panel δεν φτιάχνει καινούρια μηχανισμό — μαζεύει σε ένα
// σημείο τα δύο ήδη υπάρχοντα, πραγματικά εργαλεία (Σύνδεση ως / Προβολή ως,
// και τώρα τη δοκιμαστική εγγραφή χωρίς SMS) και εξηγεί πότε χρησιμοποιείς
// ποιο. Και τα δύο αφήνουν πάντα ορατό, sticky banner με κουμπί επιστροφής
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

  useEffect(() => {
    (async () => {
      try {
        const [active, deleted] = await Promise.all([
          adminListAccounts({ search: "+306980000", limit: 200 }),
          adminListAccounts({ search: "+306980000", limit: 200, deletedOnly: true }),
        ]);
        setUsed([...active, ...deleted].sort((a, b) => a.phone_number.localeCompare(b.phone_number)));
      } catch (err) {
        setError(err.message || String(err));
      }
    })();
  }, []);

  return (
    <AdminShell
      title="Ghost Mode"
      subtitle="Δοκιμή της εφαρμογής από την πλευρά κάθε ρόλου — χωρίς να αγγίζει πραγματικούς λογαριασμούς."
      counts={counts}
    >
      <Panel title="1. Σύνδεση ως υπάρχων χρήστης">
        <p style={{ ...muted, margin: "0 0 14px" }}>
          Για να δεις την εφαρμογή ακριβώς όπως ένας συγκεκριμένος, ήδη υπαρκτός λογαριασμός — με πραγματική
          σύνδεση, όχι μόνο ανάγνωση: πήγαινε στη λίστα <b>Χρήστες</b>, βεβαιώσου ότι ο λογαριασμός είναι
          σημειωμένος ως «Λογαριασμός τεστ» (στα Στοιχεία του), και πάτα εκεί το κουμπί{" "}
          <b>«Σύνδεση ως»</b>. Γίνεται πραγματική εναλλαγή λογαριασμού — μπορείς να κάνεις ό,τι επιτρέπει ο
          ρόλος του. Ένα σκούρο μπάνερ μένει ορατό σε κάθε σελίδα με κουμπί <b>«Επιστροφή σε admin»</b>· η δική
          σου συνεδρία admin περιμένει εκεί, ανέγγιχτη.
        </p>
        <p style={{ ...muted, margin: "0 0 14px", fontSize: 13 }}>
          Θέλεις να δεις μια σελίδα όπως τη βλέπει κάποιος χωρίς να κάνεις τίποτα εκ μέρους του (μόνο ανάγνωση,
          όχι ενέργειες); Χρησιμοποίησε το <b>«Προβολή ως»</b> στη σελίδα του λογαριασμού — δεν χρειάζεται να
          είναι σημειωμένος ως τεστ.
        </p>
        <Link href="/platform/admin/users" style={{ textDecoration: "none" }}>
          <span style={button("primary")}>Άνοιγμα λίστας χρηστών →</span>
        </Link>
      </Panel>

      <Panel title="2. Δοκιμή εγγραφής ως νέος χρήστης">
        <p style={{ ...muted, margin: "0 0 14px" }}>
          Για να περάσεις ολόκληρη τη ροή εγγραφής όπως θα την έβλεπε ένας πραγματικά νέος χρήστης — από την
          αρχική σελίδα, κουμπί «Εγγραφή», ρόλος, στοιχεία, μέχρι τον ορισμό κωδικού και την προσγείωση στο
          dashboard — χρησιμοποίησε ένα τηλέφωνο από τη δεσμευμένη σειρά δοκιμών:
        </p>
        <p style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 600 }}>{TEST_RANGE_LABEL}</p>
        <p style={{ ...muted, margin: "0 0 18px", fontSize: 13.5 }}>
          Ένας τέτοιος αριθμός παρακάμπτει το πραγματικό SMS — το βήμα επαλήθευσης το δείχνει ρητά ως{" "}
          <b>«🧪 ΠΡΟΣΟΜΟΙΩΣΗ»</b>, όχι κρυφά. Ο ρόλος (πελάτης, skipper, hostess, μάγειρας, ναύτης) επιλέγεται
          στην ίδια την πραγματική φόρμα εγγραφής, ακριβώς όπως θα τον επέλεγε κάποιος πραγματικός. Κάθε αριθμός
          σε αυτή τη σειρά αναγνωρίζεται μόνιμα ως η ίδια ταυτότητα — αν τον διαγράψεις και ξαναγραφτείς με το
          ίδιο νούμερο, παίρνεις πίσω τον ίδιο λογαριασμό με το ίδιο ιστορικό (0074), δεν ξεκινάει καθαρός.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/platform" style={{ textDecoration: "none" }}>
            <span style={button("primary")}>Άνοιγμα αρχικής σελίδας →</span>
          </Link>
          <Link href="/platform/register?as=professional" style={{ textDecoration: "none" }}>
            <span style={button("secondary")}>Απευθείας εγγραφή επαγγελματία →</span>
          </Link>
        </div>
      </Panel>

      <Panel title={`Ποια νούμερα της σειράς έχουν ήδη χρησιμοποιηθεί${used ? ` (${used.length})` : ""}`}>
        {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}
        {!used && !error && <Empty>Φόρτωση…</Empty>}
        {used && used.length === 0 && <Empty>Κανένα ακόμα — όλη η σειρά είναι ελεύθερη.</Empty>}
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

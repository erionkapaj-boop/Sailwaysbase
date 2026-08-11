import Link from "next/link";
import { container, card, h1, h2, muted, button, colors, money } from "../../lib/platform/theme";

const STEPS = [
  {
    n: "01",
    title: "Αναζήτηση",
    body: "Επίλεξε διάστημα ημερών, λιμάνι και τύπο σκάφους. Δες λίστα ανώνυμων προφίλ διαθέσιμων skippers — φωτογραφία, αξιολόγηση, τιμή ανά ημέρα.",
  },
  {
    n: "02",
    title: "Καμπανάκι",
    body: "Επίλεξε έναν ή περισσότερους skippers και πλήρωσε το fee πλατφόρμας μία φορά. Το αίτημα φτάνει ταυτόχρονα σε όλους τους επιλεγμένους.",
  },
  {
    n: "03",
    title: "Ο πρώτος κερδίζει",
    body: "Ο πρώτος skipper που διεκδικεί το αίτημα κλειδώνει τη δουλειά. Η ταυτότητα αποκαλύπτεται μόλις επιβεβαιωθεί η κράτηση.",
  },
];

export default function LandingPage() {
  return (
    <div style={container}>
      <div style={{ textAlign: "center", padding: "56px 0 40px" }}>
        <h1 style={{ ...h1, fontSize: 36, fontWeight: 600, maxWidth: 620, margin: "0 auto 14px" }}>
          Βρες τον skipper σου. Χωρίς μεσάζοντες.
        </h1>
        <p style={{ ...muted, fontSize: 16, lineHeight: 1.6, maxWidth: 520, margin: "0 auto 28px" }}>
          Ανεξάρτητοι, εγκεκριμένοι skippers στην Ελλάδα. Δωρεάν αναζήτηση, ανώνυμα προφίλ,
          πληρωμή απευθείας στον skipper.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/platform/search">
            <button style={{ ...button("primary"), fontSize: 15, padding: "12px 24px" }}>
              Αναζήτηση Skipper
            </button>
          </Link>
          <Link href="/platform/login?role=skipper">
            <button style={{ ...button("secondary"), fontSize: 15, padding: "12px 24px" }}>
              Θέλω να γίνω Skipper
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {STEPS.map((s) => (
          <div key={s.n} style={card}>
            <div style={{ ...money, ...muted, fontSize: 12, letterSpacing: "0.08em", marginBottom: 10 }}>
              {s.n}
            </div>
            <h2 style={h2}>{s.title}</h2>
            <p style={{ ...muted, lineHeight: 1.6, margin: 0 }}>{s.body}</p>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: 28 }}>
        <h2 style={h2}>Για Skippers</h2>
        <p style={{ ...muted, lineHeight: 1.6, margin: 0 }}>
          Ορίζεις τη δική σου τιμή — ελάχιστο <span style={{ ...money, color: colors.ink }}>210€</span> ανά
          ημέρα — δηλώνεις πότε δεν είσαι διαθέσιμος, και διεκδικείς αιτήματα με προφορτωμένο wallet
          για ακαριαία απάντηση. Η πληρωμή της δουλειάς γίνεται απευθείας από τον πελάτη, εκτός
          πλατφόρμας.
        </p>
      </div>
    </div>
  );
}

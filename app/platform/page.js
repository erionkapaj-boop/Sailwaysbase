import Link from "next/link";
import { container, card, h1, h2, muted, button, colors } from "../../lib/platform/theme";

export default function LandingPage() {
  return (
    <div style={container}>
      <div style={{ textAlign: "center", padding: "40px 0 24px" }}>
        <h1 style={{ ...h1, fontSize: 34 }}>Βρες τον skipper σου. Χωρίς μεσάζοντες.</h1>
        <p style={{ ...muted, fontSize: 16, maxWidth: 560, margin: "10px auto 22px" }}>
          Ανεξάρτητοι, εγκεκριμένοι skippers στην Ελλάδα. Δωρεάν αναζήτηση, ανώνυμα προφίλ,
          πληρωμή απευθείας στον skipper.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/platform/search">
            <button style={{ ...button("primary"), fontSize: 16, padding: "12px 22px" }}>
              Αναζήτηση Skipper
            </button>
          </Link>
          <Link href="/platform/login?role=skipper">
            <button style={{ ...button("secondary"), fontSize: 16, padding: "12px 22px" }}>
              Θέλω να γίνω Skipper
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <div style={card}>
          <h2 style={h2}>1. Αναζήτηση</h2>
          <p style={muted}>
            Επίλεξε διάστημα ημερών, λιμάνι και τύπο σκάφους. Δες λίστα ανώνυμων προφίλ
            διαθέσιμων skippers — φωτογραφία, αξιολόγηση, τιμή/ημέρα.
          </p>
        </div>
        <div style={card}>
          <h2 style={h2}>2. Καμπανάκι</h2>
          <p style={muted}>
            Επίλεξε έναν ή περισσότερους skippers και πλήρωσε ένα μικρό fee πλατφόρμας μία
            φορά. Το αίτημα φτάνει ταυτόχρονα σε όλους τους επιλεγμένους.
          </p>
        </div>
        <div style={card}>
          <h2 style={h2}>3. Ο πρώτος κερδίζει</h2>
          <p style={muted}>
            Ο πρώτος skipper που διεκδικεί το αίτημα κλειδώνει τη δουλειά. Η ταυτότητα
            αποκαλύπτεται μόλις επιβεβαιωθεί η κράτηση, και μπορείτε να επικοινωνήσετε.
          </p>
        </div>
      </div>

      <div style={{ ...card, marginTop: 24, borderColor: colors.brand }}>
        <h2 style={h2}>Για Skippers</h2>
        <p style={muted}>
          Ορίζεις τη δική σου τιμή (ελάχιστο 210€/ημέρα), δηλώνεις πότε ΔΕΝ είσαι διαθέσιμος,
          και διεκδικείς αιτήματα με προφορτωμένο wallet για ακαριαία πληρωμή στο race. Η
          πληρωμή της δουλειάς γίνεται απευθείας από τον πελάτη, εκτός πλατφόρμας.
        </p>
      </div>
    </div>
  );
}

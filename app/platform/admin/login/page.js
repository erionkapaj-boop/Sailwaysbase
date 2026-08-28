"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../AuthContext";
import {
  signInWithPin,
  getMyUserRow,
  signOut,
  checkLoginAllowed,
  normalizePhone,
} from "../../../../lib/platform/db";
import BackButton from "../../components/BackButton";
import { container, card, h1, muted, button, input, label, colors } from "../../../../lib/platform/theme";

// Separate entrance so admin sign-in never sits alongside the public one.
//
// To be clear about what this is and isn't: a distinct URL is convenience,
// not protection. Anyone can reach this page, and what actually stops a
// non-admin is the role check below plus the is_admin() conditions in the
// database's row-level policies. Those are the real boundary.
export default function AdminLoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Το κλείδωμα δεν λήγει με τον χρόνο: μετράει τις αποτυχίες από την
  // τελευταία ΕΠΙΤΥΧΙΑ, οπότε τρία λάθη κλειδώνουν μόνιμα. Ο μόνος δρόμος
  // πίσω είναι νέος κωδικός — και χωρίς αυτόν τον σύνδεσμο ο διαχειριστής
  // έμενε σε αδιέξοδη οθόνη, κλειδωμένος έξω από την ίδια του την πλατφόρμα.
  const [lockedOut, setLockedOut] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signInWithPin(phone, pin);
      const me = await getMyUserRow();
      if (me?.role !== "admin" && !me?.is_staff_admin) {
        // Don't leave them half-signed-in on an admin URL — drop the session
        // and say plainly that this door isn't theirs.
        await signOut();
        await refresh();
        setError("Αυτός ο λογαριασμός δεν έχει δικαιώματα admin.");
        return;
      }
      await refresh();
      router.push("/platform/admin");
    } catch (err) {
      if (err.message === "locked_out") {
        setLockedOut(true);
        setError("");
      } else {
        setError("Λάθος τηλέφωνο ή κωδικός.");
        // Δείξε το κλείδωμα στην προσπάθεια που το προκαλεί, όχι στην επόμενη.
        const stillAllowed = await checkLoginAllowed(normalizePhone(phone));
        if (!stillAllowed) setLockedOut(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...container, maxWidth: 420 }}>
      <div style={{ paddingTop: 24 }}>
        <BackButton onClick={() => router.back()} />
        <h1 style={{ ...h1, marginTop: 20 }}>Admin</h1>
        <p style={muted}>Είσοδος διαχειριστή.</p>

        {lockedOut ? (
          // Χωρίς πεδία για νέα προσπάθεια: το κλείδωμα δεν λήγει μόνο του,
          // οπότε η φόρμα εδώ θα ήταν απλώς μια κλειστή πόρτα.
          <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
            <b style={{ fontWeight: 600 }}>Ο λογαριασμός κλειδώθηκε.</b>
            <p style={{ ...muted, margin: "8px 0 16px" }}>
              Έγιναν τρεις αποτυχημένες προσπάθειες. Το κλείδωμα δεν λήγει από μόνο του — για να
              συνεχίσεις, όρισε νέο κωδικό με το τηλέφωνό σου.
            </p>
            <Link href="/platform/forgot-pin">
              <button style={button("primary")}>Ορισμός νέου κωδικού</button>
            </Link>
          </div>
        ) : (
        <form onSubmit={submit} style={{ ...card, marginTop: 20 }}>
          <label style={label} htmlFor="a-phone">
            Κινητό τηλέφωνο
          </label>
          <input
            id="a-phone"
            required
            inputMode="tel"
            autoComplete="tel"
            style={{ ...input, marginBottom: 16 }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <label style={label} htmlFor="a-pin">
            Κωδικός
          </label>
          <input
            id="a-pin"
            type="password"
            required
            autoComplete="current-password"
            style={{ ...input, marginBottom: 20 }}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />

          <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%" }}>
            {busy ? "Είσοδος…" : "Είσοδος"}
          </button>

          {error && <p style={{ color: colors.danger, marginTop: 12, marginBottom: 0 }}>{error}</p>}
        </form>
        )}
      </div>
    </div>
  );
}

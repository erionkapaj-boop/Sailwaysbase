"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../AuthContext";
import {
  signInWithPin,
  getMyUserRow,
  signOut,
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
  // Όταν το Supabase αρνείται για λίγο (πολλές προσπάθειες από τη συσκευή).
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
          // Supabase's own limit on sign-in attempts (0107). The forgot-PIN page is no
          // help to the admin: with SMS off it only says "contact us".
          <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
            <b style={{ fontWeight: 600 }}>Πολλές προσπάθειες</b>
            <p style={{ ...muted, margin: "8px 0 16px" }}>
              Έγιναν πολλές προσπάθειες από αυτή τη συσκευή. Περίμενε λίγα λεπτά και δοκίμασε ξανά. Αν δεν θυμάσαι τον κωδικό, ένας
              άλλος διαχειριστής μπορεί να σου δώσει προσωρινό από Χρήστες, Στοιχεία, «Νέος προσωρινός κωδικός».
            </p>
            <button style={button("secondary")} onClick={() => setLockedOut(false)}>
              Δοκίμασε ξανά
            </button>
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

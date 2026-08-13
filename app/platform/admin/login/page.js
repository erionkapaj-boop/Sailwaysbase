"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../AuthContext";
import { signInWithPin, getMyUserRow, signOut } from "../../../../lib/platform/db";
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

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signInWithPin(phone, pin);
      const me = await getMyUserRow();
      if (me?.role !== "admin") {
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
      setError(
        err.message === "locked_out"
          ? "Ο λογαριασμός κλειδώθηκε μετά από τρεις αποτυχημένες προσπάθειες."
          : "Λάθος τηλέφωνο ή κωδικός."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...container, maxWidth: 420 }}>
      <div style={{ paddingTop: 40 }}>
        <h1 style={h1}>Admin</h1>
        <p style={muted}>Είσοδος διαχειριστή.</p>

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
      </div>
    </div>
  );
}

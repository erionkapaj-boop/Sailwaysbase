"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { signInWithPin, checkLoginAllowed, normalizePhone } from "../../../lib/platform/db";
import BackButton from "../components/BackButton";
import { container, card, h1, muted, button, input, label, colors } from "../../../lib/platform/theme";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, refresh } = useAuth();

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lockedOut, setLockedOut] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signInWithPin(phone, pin);
      await refresh();
      router.push(params.get("next") || "/platform");
    } catch (err) {
      if (err.message === "locked_out") {
        setLockedOut(true);
      } else {
        // Don't say whether the phone or the PIN was wrong — that would tell
        // an attacker which numbers have accounts.
        setError("Λάθος τηλέφωνο ή κωδικός.");
        // Surface the block on the attempt that causes it, not on the next one.
        const stillAllowed = await checkLoginAllowed(normalizePhone(phone));
        if (!stillAllowed) setLockedOut(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (session) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <h1 style={h1}>Είσαι ήδη συνδεδεμένος</h1>
        <p style={muted}>Χρησιμοποίησε το μενού για να πας στον λογαριασμό σου.</p>
      </div>
    );
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <BackButton onClick={() => router.back()} />
      <h1 style={{ ...h1, marginTop: 20 }}>Είσοδος</h1>

      {lockedOut ? (
        // Deliberately no retry field: after three consecutive failures the
        // only way forward is a reset, so offering the form again would just
        // waste attempts.
        <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
          <b style={{ fontWeight: 600 }}>Ο λογαριασμός κλειδώθηκε.</b>
          <p style={{ ...muted, margin: "8px 0 16px" }}>
            Έγιναν τρεις αποτυχημένες προσπάθειες. Για να συνεχίσεις, όρισε νέο κωδικό.
          </p>
          <Link href="/platform/forgot-pin">
            <button style={button("primary")}>Ορισμός νέου κωδικού</button>
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} style={{ ...card, marginTop: 20 }}>
          <label style={label} htmlFor="login-phone">
            Κινητό τηλέφωνο
          </label>
          <input
            id="login-phone"
            required
            inputMode="tel"
            placeholder="69XXXXXXXX"
            autoComplete="tel"
            style={{ ...input, marginBottom: 16 }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <label style={label} htmlFor="login-pin">
            Κωδικός
          </label>
          <input
            id="login-pin"
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

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <Link href="/platform/forgot-pin" style={{ ...muted, fontSize: 13, textDecoration: "none" }}>
              Ξέχασα τον κωδικό
            </Link>
            <Link href="/platform/register" style={{ ...muted, fontSize: 13, textDecoration: "none" }}>
              Δεν έχω λογαριασμό
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

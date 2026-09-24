"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { signInWithPin, checkLoginAllowed, normalizePhone, isSignedInAdmin } from "../../../lib/platform/db";
import { hasPendingBroadcast } from "../../../lib/platform/pendingBroadcast";
import { hasPendingDelivery } from "../../../lib/platform/pendingDelivery";
import BackButton from "../components/BackButton";
import { container, card, h1, muted, button, input, label, colors } from "../../../lib/platform/theme";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, refresh } = useAuth();
  const nextParam = params.get("next") || "";
  const fromSend = nextParam === "/platform/search" || nextParam === "/platform/delivery";

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
      // No explicit destination: a search or delivery request left waiting
      // (e.g. picked before the account was verified) is where they were;
      // an admin goes to the console rather than the client home page.
      const fallback = hasPendingBroadcast()
        ? "/platform/search"
        : hasPendingDelivery()
        ? "/platform/delivery"
        : (await isSignedInAdmin().catch(() => false))
        ? "/platform/admin"
        : "/platform";
      router.push(params.get("next") || fallback);
    } catch (err) {
      if (err.message === "locked_out") {
        setLockedOut(true);
      } else if (err.message === "account_deleted") {
        setError("Αυτός ο λογαριασμός έχει διαγραφεί. Κάνε ξανά εγγραφή με το ίδιο τηλέφωνο για να τον ενεργοποιήσεις ξανά.");
      } else if (err.message === "account_suspended") {
        setError("Ο λογαριασμός αυτός είναι σε αναστολή. Επικοινώνησε μαζί μας αν νομίζεις ότι πρόκειται για λάθος.");
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
      <h1 style={{ ...h1, marginTop: 20 }}>Σύνδεση</h1>
      {fromSend && (
        <p style={muted}>
          Για να σταλεί το αίτημά σου χρειάζεσαι λογαριασμό. Οι επιλογές σου κρατήθηκαν και δεν έχεις χρεωθεί τίποτα.
        </p>
      )}

      {lockedOut ? (
        // Locks expire after 15 minutes (0085); until then another attempt
        // would only be refused, so the form stays hidden behind "retry".
        <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
          <b style={{ fontWeight: 600 }}>Κλειδώθηκε για 15 λεπτά</b>
          <p style={{ ...muted, margin: "8px 0 16px" }}>
            Έγιναν τρεις λάθος προσπάθειες. Περίμενε 15 λεπτά και δοκίμασε ξανά — ή, αν δεν θυμάσαι τον κωδικό,
            ζήτα βοήθεια.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={button("secondary")} onClick={() => setLockedOut(false)}>
              Δοκίμασε ξανά
            </button>
            <Link href="/platform/forgot-pin" style={{ ...button("primary"), textDecoration: "none" }}>
              Ξέχασα τον κωδικό
            </Link>
          </div>
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
            {busy ? "Σύνδεση…" : "Σύνδεση"}
          </button>

          {error && <p style={{ color: colors.danger, marginTop: 12, marginBottom: 0 }}>{error}</p>}

          <div style={{ marginTop: 16 }}>
            <Link href="/platform/forgot-pin" style={{ ...muted, fontSize: 13, textDecoration: "none" }}>
              Ξέχασα τον κωδικό
            </Link>
          </div>
        </form>
      )}

      {/* A first-timer sent here from "Σύνδεση για αποστολή" has no account
          yet — sign-up was a small grey link in the corner of a login form. */}
      {!lockedOut && (
        <div style={{ ...card, marginTop: 16, textAlign: "center" }}>
          <p style={{ ...muted, margin: "0 0 12px" }}>Πρώτη φορά εδώ;</p>
          <Link
            href="/platform/register"
            style={{ ...button("secondary"), display: "block", textDecoration: "none", textAlign: "center" }}
          >
            Δημιουργία λογαριασμού
          </Link>
        </div>
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

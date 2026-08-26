"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { setPin } from "../../../lib/platform/db";
import { hasPendingBroadcast } from "../../../lib/platform/pendingBroadcast";
import { container, card, h1, muted, button, input, label, colors } from "../../../lib/platform/theme";

const MIN_LENGTH = 6;

function SetPinInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, refresh } = useAuth();

  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const tooShort = pin.length > 0 && pin.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && pin !== confirm;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (pin.length < MIN_LENGTH) return setError(`Ο κωδικός θέλει τουλάχιστον ${MIN_LENGTH} χαρακτήρες.`);
    if (pin !== confirm) return setError("Οι δύο κωδικοί δεν ταιριάζουν.");

    setBusy(true);
    try {
      await setPin(pin);
      await refresh();
      if (hasPendingBroadcast()) {
        // A search + pick made before signing up is waiting on
        // /platform/search — that takes priority over the usual
        // role-based landing page.
        router.push("/platform/search");
        return;
      }
      const next = params.get("next");
      router.push(next === "skipper" ? "/platform/skipper" : "/platform/client");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <p style={muted}>Χρειάζεται σύνδεση για να ορίσεις κωδικό.</p>
      </div>
    );
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <h1 style={h1}>Δημιούργησε κωδικό</h1>
      <p style={muted}>
        Θα τον χρησιμοποιείς μαζί με το τηλέφωνό σου σε κάθε επόμενη είσοδο. Διάλεξε ό,τι θες, αρκεί
        να έχει {MIN_LENGTH} χαρακτήρες ή περισσότερους.
      </p>

      <form onSubmit={submit} style={{ ...card, marginTop: 20 }}>
        <label style={label} htmlFor="pin">
          Κωδικός
        </label>
        <input
          id="pin"
          type="password"
          required
          autoComplete="new-password"
          style={{ ...input, marginBottom: tooShort ? 6 : 16 }}
          value={pin}
          onChange={(e) => setPinValue(e.target.value)}
        />
        {tooShort && (
          <p style={{ ...muted, fontSize: 13, margin: "0 0 16px" }}>
            Ακόμα {MIN_LENGTH - pin.length} χαρακτήρες.
          </p>
        )}

        <label style={label} htmlFor="pin-confirm">
          Επανάληψη κωδικού
        </label>
        <input
          id="pin-confirm"
          type="password"
          required
          autoComplete="new-password"
          style={{ ...input, marginBottom: mismatch ? 6 : 20 }}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && (
          <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 20px" }}>
            Οι δύο κωδικοί δεν ταιριάζουν.
          </p>
        )}

        <button
          type="submit"
          disabled={busy || pin.length < MIN_LENGTH || pin !== confirm}
          style={{ ...button("primary"), width: "100%" }}
        >
          {busy ? "Αποθήκευση…" : "Αποθήκευση κωδικού"}
        </button>
      </form>

      {error && <p style={{ color: colors.danger, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

export default function SetPinPage() {
  return (
    <Suspense fallback={null}>
      <SetPinInner />
    </Suspense>
  );
}

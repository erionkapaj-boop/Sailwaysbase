"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthContext";
import {
  requestPinResetSms,
  confirmPinResetSms,
  requestPinResetEmail,
  confirmPinResetEmail,
} from "../../../lib/platform/db";
import { container, card, h1, muted, button, input, label, colors, radius } from "../../../lib/platform/theme";

const MIN_LENGTH = 6;

const tab = (active) => ({
  flex: 1,
  padding: "10px 12px",
  borderRadius: radius.md,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});

export default function ForgotPinPage() {
  const router = useRouter();
  const { refresh } = useAuth();

  const [channel, setChannel] = useState("sms");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function request(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (channel === "sms") {
        await requestPinResetSms(phone);
        setNotice("Σου στείλαμε κωδικό με SMS.");
      } else {
        const res = await requestPinResetEmail(phone);
        // Be straight with the user rather than claiming an email was sent:
        // no provider is configured yet, so nothing actually leaves the server.
        setNotice(
          res?.delivered === false
            ? "Η αποστολή email δεν είναι ακόμα ενεργή. Χρησιμοποίησε την επαναφορά μέσω SMS."
            : "Αν υπάρχει λογαριασμός με αυτό το τηλέφωνο, στάλθηκε κωδικός στο email του."
        );
      }
      setSent(true);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e) {
    e.preventDefault();
    setError("");
    if (newPin.length < MIN_LENGTH) return setError(`Ο κωδικός θέλει τουλάχιστον ${MIN_LENGTH} χαρακτήρες.`);

    setBusy(true);
    try {
      if (channel === "sms") {
        await confirmPinResetSms(phone, code, newPin);
        await refresh();
        router.push("/platform");
      } else {
        await confirmPinResetEmail(phone, code, newPin);
        setNotice("Ο κωδικός άλλαξε. Μπορείς να συνδεθείς.");
        router.push("/platform/login");
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <h1 style={h1}>Ξέχασα τον κωδικό</h1>
      <p style={muted}>Επίλεξε πώς θέλεις να επιβεβαιώσεις την ταυτότητά σου.</p>

      <div style={{ display: "flex", gap: 8, margin: "20px 0" }}>
        <button type="button" style={tab(channel === "sms")} onClick={() => { setChannel("sms"); setSent(false); }}>
          Με SMS
        </button>
        <button type="button" style={tab(channel === "email")} onClick={() => { setChannel("email"); setSent(false); }}>
          Με email
        </button>
      </div>

      <form onSubmit={sent ? confirm : request} style={card}>
        <label style={label} htmlFor="fp-phone">
          Κινητό τηλέφωνο
        </label>
        <input
          id="fp-phone"
          required
          inputMode="tel"
          placeholder="69XXXXXXXX"
          style={{ ...input, marginBottom: 16 }}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={sent}
        />

        {sent && (
          <>
            <label style={label} htmlFor="fp-code">
              Κωδικός επαλήθευσης
            </label>
            <input
              id="fp-code"
              required
              inputMode="numeric"
              style={{ ...input, marginBottom: 16 }}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />

            <label style={label} htmlFor="fp-pin">
              Νέος κωδικός
            </label>
            <input
              id="fp-pin"
              type="password"
              required
              autoComplete="new-password"
              style={{ ...input, marginBottom: 20 }}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
            />
          </>
        )}

        <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%" }}>
          {busy ? "…" : sent ? "Ορισμός νέου κωδικού" : "Αποστολή κωδικού"}
        </button>
      </form>

      {notice && <p style={{ ...muted, marginTop: 12 }}>{notice}</p>}
      {error && <p style={{ color: colors.danger, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

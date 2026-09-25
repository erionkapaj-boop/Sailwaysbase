"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import {
  requestPinResetSms,
  confirmPinResetSms,
  requestPinResetEmail,
  confirmPinResetEmail,
  getPinResetChannels,
} from "../../../lib/platform/db";
import BackButton from "../components/BackButton";
import { container, card, h1, muted, button, input, label, colors, radius } from "../../../lib/platform/theme";
import { friendlyError } from "../../../lib/platform/friendlyError";

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

  // Only channels that really deliver are offered (getPinResetChannels):
  // a tab for a channel with no provider behind it would send someone
  // through a flow that quietly goes nowhere. Checked on mount rather than
  // assumed, so each channel appears the moment it's actually turned on.
  const [channels, setChannels] = useState(null);
  useEffect(() => {
    getPinResetChannels()
      .then((c) => {
        setChannels(c);
        if (!c.sms && c.email) setChannel("email");
      })
      .catch(() => setChannels({ sms: false, email: false }));
  }, []);

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
        await requestPinResetEmail(phone);
        setNotice(
          "Αν ο λογαριασμός σου έχει δηλωμένο email, σου στείλαμε κωδικό — ισχύει 15 λεπτά. Δεν ήρθε; Έλεγξε τα ανεπιθύμητα ή επικοινώνησε μαζί μας."
        );
      }
      setSent(true);
    } catch (err) {
      setError(friendlyError(err));
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
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (channels === null) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <BackButton onClick={() => router.back()} />
        <h1 style={{ ...h1, marginTop: 20 }}>Ξέχασα τον κωδικό</h1>
      </div>
    );
  }

  if (!channels.sms && !channels.email) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <BackButton onClick={() => router.back()} />
        <h1 style={{ ...h1, marginTop: 20 }}>Ξέχασα τον κωδικό</h1>
        <div style={{ ...card, marginTop: 20 }}>
          <p style={{ margin: "0 0 12px" }}>
            Η αυτόματη επαναφορά κωδικού δεν είναι ακόμα διαθέσιμη.
          </p>
          <p style={{ ...muted, margin: "0 0 16px" }}>
            Γράψε μας από τη φόρμα επικοινωνίας με το τηλέφωνό σου. Θα σου δώσουμε έναν προσωρινό κωδικό για να
            μπεις, και αμέσως μετά θα ορίσεις δικό σου — κανείς άλλος δεν θα τον ξέρει.
          </p>
          <Link
            href="/platform/contact"
            style={{ ...button("primary"), width: "100%", display: "block", textAlign: "center", textDecoration: "none" }}
          >
            Επικοινωνία
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <BackButton onClick={() => router.back()} />
      <h1 style={{ ...h1, marginTop: 20 }}>Ξέχασα τον κωδικό</h1>
      <p style={muted}>
        {channels.sms && channels.email
          ? "Επίλεξε πώς θέλεις να επιβεβαιώσεις την ταυτότητά σου."
          : channels.sms
          ? "Θα σου στείλουμε κωδικό με SMS στο κινητό σου."
          : "Θα σου στείλουμε κωδικό στο email που έχεις δηλώσει στον λογαριασμό σου."}
      </p>

      {channels.sms && channels.email ? (
        <div style={{ display: "flex", gap: 8, margin: "20px 0" }}>
          <button type="button" style={tab(channel === "sms")} onClick={() => { setChannel("sms"); setSent(false); }}>
            Με SMS
          </button>
          <button type="button" style={tab(channel === "email")} onClick={() => { setChannel("email"); setSent(false); }}>
            Με email
          </button>
        </div>
      ) : (
        <div style={{ height: 20 }} />
      )}

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

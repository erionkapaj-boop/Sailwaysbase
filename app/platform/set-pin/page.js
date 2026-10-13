"use client";
import { Suspense, useState } from "react";
import { isWeakPin } from "../../../lib/platform/pin";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import { setPin } from "../../../lib/platform/db";
import { hasPendingBroadcast } from "../../../lib/platform/pendingBroadcast";
import { hasPendingDelivery } from "../../../lib/platform/pendingDelivery";
import BackButton from "../components/BackButton";
import { container, card, h1, muted, button, input, label, colors } from "../../../lib/platform/theme";
import { friendlyError } from "../../../lib/platform/friendlyError";

const MIN_LENGTH = 6;

export default function SetPinPage() {
  return (
    <Suspense fallback={null}>
      <SetPinInner />
    </Suspense>
  );
}

// useSearchParams() (για ?as=professional, μεταφερμένο από την εγγραφή)
// χρειάζεται Suspense boundary γύρω του στο app router.
function SetPinInner() {
  const t = useTranslations("SetPin");
  const router = useRouter();
  const params = useSearchParams();
  const isProfessional = params.get("as") === "professional";
  // Reached from Το προφίλ μου → Αλλαγή κωδικού (e.g. after the admin gave a
  // temporary one) rather than straight after signing up.
  const isChange = params.get("change") === "1";
  // Sent here by PinChangeGate after signing in with an admin's temporary PIN.
  const isRequired = params.get("required") === "1";
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
    if (pin.length < MIN_LENGTH) return setError(t("tooShortError", { min: MIN_LENGTH }));
    if (isWeakPin(pin)) return setError(t("weak"));
    if (pin !== confirm) return setError(t("mismatch"));

    setBusy(true);
    try {
      await setPin(pin);
      await refresh();
      if (isRequired) {
        router.push("/platform");
        return;
      }
      if (isChange) {
        router.push("/platform/profile?pin=changed");
        return;
      }
      if (hasPendingBroadcast()) {
        // A search + pick made before signing up is waiting on
        // /platform/search — that takes priority over the usual
        // role-based landing page.
        router.push("/platform/search");
        return;
      }
      if (hasPendingDelivery()) {
        // Same idea for a boat delivery request started before signing up —
        // the picked crew and form are waiting on /platform/delivery.
        router.push("/platform/delivery");
        return;
      }
      // A brand-new client with nothing pending used to land on an empty
      // "Αιτήματα" list with no explanation — confusing in a usability pass.
      // The home page (with a short welcome) is a much clearer first stop; a
      // professional signup still goes to Αιτήματα, where their own
      // approval-status banner and inbox live.
      router.push(isProfessional ? "/platform/requests" : "/platform?welcome=1");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <BackButton onClick={() => router.back()} />
        <p style={{ ...muted, marginTop: 20 }}>{t("needSignIn")}</p>
      </div>
    );
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      {!isRequired && <BackButton onClick={() => router.back()} />}
      <h1 style={{ ...h1, marginTop: 20 }}>
        {isRequired ? t("titleRequired") : isChange ? t("titleChange") : t("titleNew")}
      </h1>
      <p style={muted}>
        {isRequired && t("introTemporary")}
        {t("intro", { min: MIN_LENGTH })}
      </p>

      <form onSubmit={submit} style={{ ...card, marginTop: 20 }}>
        <label style={label} htmlFor="pin">
          {t("pinLabel")}
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
            {t("remaining", { count: MIN_LENGTH - pin.length })}
          </p>
        )}

        <label style={label} htmlFor="pin-confirm">
          {t("confirmLabel")}
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
            {t("mismatch")}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || pin.length < MIN_LENGTH || pin !== confirm}
          style={{ ...button("primary"), width: "100%" }}
        >
          {busy ? t("saving") : t("save")}
        </button>
      </form>

      {error && <p style={{ color: colors.danger, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

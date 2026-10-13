"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import { signInWithPin, isSignedInAdmin, signInWithGoogle, GOOGLE_LOGIN_ENABLED } from "../../../lib/platform/db";
import GoogleButton, { OrDivider } from "../components/GoogleButton";
import { hasPendingBroadcast } from "../../../lib/platform/pendingBroadcast";
import { hasPendingDelivery } from "../../../lib/platform/pendingDelivery";
import BackButton from "../components/BackButton";
import PhoneField from "../components/PhoneField";
import { container, card, h1, muted, button, input, label, colors, tapTarget } from "../../../lib/platform/theme";

function LoginInner() {
  const t = useTranslations("Login");
  const router = useRouter();
  const params = useSearchParams();
  const { session, userRow, loading, refresh, signOut } = useAuth();
  const nextParam = params.get("next") || "";
  const fromSend = nextParam === "/platform/search" || nextParam === "/platform/delivery";

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lockedOut, setLockedOut] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function google() {
    setError("");
    setGoogleBusy(true);
    try {
      await signInWithGoogle({ next: nextParam });
    } catch {
      setGoogleBusy(false);
      setError(t("googleFailed"));
    }
  }

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
        setError(t("accountDeleted"));
      } else if (err.message === "account_suspended") {
        setError(t("accountSuspended"));
      } else {
        // Don't say whether the phone or the PIN was wrong — that would tell
        // an attacker which numbers have accounts.
        setError(t("wrongCredentials"));
      }
    } finally {
      setBusy(false);
    }
  }

  if (session && !loading && !userRow) {
    // Συνδεδεμένος χωρίς ολοκληρωμένο λογαριασμό (π.χ. γύρισε πίσω στη μέση της σύνδεσης με
    // Google): δεν υπάρχει μενού, οπότε η έξοδος είναι από εδώ. Συνέχεια μόνο για όποιον μπήκε με
    // Google: η σελίδα επιστροφής της Google δεν ολοκληρώνει εγγραφή με τηλέφωνο.
    const meta = session.user?.app_metadata || {};
    const viaGoogle = meta.provider === "google" || (meta.providers || []).includes("google");
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <h1 style={h1}>{t("incompleteTitle")}</h1>
        <p style={muted}>{t("incompleteBody")}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 20 }}>
          {viaGoogle && (
            <Link href="/platform/auth/google" style={{ ...button("primary"), textDecoration: "none" }}>
              {t("continueSignup")}
            </Link>
          )}
          <button type="button" style={button("secondary")} onClick={() => signOut("/platform/login")}>
            {t("signOut")}
          </button>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <h1 style={h1}>{t("alreadyTitle")}</h1>
        <p style={muted}>{t("alreadyBody")}</p>
      </div>
    );
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <BackButton onClick={() => router.back()} />
      <h1 style={{ ...h1, marginTop: 20 }}>{t("title")}</h1>
      {fromSend && (
        <p style={muted}>{t("fromSend")}</p>
      )}

      {lockedOut ? (
        // Supabase's own limit on sign-in attempts (0107): until it passes
        // another attempt would only be refused.
        <div style={{ ...card, marginTop: 20, borderLeft: `3px solid ${colors.warn}` }}>
          <b style={{ fontWeight: 600 }}>{t("tooManyTitle")}</b>
          <p style={{ ...muted, margin: "8px 0 16px" }}>
            {t("tooManyBody")}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={button("secondary")} onClick={() => setLockedOut(false)}>
              {t("tryAgain")}
            </button>
            <Link href="/platform/forgot-pin" style={{ ...button("primary"), textDecoration: "none" }}>
              {t("forgot")}
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} style={{ ...card, marginTop: 20 }}>
          {GOOGLE_LOGIN_ENABLED && (
            <>
              <GoogleButton onClick={google} busy={googleBusy} />
              <OrDivider />
            </>
          )}
          <label style={label} htmlFor="login-phone">
            {t("phoneLabel")}
          </label>
          <div style={{ marginBottom: 16 }}>
            <PhoneField id="login-phone" quiet onChange={({ phone: p }) => setPhone(p)} />
          </div>

          <label style={label} htmlFor="login-pin">
            {t("pinLabel")}
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
            {busy ? t("submitBusy") : t("title")}
          </button>

          {error && <p style={{ color: colors.danger, marginTop: 12, marginBottom: 0 }}>{error}</p>}

          <div style={{ marginTop: 16 }}>
            <Link href="/platform/forgot-pin" style={{ ...muted, ...tapTarget, fontSize: 13, textDecoration: "none" }}>
              {t("forgot")}
            </Link>
          </div>
        </form>
      )}

      {/* A first-timer sent here from "Σύνδεση για αποστολή" has no account
          yet — sign-up was a small grey link in the corner of a login form. */}
      {!lockedOut && (
        <div style={{ ...card, marginTop: 16, textAlign: "center" }}>
          <p style={{ ...muted, margin: "0 0 12px" }}>{t("firstTime")}</p>
          <Link
            href="/platform/register"
            style={{ ...button("secondary"), display: "block", textDecoration: "none", textAlign: "center" }}
          >
            {t("createAccount")}
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

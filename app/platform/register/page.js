"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import {
  sendOtp,
  verifyOtp,
  createUserDraft,
  isReservedTestPhone,
  testPhoneSignIn,
  pendingSignIn,
  getOtpEnabled,
  signInWithGoogle,
  GOOGLE_LOGIN_ENABLED,
} from "../../../lib/platform/db";
import GoogleButton, { OrDivider } from "../components/GoogleButton";
import { CREW_ROLES } from "../../../lib/platform/roles";
import PhoneField from "../components/PhoneField";
import BackButton from "../components/BackButton";
import { normalizePhone, isValidPhone } from "../../../lib/platform/phone";
import { container, card, h1, muted, button, input, label, colors, radius } from "../../../lib/platform/theme";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { trackFlow, noteFailure } from "../../../lib/platform/health";

// "not_a_test_phone"/"use_test_signin_instead" never reach a real user (the
// UI itself picks the right path by isTestPhone) — only listed here in case
// a stale tab races the two.
// One answer for every "this number can't be used" (0107): the page must not
// reveal whether a number belongs to a live, an old or a deleted account.
// Τιμές: κλειδιά μηνυμάτων (Register.*), μεταφράζονται στο render.
const REGISTER_ERRORS = {
  phone_unavailable: "phoneUnavailable",
  phone_already_registered: "phoneUnavailable",
  phone_previously_used: "phoneUnavailable",
  phone_taken: "phoneUnavailable",
  test_phone_registered: "testPhoneRegistered",
  invalid_phone: "invalidPhone",
};

const chip = (active) => ({
  padding: "9px 16px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});

function RegisterInner() {
  const t = useTranslations("Register");
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();

  // ?as=professional switches the form into professional mode (adds the role
  // picker). Clients get the same fields minus that one.
  const isProfessional = params.get("as") === "professional";

  const [form, setForm] = useState({ fullName: "", phone: "", email: "" });
  const [phoneValid, setPhoneValid] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [crewRole, setCrewRole] = useState(isProfessional ? "skipper" : null);
  // Το τηλέφωνο έρχεται έτοιμο σε διεθνή μορφή (+30…) από το PhoneField, για όλους.
  const fullPhone = form.phone;
  // Ghost Mode (βλ. db.js): μια δεσμευμένη σειρά τηλεφώνων δοκιμής
  // (+306980000001-099) παρακάμπτει το πραγματικό SMS — ΟΡΑΤΑ, όχι κρυφά,
  // βλ. το βήμα "otp" παρακάτω.
  const isTestPhone = isReservedTestPhone(fullPhone);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("details"); // details | otp
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);
  // 0075: while no SMS provider is configured this stays false and every
  // real (non-test) phone goes through admin verification instead of a
  // code step — see submitDetails. Defaults to false (today's real value)
  // rather than leaving it undefined, so the helper text under the button
  // never flashes the wrong promise while this is still loading.
  const [otpEnabled, setOtpEnabled] = useState(false);
  useEffect(() => {
    getOtpEnabled().then(setOtpEnabled).catch(() => {});
  }, []);

  // Ροή «Εγγραφή» (0117): άνοιξε → έστειλε τα στοιχεία → λογαριασμός έτοιμος.
  useEffect(() => {
    trackFlow("register", "open");
  }, []);

  async function google() {
    setError("");
    setGoogleBusy(true);
    try {
      await signInWithGoogle({ as: isProfessional ? "professional" : "client", role: isProfessional ? crewRole : undefined });
    } catch {
      setGoogleBusy(false);
      setError(t("googleFailed"));
    }
  }

  async function submitDetails(e) {
    e.preventDefault();
    trackFlow("register", "submitted");
    setError("");
    setTriedSubmit(true);
    if (!phoneValid || !isValidPhone(normalizePhone(fullPhone))) {
      // Το μήνυμα φαίνεται κάτω από το ίδιο το πεδίο· εδώ μόνο πηγαίνουμε εκεί.
      document.getElementById("reg-phone")?.focus();
      return;
    }
    setBusy(true);
    try {
      // Whether a number is taken is checked only on the server (0107): the
      // browser no longer gets to ask "does this phone have an account?".
      if (isTestPhone) {
        await testPhoneSignIn(fullPhone);
        setStep("otp");
      } else if (otpEnabled) {
        await sendOtp(fullPhone);
        setStep("otp");
      } else {
        // No SMS provider yet: mint the account directly and send it
        // straight to set-pin. It lands unverified — an admin has to
        // confirm it from /platform/admin/users before it's a live account
        // (PlatformShell.js's VerificationGate blocks everything else
        // until then).
        await pendingSignIn(fullPhone);
        await createUserDraft({
          ...form,
          phone: fullPhone,
          crewRole: isProfessional ? crewRole : null,
          phoneVerified: false,
        });
        trackFlow("register", "done");
        await refresh();
        router.push(isProfessional ? "/platform/set-pin?as=professional" : "/platform/set-pin");
      }
    } catch (err) {
      if (REGISTER_ERRORS[err.message]) noteFailure(err.message);
      setError(REGISTER_ERRORS[err.message] ? t(REGISTER_ERRORS[err.message]) : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      // A test phone already has a real, signed-in session from
      // testPhoneSignIn() above — no SMS code to check.
      if (!isTestPhone) await verifyOtp(fullPhone, otp);
      // Ghost Mode only bypasses the SMS *send* — it must not also skip
      // ahead of what a real client experiences right now. A real OTP
      // verify (the branch above) always proves identity on the spot, so
      // that path is verified true either way. A test phone is a stand-in
      // for a real client, so it should land exactly where a real one
      // would today: verified instantly only if otpEnabled is actually on;
      // otherwise pending, same as every other registration, so testing
      // this as admin means walking the real Χρήστες → «Αναμονή
      // επαλήθευσης» flow, not a shortcut around it.
      await createUserDraft({
        ...form,
        phone: fullPhone,
        crewRole: isProfessional ? crewRole : null,
        phoneVerified: isTestPhone ? otpEnabled : true,
      });
      trackFlow("register", "done");
      await refresh();
      // PIN comes next: the OTP proved identity, the PIN is what they'll use
      // from now on.
      router.push(isProfessional ? "/platform/set-pin?as=professional" : "/platform/set-pin");
    } catch (err) {
      if (REGISTER_ERRORS[err.message]) noteFailure(err.message);
      setError(REGISTER_ERRORS[err.message] ? t(REGISTER_ERRORS[err.message]) : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <BackButton onClick={() => router.back()} />
      <h1 style={{ ...h1, marginTop: 20 }}>{isProfessional ? t("titleProfessional") : t("title")}</h1>

      {step === "details" && (
        <form onSubmit={submitDetails} style={{ ...card, marginTop: 20 }}>
          {isProfessional && (
            <div style={{ marginBottom: 20 }}>
              <span style={label}>{t("capacity")}</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {CREW_ROLES.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    style={chip(crewRole === r.key)}
                    onClick={() => setCrewRole(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {crewRole && !CREW_ROLES.find((r) => r.key === crewRole)?.supported && (
                <p style={{ ...muted, fontSize: 13, marginTop: 10 }}>
                  {t("comingSoon")}
                </p>
              )}
            </div>
          )}

          {GOOGLE_LOGIN_ENABLED && (
            <>
              <GoogleButton onClick={google} busy={googleBusy} />
              <OrDivider />
            </>
          )}
          <label style={label} htmlFor="reg-name">
            {t("fullName")}
          </label>
          <input
            id="reg-name"
            required
            autoFocus
            style={{ ...input, marginBottom: 16 }}
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          />

          <label style={label} htmlFor="reg-phone">
            {t("phoneLabel")}
          </label>
          <div style={{ marginBottom: isProfessional ? 4 : 16 }}>
            <PhoneField
              id="reg-phone"
              showErrors={triedSubmit}
              onChange={({ phone, valid }) => {
                setForm((f) => ({ ...f, phone }));
                setPhoneValid(valid);
              }}
            />
          </div>
          {isProfessional && (
            <p style={{ ...muted, fontSize: 12.5, margin: "0 0 16px" }}>
              {t("phoneVisibility")}
            </p>
          )}

          <label style={label} htmlFor="reg-email">
            Email
          </label>
          <input
            id="reg-email"
            type="email"
            required
            style={{ ...input, marginBottom: 20 }}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />

          <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%" }}>
            {busy ? t("sending") : t("continue")}
          </button>
          <p style={{ ...muted, fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            {isReservedTestPhone(fullPhone)
              ? t("noteTestPhone")
              : otpEnabled
              ? t("noteOtp")
              : t("noteReview")}
          </p>
          <p style={{ ...muted, fontSize: 13, margin: "16px 0 0", textAlign: "center" }}>
            {t("haveAccount")}{" "}
            <Link href="/platform/login" style={{ color: colors.ink }}>
              {t("loginLink")}
            </Link>
          </p>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={submitOtp} style={{ ...card, marginTop: 20 }}>
          {isTestPhone ? (
            <div
              style={{
                background: "#F7F0E2",
                border: `1px solid ${colors.warn}`,
                borderRadius: radius.md,
                padding: 14,
                marginBottom: 20,
              }}
            >
              <b style={{ display: "block", marginBottom: 4 }}>{t("testBannerTitle")}</b>
              <span style={{ fontSize: 13.5 }}>
                {t("testBannerBody", { phone: fullPhone })}{" "}
                {otpEnabled ? t("testBannerVerified") : t("testBannerPending")}
              </span>
            </div>
          ) : (
            <>
              <label style={label} htmlFor="reg-otp">
                {t("smsCode")}
              </label>
              <input
                id="reg-otp"
                required
                inputMode="numeric"
                placeholder="123456"
                style={{ ...input, marginBottom: 20 }}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
            </>
          )}
          <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%" }}>
            {busy ? t("busy") : isTestPhone ? t("continueSimulated") : t("verify")}
          </button>
        </form>
      )}

      {error && <p style={{ color: colors.danger, marginTop: 12 }}>{error}</p>}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}

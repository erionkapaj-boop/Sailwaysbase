"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "../../AuthContext";
import {
  getMyUserRow,
  getGoogleIdentity,
  attachGooglePhone,
  createUserDraft,
  blockInactiveAccount,
  isSignedInAdmin,
  readGoogleIntent,
  clearGoogleIntent,
} from "../../../../lib/platform/db";
import { CREW_ROLES } from "../../../../lib/platform/roles";
import PhoneField from "../../components/PhoneField";
import { normalizePhone, isValidPhone } from "../../../../lib/platform/phone";
import { hasPendingBroadcast } from "../../../../lib/platform/pendingBroadcast";
import { hasPendingDelivery } from "../../../../lib/platform/pendingDelivery";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { trackFlow, noteFailure } from "../../../../lib/platform/health";
import { container, card, h1, muted, button, input, label, colors, radius } from "../../../../lib/platform/theme";

// Επιστροφή από τη Google (0121). Η σελίδα περιμένει να ολοκληρωθεί η σύνδεση και μετά:
//  - λογαριασμός που υπάρχει: μπαίνει κανονικά (εκτός αν είναι διαγραμμένος ή σε αναστολή)·
//  - νέος: συμπληρώνει όνομα, τηλέφωνο και ιδιότητα, και συνεχίζει στον κωδικό.
// Τιμές: κλειδιά μηνυμάτων (GoogleReturn.*), μεταφράζονται στο render.
const ERRORS = {
  phone_unavailable: "phoneUnavailable",
  invalid_phone: "invalidPhone",
  already_registered: "alreadyRegistered",
  account_deleted: "accountDeleted",
  account_suspended: "accountSuspended",
};

const chip = (active) => ({
  padding: "9px 16px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  minHeight: 44,
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});

function GoogleReturn() {
  const t = useTranslations("GoogleReturn");
  const router = useRouter();
  const params = useSearchParams();
  const { session, refresh, signOut } = useAuth();
  const [intent, setIntent] = useState({}); // {as, role, next}: από πριν φύγει για τη Google
  const asParam = intent.as || null; // "professional" | "client" | null
  const failedAtGoogle = Boolean(params.get("error") || params.get("error_code"));

  const [me, setMe] = useState(undefined); // undefined: ελέγχεται · null: νέος · αντικείμενο: υπάρχει
  const [identity, setIdentity] = useState(null);
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const [blocked, setBlocked] = useState("");

  const [kind, setKind] = useState(null);
  const [crewRole, setCrewRole] = useState("skipper");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isProfessional = kind === "professional";
  const userId = session?.user?.id || null;

  useEffect(() => {
    const i = readGoogleIntent();
    setIntent(i);
    if (i.as === "professional" || i.as === "client") setKind(i.as);
    if (CREW_ROLES.some((r) => r.key === i.role)) setCrewRole(i.role);
  }, []);

  // Η ανταλλαγή του «code» με σύνδεση γίνεται στο παρασκήνιο: αν δεν έρθει σύνδεση, τέλος.
  useEffect(() => {
    if (userId || failedAtGoogle) return;
    const t = setTimeout(() => setWaitedTooLong(true), 8000);
    return () => clearTimeout(t);
  }, [userId, failedAtGoogle]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await getMyUserRow();
        if (cancelled) return;
        if (row) {
          await blockInactiveAccount(userId);
          await refresh();
          const next = readGoogleIntent().next;
          clearGoogleIntent();
          const fallback = hasPendingBroadcast()
            ? "/platform/search"
            : hasPendingDelivery()
            ? "/platform/delivery"
            : (await isSignedInAdmin().catch(() => false))
            ? "/platform/admin"
            : "/platform";
          router.replace(next || fallback);
          return;
        }
        const g = await getGoogleIdentity();
        if (cancelled) return;
        // Συνδεδεμένος χωρίς Google (εγγραφή με τηλέφωνο που δεν ολοκληρώθηκε): εδώ δεν ολοκληρώνεται.
        if (!g) {
          router.replace("/platform/login");
          return;
        }
        setIdentity(g);
        setFullName((v) => v || g?.name || "");
        setMe(null);
        trackFlow("register", "open");
      } catch (err) {
        if (cancelled) return;
        setBlocked(ERRORS[err.message] ? t(ERRORS[err.message]) : friendlyError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!kind) return setError(t("chooseKind"));
    setTried(true);
    const fullPhone = phone;
    if (!phoneValid || !isValidPhone(normalizePhone(fullPhone))) {
      document.getElementById("g-phone")?.focus();
      return;
    }
    setBusy(true);
    try {
      await attachGooglePhone(fullPhone);
      await createUserDraft({
        fullName,
        phone: fullPhone,
        email: identity?.email,
        crewRole: isProfessional ? crewRole : null,
        phoneVerified: true,
      });
      trackFlow("register", "done");
      clearGoogleIntent();
      await refresh();
      router.push(isProfessional ? "/platform/set-pin?as=professional" : "/platform/set-pin");
    } catch (err) {
      if (ERRORS[err.message]) noteFailure(err.message);
      setError(ERRORS[err.message] ? t(ERRORS[err.message]) : friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const backToLogin = (
    <Link href="/platform/login" style={{ ...button("secondary"), textDecoration: "none", marginTop: 16 }}>
      {t("backToLogin")}
    </Link>
  );

  if (blocked) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <h1 style={h1}>{t("title")}</h1>
        <p style={{ color: colors.danger }}>{blocked}</p>
        {backToLogin}
      </div>
    );
  }

  if (failedAtGoogle || (!userId && waitedTooLong)) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <h1 style={h1}>{t("title")}</h1>
        <p style={muted}>{t("googleIncomplete")}</p>
        {backToLogin}
      </div>
    );
  }

  if (me !== null) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <p style={muted} role="status">
          {t("signingIn")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <h1 style={h1}>{t("detailsTitle")}</h1>
      <p style={{ ...muted, marginTop: 8 }}>
        {identity?.email ? t("connectedAs", { email: identity.email }) : t("connected")}
      </p>

      <form onSubmit={submit} style={{ ...card, marginTop: 20 }}>
        {asParam !== "professional" && asParam !== "client" && (
          <div style={{ marginBottom: 20 }}>
            <span style={label}>{t("iAm")}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={chip(kind === "client")} onClick={() => setKind("client")}>
                {t("client")}
              </button>
              <button type="button" style={chip(kind === "professional")} onClick={() => setKind("professional")}>
                {t("professional")}
              </button>
            </div>
          </div>
        )}

        {isProfessional && (
          <div style={{ marginBottom: 20 }}>
            <span style={label}>{t("capacity")}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CREW_ROLES.map((r) => (
                <button key={r.key} type="button" style={chip(crewRole === r.key)} onClick={() => setCrewRole(r.key)}>
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

        <label style={label} htmlFor="g-name">
          {t("fullName")}
        </label>
        <input
          id="g-name"
          required
          autoComplete="name"
          style={{ ...input, marginBottom: 16 }}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <label style={label} htmlFor="g-phone">
          {t("phoneLabel")}
        </label>
        <div style={{ marginBottom: isProfessional ? 4 : 20 }}>
          <PhoneField
            id="g-phone"
            showErrors={tried}
            onChange={({ phone: p, valid }) => {
              setPhone(p);
              setPhoneValid(valid);
            }}
          />
        </div>
        {isProfessional && (
          <p style={{ ...muted, fontSize: 12.5, margin: "0 0 20px" }}>
            {t("phoneVisibility")}
          </p>
        )}

        <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%", minHeight: 52 }}>
          {busy ? t("sending") : t("continue")}
        </button>
        {error && <p style={{ color: colors.danger, marginTop: 12, marginBottom: 0 }}>{error}</p>}
      </form>

      <div style={{ ...muted, fontSize: 13, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span>{t("haveAccount")}</span>
        <button
          type="button"
          style={{ ...button("secondary"), minHeight: 44 }}
          onClick={async () => {
            clearGoogleIntent();
            await signOut("/platform/login");
          }}
        >
          {t("signInWithPhone")}
        </button>
      </div>
    </div>
  );
}

export default function GoogleReturnPage() {
  return (
    <Suspense fallback={null}>
      <GoogleReturn />
    </Suspense>
  );
}

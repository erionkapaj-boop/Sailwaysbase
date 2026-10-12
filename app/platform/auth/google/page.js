"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { COUNTRY_CODES } from "../../../../lib/platform/countryCodes";
import { normalizePhone, isValidPhone } from "../../../../lib/platform/phone";
import { hasPendingBroadcast } from "../../../../lib/platform/pendingBroadcast";
import { hasPendingDelivery } from "../../../../lib/platform/pendingDelivery";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { trackFlow, noteFailure } from "../../../../lib/platform/health";
import { container, card, h1, muted, button, input, label, select, colors, radius } from "../../../../lib/platform/theme";

// Επιστροφή από τη Google (0121). Η σελίδα περιμένει να ολοκληρωθεί η σύνδεση και μετά:
//  - λογαριασμός που υπάρχει: μπαίνει κανονικά (εκτός αν είναι διαγραμμένος ή σε αναστολή)·
//  - νέος: συμπληρώνει όνομα, τηλέφωνο και ιδιότητα, και συνεχίζει στον κωδικό.
const PHONE_UNAVAILABLE =
  "Δεν γίνεται εγγραφή με αυτό το τηλέφωνο. Αν έχεις ήδη λογαριασμό, σύνδεσου. Αλλιώς επικοινώνησε μαζί μας.";
const ERRORS = {
  phone_unavailable: PHONE_UNAVAILABLE,
  invalid_phone: "Ο αριθμός δεν είναι σωστός. Γράψε το κινητό σου, π.χ. 69XXXXXXXX.",
  already_registered: "Ο λογαριασμός έχει ήδη ολοκληρωθεί.",
  account_deleted: "Αυτός ο λογαριασμός έχει διαγραφεί. Για να τον ενεργοποιήσεις ξανά, επικοινώνησε μαζί μας.",
  account_suspended: "Ο λογαριασμός είναι σε αναστολή.",
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
  const router = useRouter();
  const params = useSearchParams();
  const { session, refresh } = useAuth();
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
  const [countryCode, setCountryCode] = useState("+30");
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
        setIdentity(g);
        setFullName((v) => v || g?.name || "");
        setMe(null);
        trackFlow("register", "open");
      } catch (err) {
        if (cancelled) return;
        setBlocked(ERRORS[err.message] || friendlyError(err));
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
    if (!kind) return setError("Διάλεξε αν είσαι πελάτης ή επαγγελματίας.");
    const fullPhone = isProfessional ? countryCode + phone.replace(/^0+/, "") : phone;
    if (!isValidPhone(normalizePhone(fullPhone))) return setError(ERRORS.invalid_phone);
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
      setError(ERRORS[err.message] || friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const backToLogin = (
    <Link href="/platform/login" style={{ ...button("secondary"), textDecoration: "none", marginTop: 16 }}>
      Πίσω στη σύνδεση
    </Link>
  );

  if (blocked) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <h1 style={h1}>Σύνδεση</h1>
        <p style={{ color: colors.danger }}>{blocked}</p>
        {backToLogin}
      </div>
    );
  }

  if (failedAtGoogle || (!userId && waitedTooLong)) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <h1 style={h1}>Σύνδεση</h1>
        <p style={muted}>Η σύνδεση με Google δεν ολοκληρώθηκε.</p>
        {backToLogin}
      </div>
    );
  }

  if (me !== null) {
    return (
      <div style={{ ...container, maxWidth: 460 }}>
        <p style={muted} role="status">
          Σύνδεση…
        </p>
      </div>
    );
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <h1 style={h1}>Στοιχεία λογαριασμού</h1>
      <p style={{ ...muted, marginTop: 8 }}>
        Συνδέθηκες με Google{identity?.email ? ` ως ${identity.email}` : ""}.
      </p>

      <form onSubmit={submit} style={{ ...card, marginTop: 20 }}>
        {asParam !== "professional" && asParam !== "client" && (
          <div style={{ marginBottom: 20 }}>
            <span style={label}>Είμαι</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={chip(kind === "client")} onClick={() => setKind("client")}>
                Πελάτης
              </button>
              <button type="button" style={chip(kind === "professional")} onClick={() => setKind("professional")}>
                Επαγγελματίας
              </button>
            </div>
          </div>
        )}

        {isProfessional && (
          <div style={{ marginBottom: 20 }}>
            <span style={label}>Ιδιότητα</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CREW_ROLES.map((r) => (
                <button key={r.key} type="button" style={chip(crewRole === r.key)} onClick={() => setCrewRole(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
            {crewRole && !CREW_ROLES.find((r) => r.key === crewRole)?.supported && (
              <p style={{ ...muted, fontSize: 13, marginTop: 10 }}>
                Οι εγγραφές για αυτή την ιδιότητα ανοίγουν σύντομα. Προς το παρόν θα δημιουργηθεί ο λογαριασμός σου
                χωρίς προφίλ.
              </p>
            )}
          </div>
        )}

        <label style={label} htmlFor="g-name">
          Ονοματεπώνυμο
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
          Κινητό τηλέφωνο
        </label>
        {isProfessional ? (
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <select
              aria-label="Κωδικός χώρας"
              style={{ ...select, flex: "0 0 168px" }}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              id="g-phone"
              required
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="69XXXXXXXX"
              style={{ ...input, flex: 1 }}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        ) : (
          <input
            id="g-phone"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="69XXXXXXXX"
            style={{ ...input, marginBottom: 20 }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        )}
        {isProfessional && (
          <p style={{ ...muted, fontSize: 12.5, margin: "0 0 20px" }}>
            Τον βλέπει μόνο ο πελάτης και μόνο αφού κλείσει κράτηση μαζί σου.
          </p>
        )}

        <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%", minHeight: 52 }}>
          {busy ? "Αποστολή…" : "Συνέχεια"}
        </button>
        {error && <p style={{ color: colors.danger, marginTop: 12, marginBottom: 0 }}>{error}</p>}
      </form>
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

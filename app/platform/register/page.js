"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { sendOtp, verifyOtp, createUserDraft } from "../../../lib/platform/db";
import { CREW_ROLES } from "../../../lib/platform/roles";
import BackButton from "../components/BackButton";
import { container, card, h1, muted, button, input, label, select, colors, radius } from "../../../lib/platform/theme";

// Ο κωδικός χώρας του τηλεφώνου είναι αυτό που καθορίζει το τέλος
// διεκδίκησης (βλ. migration 0052) — μόνο για επαγγελματίες, μόνο εδώ.
// Χωρίς αυτή την επιλογή, ένας πραγματικά ξένος επαγγελματίας δεν είχε
// τρόπο να δηλώσει το πραγματικό του νούμερο· το normalizePhone() ανάγκαζε
// σιωπηλά τα πάντα σε +30 εκτός αν κάποιος έγραφε ο ίδιος το "+" — αόρατη
// επιλογή, ποτέ πραγματική.
const COUNTRY_CODES = [
  { code: "+30", label: "🇬🇷 Ελλάδα (+30)" },
  { code: "+357", label: "🇨🇾 Κύπρος (+357)" },
  { code: "+355", label: "🇦🇱 Αλβανία (+355)" },
  { code: "+359", label: "🇧🇬 Βουλγαρία (+359)" },
  { code: "+40", label: "🇷🇴 Ρουμανία (+40)" },
  { code: "+381", label: "🇷🇸 Σερβία (+381)" },
  { code: "+389", label: "🇲🇰 Βόρεια Μακεδονία (+389)" },
  { code: "+90", label: "🇹🇷 Τουρκία (+90)" },
  { code: "+39", label: "🇮🇹 Ιταλία (+39)" },
  { code: "+33", label: "🇫🇷 Γαλλία (+33)" },
  { code: "+34", label: "🇪🇸 Ισπανία (+34)" },
  { code: "+351", label: "🇵🇹 Πορτογαλία (+351)" },
  { code: "+49", label: "🇩🇪 Γερμανία (+49)" },
  { code: "+43", label: "🇦🇹 Αυστρία (+43)" },
  { code: "+41", label: "🇨🇭 Ελβετία (+41)" },
  { code: "+31", label: "🇳🇱 Ολλανδία (+31)" },
  { code: "+32", label: "🇧🇪 Βέλγιο (+32)" },
  { code: "+44", label: "🇬🇧 Ην. Βασίλειο (+44)" },
  { code: "+353", label: "🇮🇪 Ιρλανδία (+353)" },
  { code: "+46", label: "🇸🇪 Σουηδία (+46)" },
  { code: "+47", label: "🇳🇴 Νορβηγία (+47)" },
  { code: "+45", label: "🇩🇰 Δανία (+45)" },
  { code: "+358", label: "🇫🇮 Φινλανδία (+358)" },
  { code: "+48", label: "🇵🇱 Πολωνία (+48)" },
  { code: "+420", label: "🇨🇿 Τσεχία (+420)" },
  { code: "+421", label: "🇸🇰 Σλοβακία (+421)" },
  { code: "+36", label: "🇭🇺 Ουγγαρία (+36)" },
  { code: "+385", label: "🇭🇷 Κροατία (+385)" },
  { code: "+386", label: "🇸🇮 Σλοβενία (+386)" },
  { code: "+380", label: "🇺🇦 Ουκρανία (+380)" },
  { code: "+7", label: "🇷🇺 Ρωσία (+7)" },
  { code: "+1", label: "🇺🇸 ΗΠΑ / 🇨🇦 Καναδάς (+1)" },
  { code: "+61", label: "🇦🇺 Αυστραλία (+61)" },
  { code: "+55", label: "🇧🇷 Βραζιλία (+55)" },
  { code: "+27", label: "🇿🇦 Ν. Αφρική (+27)" },
  { code: "+86", label: "🇨🇳 Κίνα (+86)" },
  { code: "+81", label: "🇯🇵 Ιαπωνία (+81)" },
  { code: "+91", label: "🇮🇳 Ινδία (+91)" },
];

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
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();

  // ?as=professional switches the form into professional mode (adds the role
  // picker). Clients get the same fields minus that one.
  const isProfessional = params.get("as") === "professional";

  const [form, setForm] = useState({ fullName: "", phone: "", email: "" });
  const [crewRole, setCrewRole] = useState(isProfessional ? "skipper" : null);
  // Only meaningful for professionals — see COUNTRY_CODES above. Greek stays
  // the default since it's still by far the common case; a client's phone
  // has no fee implication, so their form never shows this at all.
  const [countryCode, setCountryCode] = useState("+30");

  // Local digits only, no leading trunk 0 (that's a domestic dialling
  // convention, not part of the number itself) — combined with the chosen
  // country code for professionals; a plain client registration is
  // untouched, still handled entirely by normalizePhone() as before.
  const fullPhone = isProfessional ? countryCode + form.phone.replace(/^0+/, "") : form.phone;
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("details"); // details | otp
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitDetails(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendOtp(fullPhone);
      setStep("otp");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifyOtp(fullPhone, otp);
      await createUserDraft({ ...form, phone: fullPhone, crewRole: isProfessional ? crewRole : null });
      await refresh();
      // PIN comes next: the OTP proved identity, the PIN is what they'll use
      // from now on.
      router.push(`/platform/set-pin?next=${isProfessional ? "skipper" : "client"}`);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...container, maxWidth: 460 }}>
      <BackButton onClick={() => router.back()} />
      <h1 style={{ ...h1, marginTop: 20 }}>{isProfessional ? "Εγγραφή επαγγελματία" : "Εγγραφή"}</h1>

      {step === "details" && (
        <form onSubmit={submitDetails} style={{ ...card, marginTop: 20 }}>
          {isProfessional && (
            <div style={{ marginBottom: 20 }}>
              <span style={label}>Ιδιότητα</span>
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
                  Οι εγγραφές για αυτή την ιδιότητα ανοίγουν σύντομα — προς το παρόν θα δημιουργηθεί
                  ο λογαριασμός σου χωρίς προφίλ.
                </p>
              )}
            </div>
          )}

          <label style={label} htmlFor="reg-name">
            Ονοματεπώνυμο
          </label>
          <input
            id="reg-name"
            required
            style={{ ...input, marginBottom: 16 }}
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          />

          <label style={label} htmlFor="reg-phone">
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
                id="reg-phone"
                required
                inputMode="tel"
                placeholder="69XXXXXXXX"
                style={{ ...input, flex: 1 }}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
          ) : (
            <input
              id="reg-phone"
              required
              inputMode="tel"
              placeholder="69XXXXXXXX"
              style={{ ...input, marginBottom: 16 }}
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          )}
          {isProfessional && (
            <p style={{ ...muted, fontSize: 12.5, margin: "0 0 16px" }}>
              Ο κωδικός χώρας του τηλεφώνου καθορίζει και το τέλος διεκδίκησης όταν αναλαμβάνεις δουλειές — δήλωσε τον
              πραγματικό σου αριθμό.
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
            {busy ? "Αποστολή…" : "Συνέχεια"}
          </button>
          <p style={{ ...muted, fontSize: 13, marginTop: 12, marginBottom: 0 }}>
            Θα σου στείλουμε κωδικό SMS για να επιβεβαιώσουμε το τηλέφωνό σου.
          </p>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={submitOtp} style={{ ...card, marginTop: 20 }}>
          <label style={label} htmlFor="reg-otp">
            Κωδικός SMS
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
          <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%" }}>
            {busy ? "Επαλήθευση…" : "Επαλήθευση"}
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

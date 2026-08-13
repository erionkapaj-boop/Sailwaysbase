"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { sendOtp, verifyOtp, createUserDraft } from "../../../lib/platform/db";
import { CREW_ROLES } from "../../../lib/platform/roles";
import { container, card, h1, muted, button, input, label, colors, radius } from "../../../lib/platform/theme";

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
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("details"); // details | otp
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submitDetails(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendOtp(form.phone);
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
      await verifyOtp(form.phone, otp);
      await createUserDraft({ ...form, crewRole: isProfessional ? crewRole : null });
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
      <h1 style={h1}>{isProfessional ? "Εγγραφή επαγγελματία" : "Εγγραφή"}</h1>

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
          <input
            id="reg-phone"
            required
            inputMode="tel"
            placeholder="69XXXXXXXX"
            style={{ ...input, marginBottom: 16 }}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />

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

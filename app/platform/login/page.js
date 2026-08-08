"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../AuthContext";
import { sendOtp, verifyOtp, createAccount } from "../../../lib/platform/db";
import { container, card, h1, muted, button, input, label } from "../../../lib/platform/theme";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const defaultRole = params.get("role") === "skipper" ? "skipper" : "client";
  const { refresh, needsRoleSelection, session } = useAuth();

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("phone"); // phone | otp | role
  const [role, setRole] = useState(defaultRole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSendOtp(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await sendOtp(phone);
      setStep("otp");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifyOtp(phone, otp);
      await refresh();
      setStep("role");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAccount() {
    setError("");
    setBusy(true);
    try {
      await createAccount({ role, phone });
      await refresh();
      router.push(role === "skipper" ? "/platform/skipper" : "/platform/client");
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  if (session && !needsRoleSelection) {
    return (
      <div style={container}>
        <div style={card}>
          <h1 style={h1}>Είσαι ήδη συνδεδεμένος/η</h1>
          <p style={muted}>Χρησιμοποίησε το μενού για να πας στον λογαριασμό σου.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1 style={h1}>Είσοδος / Εγγραφή</h1>
        <p style={muted}>Χρειάζεται επαλήθευση κινητού (SMS OTP) μόνο όταν θες να χτυπήσεις καμπανάκι ή να γίνεις skipper.</p>

        {(step === "phone" || (needsRoleSelection === false && step === "otp")) && step === "phone" && (
          <form onSubmit={handleSendOtp} style={{ ...card, marginTop: 16 }}>
            <label style={label}>Κινητό τηλέφωνο</label>
            <input
              style={input}
              placeholder="69XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button style={{ ...button("primary"), width: "100%", marginTop: 12 }} disabled={busy} type="submit">
              {busy ? "Αποστολή..." : "Αποστολή κωδικού SMS"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerify} style={{ ...card, marginTop: 16 }}>
            <label style={label}>Κωδικός SMS</label>
            <input style={input} placeholder="123456" value={otp} onChange={(e) => setOtp(e.target.value)} required />
            <button style={{ ...button("primary"), width: "100%", marginTop: 12 }} disabled={busy} type="submit">
              {busy ? "Επαλήθευση..." : "Επαλήθευση"}
            </button>
          </form>
        )}

        {(step === "role" || needsRoleSelection) && (
          <div style={{ ...card, marginTop: 16 }}>
            <label style={label}>Είσαι πελάτης ή skipper;</label>
            <div style={{ display: "flex", gap: 10, margin: "8px 0 14px" }}>
              <button
                style={button(role === "client" ? "primary" : "secondary")}
                onClick={() => setRole("client")}
                type="button"
              >
                Πελάτης
              </button>
              <button
                style={button(role === "skipper" ? "primary" : "secondary")}
                onClick={() => setRole("skipper")}
                type="button"
              >
                Skipper
              </button>
            </div>
            <button style={{ ...button("primary"), width: "100%" }} disabled={busy} onClick={handleCreateAccount}>
              {busy ? "..." : "Δημιουργία λογαριασμού"}
            </button>
          </div>
        )}

        {error && <p style={{ color: "#C0392B", marginTop: 10 }}>{error}</p>}
      </div>
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

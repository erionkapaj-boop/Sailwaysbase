"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import BackButton from "../components/BackButton";
import { useAuth } from "../AuthContext";
import { submitContactMessage } from "../../../lib/platform/db";
import { company, field } from "../../../lib/platform/company";
import {
  container,
  card,
  h1,
  muted,
  colors,
  button,
  input,
  select,
  label,
  radius,
} from "../../../lib/platform/theme";

const TOPICS = [
  { value: "general", key: "topicGeneral" },
  { value: "booking", key: "topicBooking" },
  { value: "payment", key: "topicPayment" },
  { value: "report", key: "topicReport" },
  { value: "privacy", key: "topicPrivacy" },
  { value: "other", key: "topicOther" },
];

const ERROR_CODES = ["invalid_name", "invalid_contact", "invalid_message", "invalid_topic", "too_many_messages"];

const MAX_MESSAGE = 4000;

export default function ContactBody() {
  const router = useRouter();
  const t = useTranslations("Contact");
  const { session, userRow } = useAuth();

  const [form, setForm] = useState({ name: "", contact: "", topic: "general", message: "" });
  // Παγίδα για αυτοματοποιημένα bots: κρυφό πεδίο που κανένας άνθρωπος δεν
  // βλέπει, άρα δεν συμπληρώνει. Αν έρθει γεμάτο, η υποβολή σταματά σιωπηλά.
  const [trap, setTrap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  // Προσυμπλήρωση για συνδεδεμένο χρήστη — δεν έχει νόημα να ξαναγράφει
  // στοιχεία που ήδη ξέρουμε.
  useEffect(() => {
    if (!userRow) return;
    setForm((f) => ({
      ...f,
      name: f.name || userRow.full_name || "",
      contact: f.contact || userRow.email || userRow.phone_number || "",
    }));
  }, [userRow]);

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  }

  async function submit(e) {
    e.preventDefault();
    if (trap) return;
    setError("");
    setBusy(true);
    try {
      await submitContactMessage(form);
      setSent(true);
    } catch (err) {
      const code = (err.message || "").match(/[a-z_]+/)?.[0];
      setError(ERROR_CODES.includes(code) ? t(code) : t("sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div style={{ ...container, maxWidth: 640 }}>
        <div style={{ padding: "24px 0 0" }}>
          <BackButton onClick={() => router.back()} />
          <h1 style={{ ...h1, marginTop: 20 }}>{t("sentTitle")}</h1>
          <div style={{ ...card, borderLeft: `3px solid ${colors.success}` }}>
            <p style={{ margin: 0, lineHeight: 1.7 }}>
              {t.rich("sentBody", { contact: form.contact, b: (c) => <strong>{c}</strong> })}
            </p>
          </div>
          <button style={button("secondary")} onClick={() => router.push("/platform")}>
            {t("backHome")}
          </button>
        </div>
      </div>
    );
  }

  const privacyEmail = field(company.privacyEmail);
  const remaining = MAX_MESSAGE - form.message.length;

  return (
    <div style={{ ...container, maxWidth: 640 }}>
      <div style={{ padding: "24px 0 0" }}>
        <BackButton onClick={() => router.back()} />
        <h1 style={{ ...h1, marginTop: 20 }}>{t("title")}</h1>
        <p style={{ ...muted, lineHeight: 1.7, margin: "0 0 20px" }}>
          {t("intro")}
        </p>

        <form onSubmit={submit} style={card}>
          <label style={label} htmlFor="c-name">
            {t("name")}
          </label>
          <input
            id="c-name"
            required
            maxLength={120}
            autoComplete="name"
            style={{ ...input, marginBottom: 16 }}
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
          />

          <label style={label} htmlFor="c-contact">
            {t("contact")}
          </label>
          <input
            id="c-contact"
            required
            maxLength={160}
            style={{ ...input, marginBottom: 16 }}
            value={form.contact}
            onChange={(e) => setField("contact", e.target.value)}
          />

          <label style={label} htmlFor="c-topic">
            {t("topic")}
          </label>
          <select
            id="c-topic"
            style={{ ...select, marginBottom: 16 }}
            value={form.topic}
            onChange={(e) => setField("topic", e.target.value)}
          >
            {TOPICS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.key)}
              </option>
            ))}
          </select>

          <label style={label} htmlFor="c-message">
            {t("message")}
          </label>
          <textarea
            id="c-message"
            required
            rows={7}
            maxLength={MAX_MESSAGE}
            style={{ ...input, marginBottom: 6, resize: "vertical", lineHeight: 1.6 }}
            value={form.message}
            onChange={(e) => setField("message", e.target.value)}
            placeholder={
              form.topic === "report"
                ? t("placeholderReport")
                : t("placeholderDefault")
            }
          />
          <p style={{ ...muted, fontSize: 12, margin: "0 0 18px" }}>
            {form.message.length < 10
              ? t("minChars")
              : t("remaining", { remaining })}
          </p>

          {/* Κρυφό από ανθρώπους και από αναγνώστες οθόνης· μόνο τα bots το γεμίζουν. */}
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
          />

          <button type="submit" disabled={busy} style={{ ...button("primary"), width: "100%" }}>
            {busy ? t("sending") : t("send")}
          </button>

          {error && (
            <p style={{ color: colors.danger, fontSize: 13.5, margin: "12px 0 0", lineHeight: 1.6 }}>
              {error}
            </p>
          )}
        </form>

        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: radius.md,
            padding: "12px 14px",
            marginTop: 4,
          }}
        >
          <p style={{ ...muted, fontSize: 12.5, margin: 0, lineHeight: 1.7 }}>
            {t.rich("privacyNote", {
              privacy: (c) => (
                <Link href="/platform/privacy" style={{ color: colors.accent }}>
                  {c}
                </Link>
              ),
            })}
            {privacyEmail && (
              <>
                {" "}
                {t.rich("privacyEmail", { email: privacyEmail, b: (c) => <strong>{c}</strong> })}
              </>
            )}
          </p>
        </div>

        {!session && (
          <p style={{ ...muted, fontSize: 12.5, marginTop: 14, lineHeight: 1.7 }}>
            {t.rich("loginHint", {
              login: (c) => (
                <Link href="/platform/login" style={{ color: colors.accent }}>
                  {c}
                </Link>
              ),
            })}
          </p>
        )}
      </div>
    </div>
  );
}

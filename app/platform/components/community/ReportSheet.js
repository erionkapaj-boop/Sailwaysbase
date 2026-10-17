"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Sheet from "./Sheet";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { colors, button, input } from "../../../../lib/platform/theme";

// Αναφορά προβλήματος (σημείου ή μηνύματος): ένας λόγος από λίστα + προαιρετικό σχόλιο.
//   reasons  κωδικοί λόγων (κείμενα: Community.reason_<κωδικός>)
//   onSend   (reason, note) → Promise· αποτυχία = μήνυμα στη φόρμα
//   onBack   γυρίζει πίσω (στην κάρτα)· αν λείπει, το «Πίσω» κλείνει το φύλλο
export default function ReportSheet({ reasons, onSend, onBack, onClose }) {
  const t = useTranslations("Community");
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");
    try {
      await onSend(reason, note);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <Sheet label={t("reportTitle")} onClose={onClose} testId="report">
      <h2 style={{ fontSize: 19, fontWeight: 600, margin: "0 0 14px", color: colors.ink }}>{t("reportTitle")}</h2>
      <div role="radiogroup" aria-label={t("reportTitle")} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            data-report-reason={r}
            onClick={() => setReason(r)}
            style={{ ...button(reason === r ? "primary" : "secondary"), justifyContent: "flex-start", textAlign: "left", minHeight: 46 }}
          >
            {t(`reason_${r}`)}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        rows={3}
        aria-label={t("reportNote")}
        placeholder={t("reportNote")}
        style={{ ...input, resize: "vertical", marginBottom: 14 }}
      />
      {error && <p role="alert" style={{ color: colors.danger, fontSize: 14, margin: "0 0 12px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onBack || onClose} style={{ ...button("secondary"), flex: 1, minHeight: 46 }}>{t("back")}</button>
        <button type="button" data-report-send disabled={!reason || busy} onClick={send} style={{ ...button("primary"), flex: 1, minHeight: 46, opacity: !reason || busy ? 0.5 : 1 }}>
          {t("reportSend")}
        </button>
      </div>
    </Sheet>
  );
}

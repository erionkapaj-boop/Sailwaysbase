"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import { card, muted, button, colors } from "../../../lib/platform/theme";
import { pushCapability, enablePush, registerWorker, deviceIsSubscribed } from "../../../lib/platform/push";

const KEY = "sf_push_prompt_until";
const DAYS = 14;

// Δύο δουλειές για κάθε συνδεδεμένο χρήστη:
//  1. καταχωρεί το service worker (ώστε να λαμβάνονται οι ειδοποιήσεις και να
//     ενημερώνεται η εφαρμογή με κάθε deploy), και καθαρίζει τον αριθμό στο
//     εικονίδιο όταν ανοίγει η εφαρμογή·
//  2. μία φορά, όταν υπάρχει νόημα, ρωτά αν θέλει ειδοποιήσεις. «Αργότερα»
//     το κρύβει για 14 μέρες. Στο iPhone εκτός εγκατεστημένης εφαρμογής δεν
//     ρωτά (εκεί η οδηγία είναι στο προφίλ).
export default function PushPrompt() {
  const t = useTranslations("Push");
  const { session } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    registerWorker();
    const clear = () => {
      if (document.visibilityState === "visible") navigator.clearAppBadge?.().catch?.(() => {});
    };
    clear();
    document.addEventListener("visibilitychange", clear);
    return () => document.removeEventListener("visibilitychange", clear);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!session) return setShow(false);
      const cap = pushCapability();
      if (!cap.supported || cap.permission === "denied" || (cap.ios && !cap.standalone)) return setShow(false);
      let until = 0;
      try { until = Number(localStorage.getItem(KEY) || 0); } catch {}
      if (until > Date.now()) return setShow(false);
      const on = await deviceIsSubscribed();
      if (alive) setShow(!on);
    })();
    return () => {
      alive = false;
    };
  }, [session]);

  if (!show) return null;

  function later() {
    try { localStorage.setItem(KEY, String(Date.now() + DAYS * 864e5)); } catch {}
    setShow(false);
  }
  async function yes() {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result === "ok") setShow(false);
    else later();
  }

  return (
    <div role="region" aria-label={t("promptTitle")} data-push-prompt style={{ ...card, borderLeft: `3px solid ${colors.accent}`, margin: "12px auto", maxWidth: 960, width: "calc(100% - 40px)" }}>
      <b style={{ fontWeight: 600 }}>{t("promptTitle")}</b>
      <p style={{ ...muted, margin: "6px 0 12px", fontSize: 14 }}>{t("promptBody")}</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" style={button("primary")} disabled={busy} onClick={yes} data-push-prompt-yes>{t("promptYes")}</button>
        <button type="button" style={button("secondary")} disabled={busy} onClick={later} data-push-prompt-later>{t("promptLater")}</button>
      </div>
    </div>
  );
}

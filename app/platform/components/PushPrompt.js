"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "../AuthContext";
import Icon from "./Icon";
import { button, colors, radius } from "../../../lib/platform/theme";
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
    <div role="region" aria-label={t("promptTitle")} data-push-prompt style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px auto", maxWidth: 960, boxSizing: "border-box", width: "calc(100% - 40px)", padding: "8px 8px 8px 14px", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.pill }}>
      <Icon name="bell" size={18} />
      <b style={{ fontWeight: 500, fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("promptShort")}</b>
      <button type="button" style={{ ...button("primary"), padding: "7px 14px", fontSize: 13, borderRadius: radius.pill, flexShrink: 0 }} disabled={busy} onClick={yes} data-push-prompt-yes>{t("promptYes")}</button>
      <button type="button" aria-label={t("promptLater")} title={t("promptLater")} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, border: "none", background: "transparent", color: colors.inkSoft, cursor: "pointer", flexShrink: 0 }} disabled={busy} onClick={later} data-push-prompt-later>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}

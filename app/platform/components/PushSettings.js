"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { card, h2, muted, button, colors } from "../../../lib/platform/theme";
import { pushCapability, enablePush, disablePush, deviceIsSubscribed, registerWorker } from "../../../lib/platform/push";
import { sendTestPush } from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";

// Ειδοποιήσεις στο κινητό: ενεργοποίηση για αυτή τη συσκευή, δοκιμή, και στο
// iPhone η οδηγία εγκατάστασης (εκεί οι ειδοποιήσεις δουλεύουν μόνο από την
// εφαρμογή στην αρχική οθόνη).
export default function PushSettings() {
  const t = useTranslations("Push");
  const [cap, setCap] = useState(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ tone: "muted", text: "" });
  const [installEvent, setInstallEvent] = useState(null);

  const refresh = useCallback(async () => {
    const c = pushCapability();
    setCap(c);
    setOn(c.supported ? await deviceIsSubscribed() : false);
  }, []);

  useEffect(() => {
    registerWorker();
    refresh();
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [refresh]);

  if (!cap) return null;

  const errText = (code) => (code === "not_configured" ? t("notConfigured") : code === "denied" ? t("denied") : code === "unsupported" ? t("unsupported") : t("failed"));

  async function turnOn() {
    setBusy(true);
    setMessage({ tone: "muted", text: "" });
    const result = await enablePush();
    setBusy(false);
    if (result !== "ok") setMessage({ tone: "danger", text: errText(result) });
    await refresh();
  }
  async function turnOff() {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setMessage({ tone: "muted", text: "" });
    await refresh();
  }
  async function test() {
    setBusy(true);
    try {
      await sendTestPush();
      setMessage({ tone: "success", text: t("testSent") });
    } catch (err) {
      const code = err?.message;
      setMessage({ tone: "danger", text: code === "too_soon" ? t("err_too_soon") : code === "no_device" ? t("err_no_device") : friendlyError(err) });
    }
    setBusy(false);
  }
  async function install() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    setInstallEvent(null);
  }

  const needsInstall = cap.ios && !cap.standalone; // iPhone, μέσα από τον browser
  const tone = { muted: colors.inkSoft, danger: colors.danger, success: colors.success }[message.tone];

  return (
    <div style={card} data-push-settings>
      <h2 style={{ ...h2, fontSize: 17 }}>{t("title")}</h2>
      <p style={{ ...muted, fontSize: 14, margin: "0 0 14px", lineHeight: 1.55 }}>{t("intro")}</p>

      {needsInstall ? (
        <div data-push-ios>
          <b style={{ fontWeight: 600, fontSize: 15 }}>{t("installTitle")}</b>
          <p style={{ ...muted, fontSize: 14, margin: "6px 0 0", lineHeight: 1.55 }}>{t("installIos")}</p>
        </div>
      ) : !cap.supported ? (
        <p style={{ ...muted, fontSize: 14, margin: 0 }}>{t("unsupported")}</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span data-push-state={on ? "on" : "off"} style={{ fontSize: 15 }}>{on ? t("on") : t("off")}</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {on ? (
                <>
                  <button type="button" style={button("secondary")} disabled={busy} onClick={test} data-push-test>{t("test")}</button>
                  <button type="button" style={button("secondary")} disabled={busy} onClick={turnOff} data-push-off>{t("disable")}</button>
                </>
              ) : (
                <button type="button" style={button("primary")} disabled={busy} onClick={turnOn} data-push-on>{busy ? t("enabling") : t("enable")}</button>
              )}
            </div>
          </div>
          {cap.permission === "denied" && !on && <p style={{ color: colors.danger, fontSize: 13.5, margin: "10px 0 0" }}>{t("denied")}</p>}
        </>
      )}

      {message.text && <p role="status" style={{ color: tone, fontSize: 13.5, margin: "10px 0 0" }}>{message.text}</p>}

      {installEvent && !cap.standalone && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <span style={{ ...muted, fontSize: 14, flex: "1 1 220px" }}>{t("installHint")}</span>
          <button type="button" style={button("secondary")} onClick={install} data-push-install>{t("install")}</button>
        </div>
      )}
    </div>
  );
}

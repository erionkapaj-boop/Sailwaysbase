"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import TrustLine from "./TrustLine";
import Stars from "./Stars";
import { useConfirm } from "./ConfirmDialog";
import { clientListDeliveryClaims, clientChooseDeliveryClaim, getSkipperPublicByIds } from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { computeCrewHighlights } from "../../../lib/platform/roles";
import { muted, badge, button, colors, money } from "../../../lib/platform/theme";

// Οι ανώνυμοι διεκδικητές μιας ανοιχτής μεταφοράς (0126). Ο πελάτης έχει ήδη
// χρεωθεί το τέλος· διαλέγοντας, χρεώνεται και ο επαγγελματίας το δικό του.
export default function DeliveryClaimsPanel({ roleRequest, onChanged }) {
  const t = useTranslations("DeliveryClaims");
  const tc = useTranslations("ReplacementCandidates");
  const f = useFormat();
  const L = useLocalData();
  const [claims, setClaims] = useState([]);
  const [skippers, setSkippers] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();

  async function load() {
    try {
      const rows = await clientListDeliveryClaims(roleRequest.id);
      setClaims(rows);
      const cards = await getSkipperPublicByIds(rows.map((r) => r.skipper_id));
      setSkippers(Object.fromEntries(cards.map((c) => [c.id, c])));
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleRequest.id]);

  const errText = (err) => (err?.message && t.has(`err.${err.message}`) ? t(`err.${err.message}`) : friendlyError(err));

  async function choose(c) {
    if (!(await confirm(t("chooseConfirm"), { tone: "primary", confirmLabel: t("choose") }))) return;
    setBusy(c.claim_id);
    setError("");
    try {
      await clientChooseDeliveryClaim(c.claim_id);
      onChanged?.();
    } catch (err) {
      setError(errText(err));
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.inkSoft, margin: "0 0 10px" }}>{t("claimsTitle")}</h3>
      {claims.length === 0 && <p style={{ ...muted, margin: 0 }}>{t("none")}</p>}
      {claims.map((c) => {
        const s = skippers[c.skipper_id];
        const highlights = s ? computeCrewHighlights(s) : [];
        return (
          <div key={c.claim_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                {s && (
                  <>
                    {s.nationality_country && (
                      <div style={{ ...muted, fontSize: 13 }}>
                        {`${s.nationality_flag ? s.nationality_flag + " " : ""}${L.text(s.nationality_country)}`}
                        {s.age ? ` · ${tc("age", { age: s.age })}` : ""}
                        {s.languages?.length > 0 ? ` · ${L.text(s.languages.join(", "))}` : ""}
                      </div>
                    )}
                    <div style={{ margin: "8px 0" }}>
                      <Stars rating={s.rating_avg} count={s.rating_count} size={14} />
                    </div>
                    <TrustLine s={s} />
                    {highlights.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {highlights.map((h) => (
                          <span key={h} style={{ ...badge("neutral"), fontFamily: "inherit", fontWeight: 400 }}>{h}</span>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div style={{ ...muted, fontSize: 12, marginTop: 6 }}>{t("claimedAt", { date: f.dateRange(String(c.claimed_at).slice(0, 10), String(c.claimed_at).slice(0, 10)) })}</div>
              </div>
              <button type="button" style={{ ...button("primary"), flexShrink: 0 }} disabled={busy !== null} onClick={() => choose(c)}>
                {busy === c.claim_id ? t("choosing") : t("choose")}
              </button>
            </div>
          </div>
        );
      })}
      {error && <p role="alert" style={{ color: colors.danger, fontSize: 13, margin: "6px 0 0" }}>{error}</p>}
      {confirmDialog}
    </div>
  );
}

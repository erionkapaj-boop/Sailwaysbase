"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import TrustLine from "./TrustLine";
import Stars from "./Stars";
import { useConfirm } from "./ConfirmDialog";
import {
  clientListBoardClaims,
  clientChooseBoardClaim,
  clientBoardExternalContact,
  getSkipperPublicByIds,
  cancelBookingRequest,
  departureLabel,
} from "../../../lib/platform/db";
import { friendlyError } from "../../../lib/platform/friendlyError";
import { computeCrewHighlights, labelForRole } from "../../../lib/platform/roles";
import { card, muted, badge, button, colors, money } from "../../../lib/platform/theme";

function identityLine(s, t, L) {
  const parts = [];
  if (s.nationality_country) parts.push(`${s.nationality_flag ? s.nationality_flag + " " : ""}${L.text(s.nationality_country)}`);
  if (s.age) parts.push(t("age", { age: s.age }));
  if (s.languages?.length > 0) parts.push(L.text(s.languages.join(", ")));
  return parts.join(" · ");
}

// Αίτημα του πελάτη στον πίνακα: οι ανώνυμοι διεκδικητές και η επιλογή (0124).
// Η επιλογή χρεώνει 1 credit και στους δύο· ο πελάτης δεν χρεώνεται πριν.
export default function BoardRequestPanel({ request, onChanged, onToastMessage }) {
  const t = useTranslations("BoardClaims");
  const tc = useTranslations("ReplacementCandidates");
  const f = useFormat();
  const L = useLocalData();
  const [claims, setClaims] = useState([]);
  const [skippers, setSkippers] = useState({});
  const [contact, setContact] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [confirm, confirmDialog] = useConfirm();
  const isOpen = request.status === "open";

  async function load() {
    try {
      if (isOpen) {
        const rows = await clientListBoardClaims(request.id);
        setClaims(rows);
        const cards = await getSkipperPublicByIds(rows.map((r) => r.skipper_id).filter(Boolean));
        setSkippers(Object.fromEntries(cards.map((c) => [c.id, c])));
      } else if (request.status === "matched") {
        const rows = await clientBoardExternalContact(request.id);
        setContact(rows?.[0] || null);
      }
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.id, request.status]);

  const errText = (err) => (err?.message && t.has(`err.${err.message}`) ? t(`err.${err.message}`) : friendlyError(err));

  async function choose(c) {
    if (!(await confirm(t("chooseConfirm"), { tone: "primary", confirmLabel: t("choose") }))) return;
    setBusy(c.claim_id);
    setError("");
    try {
      await clientChooseBoardClaim(c.claim_id);
      onToastMessage?.(t("chosenToast"));
      onChanged?.();
    } catch (err) {
      setError(errText(err));
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    if (!(await confirm(t("closeConfirm")))) return;
    setBusy("close");
    try {
      await cancelBookingRequest(request.id);
      onChanged?.();
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <span>
          <b style={{ fontWeight: 600 }}>{request.crew_role ? labelForRole(request.crew_role) : ""}</b> · {L.text(departureLabel(request))}
        </span>
        <span style={money}>{f.dateRange(request.start_date, request.end_date)}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
        <span style={badge("brand")}>{t("boardBadge")}</span>
        {!isOpen && <span style={badge("success")}>{t("statusMatched")}</span>}
        {isOpen && <span style={{ ...muted, fontSize: 12 }}>{t("closes", { date: f.dateRange(String(request.expires_at).slice(0, 10), String(request.expires_at).slice(0, 10)) })}</span>}
      </div>
      {isOpen && <p style={{ ...muted, fontSize: 13, margin: "8px 0 0" }}>{t("creditNote")}</p>}

      {isOpen && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: colors.inkSoft, margin: "0 0 10px" }}>{t("claimsTitle")}</h3>
          {claims.length === 0 && <p style={{ ...muted, margin: 0 }}>{t("none")}</p>}
          {claims.map((c) => {
            const s = c.skipper_id ? skippers[c.skipper_id] : null;
            const highlights = s ? computeCrewHighlights(s) : [];
            return (
              <div key={c.claim_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    {s ? (
                      <>
                        <div style={{ ...money, fontSize: 18, fontWeight: 700 }}>
                          {s.price_per_day}€<span style={{ ...muted, fontFamily: "inherit", fontSize: 13, fontWeight: 400 }}> {tc("perDay")}</span>
                        </div>
                        {identityLine(s, tc, L) && <div style={{ ...muted, fontSize: 13, marginTop: 4 }}>{identityLine(s, tc, L)}</div>}
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
                    ) : (
                      <>
                        <b style={{ fontWeight: 600 }}>{t("external")}</b>
                        {c.external_note && (
                          <p data-user-text style={{ margin: "6px 0 0", fontSize: 14, whiteSpace: "pre-wrap" }}>{c.external_note}</p>
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
          <button type="button" style={{ ...button("secondary"), marginTop: 4 }} disabled={busy !== null} onClick={close}>
            {t("close")}
          </button>
        </div>
      )}

      {contact && (
        <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 14, paddingTop: 12 }}>
          <b style={{ fontWeight: 600 }}>{t("externalChosenTitle")}</b>
          <p data-user-text style={{ margin: "6px 0 0" }}>{t("externalName")}: {contact.name}</p>
          <p data-user-text style={{ margin: "2px 0 0" }}>{t("externalPhone")}: <a href={`tel:${contact.phone}`}>{contact.phone}</a></p>
          {contact.note && <p data-user-text style={{ ...muted, margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{contact.note}</p>}
        </div>
      )}

      {error && <p role="alert" style={{ color: colors.danger, margin: "10px 0 0" }}>{error}</p>}
      {confirmDialog}
    </div>
  );
}

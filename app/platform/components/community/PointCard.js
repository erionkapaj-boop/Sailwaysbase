"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Icon from "../Icon";
import Sheet from "./Sheet";
import ReportSheet from "./ReportSheet";
import { useConfirm } from "../ConfirmDialog";
import { useFormat } from "../../useFormat";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { COMMUNITY_CATEGORY, POINT_REPORT_REASONS, ageLabel, freshness } from "../../../../lib/platform/community";
import { communityPhotoUrl } from "../../../../lib/platform/db";
import { colors, radius, muted, button } from "../../../../lib/platform/theme";

// Κάρτα σημείου: τίτλος, περιγραφή, κατηγορία, συντάκτης, ημερομηνία παρατήρησης και τελευταίας επιβεβαίωσης,
// φωτογραφία. Ενέργειες: «Ισχύει ακόμη», «Αναφορά προβλήματος», και για τον συντάκτη διόρθωση/διαγραφή.
// Τα σημεία παρουσιάζονται πάντα ως αναφορές μελών, ποτέ ως επίσημα ή επαληθευμένα.
export default function PointCard({ point, settings, myId, canWrite, moderator, onClose, onConfirm, onEdit, onDelete, onReport }) {
  const t = useTranslations("Community");
  const f = useFormat();
  const [confirm, confirmDialog] = useConfirm();
  const [photo, setPhoto] = useState(null);
  const [view, setView] = useState("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cat = COMMUNITY_CATEGORY[point.category] || COMMUNITY_CATEGORY.other;
  const mine = Boolean(myId) && point.author_id === myId;
  const fresh = freshness(point, settings);

  useEffect(() => {
    let alive = true;
    setPhoto(null);
    if (point.photo_path) communityPhotoUrl(point.photo_path).then((u) => alive && setPhoto(u));
    return () => { alive = false; };
  }, [point.photo_path]);

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirm(t("deleteConfirm"), { confirmLabel: t("delete") }))) return;
    run(() => onDelete(point));
  }

  const row = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, padding: "9px 0", borderTop: `1px solid ${colors.border}` };

  if (view === "report") {
    return <ReportSheet reasons={POINT_REPORT_REASONS} onSend={(r, n) => onReport(point, r, n)} onBack={() => setView("card")} onClose={onClose} />;
  }

  return (
    <Sheet label={point.title} onClose={onClose} testId="point">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ width: 38, height: 38, borderRadius: 999, border: `2px solid ${cat.color}`, color: cat.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon name={cat.icon} size={20} stroke={1.8} />
        </span>
        <span data-point-category={point.category} style={{ fontSize: 13.5, color: colors.inkSoft, flex: 1 }}>{t(`cat_${point.category}`)}</span>
        <button type="button" aria-label={t("close")} onClick={onClose} style={{ background: "none", border: 0, width: 44, height: 44, margin: "-6px -10px -6px 0", cursor: "pointer", color: colors.ink, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="x" size={22} />
        </button>
      </div>

      <h2 data-point-title style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px", color: colors.ink, lineHeight: 1.3, overflowWrap: "anywhere" }}>{point.title}</h2>

      {fresh !== "fresh" && (
        <p data-point-age-note={fresh} style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px", fontSize: 14, color: colors.warn }}>
          <Icon name="clock" size={17} />
          {t(fresh === "old" ? "ageOld" : "ageAging")}
        </p>
      )}

      {point.description && <p style={{ margin: "0 0 14px", fontSize: 15.5, lineHeight: 1.6, color: colors.ink, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{point.description}</p>}

      {point.photo_path && (
        <div style={{ margin: "0 0 14px", borderRadius: radius.md, overflow: "hidden", background: colors.seaGlass, minHeight: 60 }}>
          {photo ? <img src={photo} alt="" data-point-photo style={{ display: "block", width: "100%", maxHeight: 260, objectFit: "cover" }} /> : null}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <div style={row}>
          <span style={muted}>{t("observed")}</span>
          <span data-point-observed title={f.date(point.observed_at.slice(0, 10))} style={{ color: colors.ink, textAlign: "right" }}>{ageLabel(point.observed_at, f.locale)}</span>
        </div>
        <div style={row}>
          <span style={muted}>{t("confirmed")}</span>
          <span data-point-confirmed title={f.date(point.last_confirmed_at.slice(0, 10))} style={{ color: colors.ink, textAlign: "right" }}>{ageLabel(point.last_confirmed_at, f.locale)}</span>
        </div>
        <div style={{ ...row, borderBottom: `1px solid ${colors.border}` }}>
          <span style={muted}>{t("reportedBy")}</span>
          <span data-point-author style={{ color: colors.ink, textAlign: "right" }}>{point.author_name || t("formerMember")}</span>
        </div>
      </div>

      <p style={{ ...muted, fontSize: 12.5, margin: "0 0 16px" }}>{t("memberReport")}</p>

      {error && <p role="alert" style={{ color: colors.danger, fontSize: 14, margin: "0 0 12px" }}>{error}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {canWrite && (
          <button type="button" data-point-confirm disabled={busy} onClick={() => run(() => onConfirm(point))} style={{ ...button("primary"), minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="check" size={18} stroke={2} />
            {t("stillValid")}
          </button>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {mine && canWrite && (
            <button type="button" data-point-edit onClick={() => onEdit(point)} style={{ ...button("secondary"), flex: 1, minHeight: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Icon name="edit" size={17} />
              {t("edit")}
            </button>
          )}
          {(mine || moderator) && (
            <button type="button" data-point-delete disabled={busy} onClick={remove} style={{ ...button("danger"), flex: 1, minHeight: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Icon name="trash" size={17} />
              {t("delete")}
            </button>
          )}
          {!mine && canWrite && (
            <button type="button" data-point-report onClick={() => { setView("report"); setError(""); }} style={{ ...button("secondary"), flex: 1, minHeight: 46, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Icon name="alert" size={17} />
              {t("report")}
            </button>
          )}
        </div>
      </div>
      {confirmDialog}
    </Sheet>
  );
}

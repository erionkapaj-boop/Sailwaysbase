"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Icon from "../Icon";
import Sheet from "./Sheet";
import MapView from "../map/MapView";
import { resizeImage } from "../PhotoUpload";
import { friendlyError } from "../../../../lib/platform/friendlyError";
import { COMMUNITY_CATEGORIES, dayKey, dayKeyDaysAgo } from "../../../../lib/platform/community";
import { communityPhotoUrl, communityUploadPhoto, communityDeletePhoto } from "../../../../lib/platform/db";
import { colors, radius, muted, button, input, label } from "../../../../lib/platform/theme";

// Φόρμα νέου σημείου ή διόρθωσης, σε δύο βήματα: στοιχεία → έλεγχος θέσης. Η θέση έχει ήδη επιλεγεί στον χάρτη
// (και αλλάζει από το «Αλλαγή θέσης»). Πριν την αποθήκευση ο χρήστης βλέπει καθαρά πού μπαίνει το σημείο.
//   mode      "add" | "edit" (στη διόρθωση η κατηγορία και η ημερομηνία παρατήρησης δεν αλλάζουν)
//   initial   { category, title, description, photoPath }
//   pos       { lat, lng }
//   placeText «Κοντά σε …» (ή κενό)
//   onSubmit  ({ category, title, description, day, photoPath, removePhoto }) → Promise
//   onChangePos  επιστροφή στον χάρτη για νέα θέση
export default function PointForm({ mode, initial, pos, placeText, onSubmit, onChangePos, onClose, onDraft }) {
  const t = useTranslations("Community");
  const edit = mode === "edit";
  const today = dayKey(new Date());
  const [step, setStep] = useState("form");
  const [category, setCategory] = useState(initial?.category || null);
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [day, setDay] = useState(initial?.day || today);
  const [photoPath, setPhotoPath] = useState(initial?.photoPath || null);
  const [photoNew, setPhotoNew] = useState(initial?.photoNew || null); // διαδρομή φωτογραφίας που ανέβηκε τώρα
  const [removePhoto, setRemovePhoto] = useState(Boolean(initial?.removePhoto));
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    if (photoPath && !removePhoto && !photoUrl) communityPhotoUrl(photoPath).then((u) => alive && setPhotoUrl(u));
    return () => { alive = false; };
  }, [photoPath, removePhoto]);

  // Ό,τι έχει γραφτεί μένει όταν ο χρήστης πάει να αλλάξει θέση.
  useEffect(() => {
    onDraft?.({ category, title, description, day, photoPath, photoNew, removePhoto });
  }, [category, title, description, day, photoPath, photoNew, removePhoto]);

  const titleOk = title.trim().length >= 3;
  const valid = Boolean(category) && titleOk;
  const hasPhoto = Boolean(photoPath) && !removePhoto;

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError(t("photoNotImage"));
    setError("");
    setUploading(true);
    try {
      const blob = await resizeImage(file);
      const path = await communityUploadPhoto(blob);
      if (photoNew) communityDeletePhoto(photoNew);
      setPhotoNew(path);
      setPhotoPath(path);
      setRemovePhoto(false);
      setPhotoUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err?.message === "image_unreadable" ? t("photoNotImage") : friendlyError(err));
    } finally {
      setUploading(false);
    }
  }

  function dropPhoto() {
    if (photoNew) communityDeletePhoto(photoNew);
    setPhotoNew(null);
    setPhotoPath(null);
    setPhotoUrl(null);
    setRemovePhoto(Boolean(initial?.photoPath));
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onSubmit({ category, title: title.trim(), description: description.trim(), day, photoPath: photoNew, removePhoto });
    } catch (e) {
      setError(friendlyError(e));
      setBusy(false);
    }
  }

  const heading = (
    <h2 style={{ fontSize: 19, fontWeight: 600, margin: "0 0 16px", color: colors.ink }}>{t(edit ? "editTitle" : step === "form" ? "newTitle" : "reviewTitle")}</h2>
  );

  if (step === "review") {
    const cat = COMMUNITY_CATEGORIES.find((c) => c.key === category);
    return (
      <Sheet label={t("reviewTitle")} onClose={onClose} testId="review">
        {heading}
        <div data-review-map style={{ marginBottom: 12 }}>
          <MapView height={190} interactive={false} focus={{ lng: pos.lng, lat: pos.lat, zoom: 12, instant: true }} pick={{ lng: pos.lng, lat: pos.lat }} />
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <Icon name="pin" size={20} style={{ marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <div data-review-place style={{ fontSize: 15.5, fontWeight: 600, color: colors.ink }}>{placeText || t("placeMapPosition")}</div>
            <div data-review-coords style={{ ...muted, fontSize: 13 }}>{pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ width: 30, height: 30, borderRadius: 999, border: `2px solid ${cat?.color}`, color: cat?.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={cat?.icon} size={16} stroke={1.9} />
          </span>
          <span style={{ fontSize: 15.5, fontWeight: 600, color: colors.ink, overflowWrap: "anywhere" }}>{title.trim()}</span>
        </div>
        <p style={{ ...muted, fontSize: 12.5, margin: "0 0 16px" }}>{t("memberReport")}</p>
        {error && <p role="alert" style={{ color: colors.danger, fontSize: 14, margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "grid", gap: 10 }}>
          <button type="button" data-form-save disabled={busy} onClick={submit} style={{ ...button("primary"), minHeight: 48, opacity: busy ? 0.6 : 1 }}>
            {busy ? t("saving") : t("save")}
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" data-form-back disabled={busy} onClick={() => setStep("form")} style={{ ...button("secondary"), flex: 1, minHeight: 46 }}>{t("back")}</button>
            <button type="button" data-form-change-pos disabled={busy} onClick={onChangePos} style={{ ...button("secondary"), flex: 1, minHeight: 46 }}>{t("changePosition")}</button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet label={t(edit ? "editTitle" : "newTitle")} onClose={onClose} testId="form">
      {heading}

      {!edit && (
        <div style={{ marginBottom: 16 }}>
          <span style={label}>{t("fCategory")}</span>
          <div role="radiogroup" aria-label={t("fCategory")} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COMMUNITY_CATEGORIES.map((c) => {
              const on = category === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-form-category={c.key}
                  onClick={() => setCategory(c.key)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 14px", borderRadius: radius.pill, cursor: "pointer", fontFamily: "inherit", fontSize: 14.5,
                    border: `1.5px solid ${on ? c.color : colors.border}`, background: on ? c.color : colors.card, color: on ? "#fff" : colors.ink,
                    transition: "background .15s ease, border-color .15s ease, color .15s ease",
                  }}
                >
                  <Icon name={c.icon} size={18} stroke={1.8} style={{ color: on ? "#fff" : c.color }} />
                  {t(`catShort_${c.key}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="cm-title" style={label}>{t("fTitle")}</label>
        <input id="cm-title" data-form-title value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={t("fTitleHint")} style={input} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="cm-desc" style={label}>{t("fDescription")}</label>
        <textarea id="cm-desc" data-form-description value={description} maxLength={1000} rows={4} onChange={(e) => setDescription(e.target.value)} style={{ ...input, resize: "vertical" }} />
      </div>

      {!edit && (
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="cm-day" style={label}>{t("fObserved")}</label>
          <input id="cm-day" data-form-day type="date" value={day} min={dayKeyDaysAgo(30)} max={today} onChange={(e) => setDay(e.target.value || today)} style={{ ...input, maxWidth: 200 }} />
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <span style={label}>{t("fPhoto")}</span>
        <input ref={fileRef} type="file" accept="image/*" data-form-file onChange={pickFile} style={{ display: "none" }} />
        {hasPhoto ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 72, height: 72, borderRadius: radius.md, background: colors.seaGlass, overflow: "hidden", flexShrink: 0 }}>
              {photoUrl && <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
            </div>
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} style={{ ...button("secondary"), minHeight: 44 }}>{t("photoChange")}</button>
            <button type="button" data-form-photo-remove onClick={dropPhoto} style={{ ...button("secondary"), minHeight: 44 }}>{t("photoRemove")}</button>
          </div>
        ) : (
          <button type="button" data-form-photo-add disabled={uploading} onClick={() => fileRef.current?.click()} style={{ ...button("secondary"), minHeight: 46, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="camera" size={18} />
            {uploading ? t("photoUploading") : t("photoAdd")}
          </button>
        )}
      </div>

      {error && <p role="alert" style={{ color: colors.danger, fontSize: 14, margin: "0 0 12px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onClose} style={{ ...button("secondary"), flex: 1, minHeight: 48 }}>{t("cancel")}</button>
        <button type="button" data-form-next disabled={!valid || uploading} onClick={() => { setError(""); setStep("review"); }} style={{ ...button("primary"), flex: 1, minHeight: 48, opacity: !valid || uploading ? 0.5 : 1 }}>
          {t("next")}
        </button>
      </div>
    </Sheet>
  );
}

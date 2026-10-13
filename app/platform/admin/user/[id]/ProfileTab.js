"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFormat } from "../../../useFormat";
import { useLocalData } from "../../../useLocalData";
import Link from "next/link";
import { Panel, ProCredentials, Status, colors, muted, button, safeImageUrl } from "../../ui";
import { labelForRole, computeCrewHighlights } from "../../../../../lib/platform/roles";
import { adminUpdateProfile, adminEditContact, adminClearPhoto, adminApprovePhoto } from "../../../../../lib/platform/db";
import { InfoGrid, Field, fieldInput, Chips, Hint, useErrorLabel, badge } from "./shared";

// «Στοιχεία & πρόσβαση»: ό,τι είναι ο λογαριασμός (προφίλ, επικοινωνία) και
// πώς διορθώνεται όταν κάτι έχει γραφτεί λάθος. «Προβολή ως» / «Προσωρινός
// κωδικός» μένουν στις γρήγορες ενέργειες πάνω στη σελίδα — εδώ μένει μόνο
// ό,τι χρειάζεται φόρμα.
export default function ProfileTab({ data, id, reload, confirm }) {
  const t = useTranslations("AdminUser");
  const f = useFormat();
  const L = useLocalData();
  const errorLabel = useErrorLabel();
  const personName = (p) => L.person(p);
  const u = data.user;
  const sp = data.skipper_profile;
  const photo = safeImageUrl(u.photo_url);
  const extraRoles = (data.secondary_roles || []).filter((r) => !r.deleted_at);
  const oldPhones = (data.phones || []).filter((p) => p.retired_at);

  const [name, setName] = useState(u.full_name || "");
  const [email, setEmail] = useState(u.email || "");
  const [price, setPrice] = useState(sp?.price_per_day ?? "");
  const [licenseNumber, setLicenseNumber] = useState(sp?.license_number || "");
  const [licenseType, setLicenseType] = useState(sp?.license_type || "");
  const [years, setYears] = useState(sp?.years_experience ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [phone, setPhone] = useState(u.phone_number || "");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [phoneNotice, setPhoneNotice] = useState("");

  const [photoReason, setPhotoReason] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");

  async function handleApprovePhoto() {
    setPhotoBusy(true);
    setPhotoError("");
    try {
      await adminApprovePhoto(id);
      await reload();
    } catch (err) {
      setPhotoError(errorLabel(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleClearPhoto() {
    if (!(await confirm(t("profile.confirmClearPhoto")))) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      await adminClearPhoto(id, photoReason.trim());
      setPhotoReason("");
      await reload();
    } catch (err) {
      setPhotoError(errorLabel(err));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminUpdateProfile(id, {
        fullName: name,
        email,
        pricePerDay: sp ? Number(price) || null : null,
        licenseNumber: sp ? licenseNumber : null,
        licenseType: sp ? licenseType : null,
        yearsExperience: sp && years !== "" ? Number(years) : null,
      });
      await reload();
      setNotice(t("profile.saved"));
    } catch (err) {
      setError(errorLabel(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePhone(e) {
    e.preventDefault();
    setPhoneBusy(true);
    setPhoneError("");
    setPhoneNotice("");
    try {
      const res = await adminEditContact(id, phone);
      await reload();
      setPhoneNotice(res?.unchanged ? t("profile.phoneUnchanged") : t("profile.phoneUpdated"));
    } catch (err) {
      setPhoneError(errorLabel(err));
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <>
      <Panel title={t("profile.basic")}>
        {u.photo_url ? (
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
            {photo ? (
              <a href={photo} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }} title={t("profile.openFull")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt={t("profile.photoAlt", { name: personName(u) || u.phone_number })}
                  style={{ width: 120, height: 120, borderRadius: 12, objectFit: "cover", display: "block", border: `1px solid ${colors.border}` }}
                />
              </a>
            ) : null}
            <div style={{ minWidth: 200, flex: "1 1 220px" }}>
              {photo && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                  {u.photo_reviewed_at ? (
                    <span style={badge("success")}>{t("profile.photoReviewed", { date: f.date(u.photo_reviewed_at.slice(0, 10)) })}</span>
                  ) : (
                    <>
                      <span style={badge("warn")}>{t("profile.photoAwaiting")}</span>
                      <button type="button" style={{ ...button("primary"), padding: "5px 12px", fontSize: 12.5 }} disabled={photoBusy} onClick={handleApprovePhoto}>
                        {t("profile.photoOk")}
                      </button>
                    </>
                  )}
                </div>
              )}
              {photo ? (
                <Hint>
                  {t("profile.photoHint")}
                </Hint>
              ) : (
                <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 12px", lineHeight: 1.5 }}>
                  {t("profile.photoInvalid")}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={photoReason}
                  onChange={(e) => setPhotoReason(e.target.value)}
                  placeholder={t("profile.photoNote")}
                  style={{ ...fieldInput, flex: "1 1 180px" }}
                />
                <button type="button" style={{ ...button("secondary"), flexShrink: 0 }} disabled={photoBusy} onClick={handleClearPhoto}>
                  {photoBusy ? "…" : t("profile.removePhoto")}
                </button>
              </div>
              {photoError && <p style={{ color: colors.danger, fontSize: 13, marginTop: 8 }}>{photoError}</p>}
            </div>
          </div>
        ) : (
          <p style={{ ...muted, fontSize: 13, margin: "0 0 16px" }}>{t("profile.noPhoto")}</p>
        )}
        <InfoGrid
          items={[
            [t("profile.name"), personName(u) || "—"],
            [t("profile.phone"), u.phone_number],
            [t("profile.email"), u.email || "—"],
            [t("profile.role"), sp ? labelForRole(sp.role) : u.role === "client" ? t("profile.client") : u.role],
            [t("profile.verification"), u.phone_verified_at ? t("profile.verified") : t("profile.notYet")],
            [t("profile.signedUp"), f.dateTime(u.created_at)],
          ]}
        />
        {oldPhones.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...muted, fontSize: 12.5, marginBottom: 6 }}>{t("profile.oldPhones")}</div>
            {oldPhones.map((p) => (
              <div key={p.phone} style={{ fontSize: 13, color: colors.ink, marginBottom: 3 }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.phone}</span>
                <span style={muted}>
                  {" "}· {t("profile.until", { date: f.date(p.retired_at.slice(0, 10)) })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Μόνο για επαγγελματίες — για πελάτη αυτή η ενότητα ήταν πάντα άδεια
          (καμία «προβολή» δεν υπάρχει για λογαριασμό πελάτη), απλή σύγχυση. */}
      {sp && (
        <Panel title={t("profile.features")}>
          <p style={{ ...muted, margin: "0 0 6px", fontSize: 12.5 }}>{t("profile.clientSees")}</p>
          <Chips items={computeCrewHighlights(sp, { languageCount: data.languages?.length || 0 })} />
          <p style={{ ...muted, margin: "16px 0 6px", fontSize: 12.5 }}>{t("profile.languages")}</p>
          <Chips items={data.languages} />
          <p style={{ ...muted, margin: "16px 0 6px", fontSize: 12.5 }}>{t("profile.boatTypes")}</p>
          <Chips items={data.boat_types} />
        </Panel>
      )}

      {sp && (
        <Panel title={t("profile.proDetails")}>
          <ProCredentials profile={sp} roleLabel={labelForRole(sp.role)} />
          {extraRoles.length > 0 && (
            <>
              <p style={{ ...muted, margin: "16px 0 8px", fontSize: 12.5 }}>{t("profile.extraRoles")}</p>
              {extraRoles.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6, fontSize: 13.5 }}>
                  <span style={{ color: colors.ink, fontWeight: 500 }}>{labelForRole(r.role)}</span>
                  <Status value={r.approval_status} />
                  <span style={muted}>
                    {r.price_per_day != null ? t("profile.perDay", { price: r.price_per_day }) : ""}
                    {r.years_experience != null ? ` · ${t("profile.years", { years: r.years_experience })}` : ""}
                  </span>
                </div>
              ))}
              {extraRoles.some((r) => r.approval_status === "pending") && (
                <Link href="/platform/admin/approvals" style={{ fontSize: 12.5, color: colors.ink }}>
                  {t("profile.approveExtra")}
                </Link>
              )}
            </>
          )}
        </Panel>
      )}

      <Panel title={t("profile.editTitle")} subtitle={t("profile.editSubtitle")}>
        <form onSubmit={handleSave}>
          <Field label={t("profile.name")}>
            <input style={fieldInput} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label={t("profile.email")}>
            <input style={fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {sp && (
            <>
              <Field label={t("profile.price")}>
                <input style={fieldInput} type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              <Field label={t("profile.licenseNumber")}>
                <input style={fieldInput} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
              </Field>
              <Field label={t("profile.licenseType")}>
                <input style={fieldInput} value={licenseType} onChange={(e) => setLicenseType(e.target.value)} />
              </Field>
              <Field label={t("profile.yearsExperience")}>
                <input style={fieldInput} type="number" min="0" value={years} onChange={(e) => setYears(e.target.value)} />
              </Field>
            </>
          )}
          {error && <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
          {notice && <p style={{ color: colors.success, fontSize: 13, margin: "0 0 10px" }}>{notice}</p>}
          <button type="submit" style={button("primary")} disabled={busy}>
            {busy ? "…" : t("profile.save")}
          </button>
        </form>
      </Panel>

      {u.role !== "admin" && (
        <Panel title={t("profile.phoneTitle")} subtitle={t("profile.phoneSubtitle")}>
          <Hint>
            {t("profile.phoneHint")}
          </Hint>
          <form onSubmit={handlePhone} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...fieldInput, flex: "1 1 200px" }} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <button type="submit" style={{ ...button("secondary"), flexShrink: 0 }} disabled={phoneBusy}>
              {phoneBusy ? "…" : t("profile.update")}
            </button>
          </form>
          {phoneError && <p style={{ color: colors.danger, fontSize: 13, marginTop: 8 }}>{phoneError}</p>}
          {phoneNotice && <p style={{ color: colors.success, fontSize: 13, marginTop: 8 }}>{phoneNotice}</p>}
        </Panel>
      )}
    </>
  );
}

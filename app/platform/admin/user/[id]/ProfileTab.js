"use client";
import { useState } from "react";
import Link from "next/link";
import { Panel, ProCredentials, Status, colors, muted, button, safeImageUrl } from "../../ui";
import { labelForRole, computeCrewHighlights } from "../../../../../lib/platform/roles";
import { adminUpdateProfile, adminEditContact, adminClearPhoto, adminApprovePhoto } from "../../../../../lib/platform/db";
import { formatDate, formatDateTime } from "../../../../../lib/platform/notifications";
import { InfoGrid, Field, fieldInput, Chips, Hint, errorLabel, badge } from "./shared";

// «Στοιχεία & πρόσβαση»: ό,τι είναι ο λογαριασμός (προφίλ, επικοινωνία) και
// πώς διορθώνεται όταν κάτι έχει γραφτεί λάθος. «Προβολή ως» / «Προσωρινός
// κωδικός» μένουν στις γρήγορες ενέργειες πάνω στη σελίδα — εδώ μένει μόνο
// ό,τι χρειάζεται φόρμα.
export default function ProfileTab({ data, id, reload, confirm }) {
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
    if (!(await confirm("Αφαίρεση της φωτογραφίας; Ο χρήστης ειδοποιείται (με τον λόγο, αν έγραψες) και μπορεί να ανεβάσει νέα."))) return;
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
      setNotice("Αποθηκεύτηκε.");
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
      setPhoneNotice(res?.unchanged ? "Ίδιο με το τωρινό." : "Το τηλέφωνο ενημερώθηκε.");
    } catch (err) {
      setPhoneError(errorLabel(err));
    } finally {
      setPhoneBusy(false);
    }
  }

  return (
    <>
      <Panel title="Βασικά στοιχεία">
        {u.photo_url ? (
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 }}>
            {photo ? (
              <a href={photo} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }} title="Άνοιγμα σε πλήρες μέγεθος">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt={`Φωτογραφία: ${u.full_name || u.phone_number}`}
                  style={{ width: 120, height: 120, borderRadius: 12, objectFit: "cover", display: "block", border: `1px solid ${colors.border}` }}
                />
              </a>
            ) : null}
            <div style={{ minWidth: 200, flex: "1 1 220px" }}>
              {photo && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                  {u.photo_reviewed_at ? (
                    <span style={badge("success")}>Ελέγχθηκε {formatDate(u.photo_reviewed_at.slice(0, 10))}</span>
                  ) : (
                    <>
                      <span style={badge("warn")}>Περιμένει έλεγχο</span>
                      <button type="button" style={{ ...button("primary"), padding: "5px 12px", fontSize: 12.5 }} disabled={photoBusy} onClick={handleApprovePhoto}>
                        Εντάξει
                      </button>
                    </>
                  )}
                </div>
              )}
              {photo ? (
                <Hint>
                  Η φωτογραφία που βλέπουν οι υπόλοιποι — πάτησέ τη για πλήρες μέγεθος και έλεγξε αν φαίνεται τηλέφωνο,
                  email, site, QR code ή social media πάνω της: τέτοιο περιεχόμενο παρακάμπτει την πλατφόρμα.
                </Hint>
              ) : (
                <p style={{ color: colors.danger, fontSize: 13.5, margin: "0 0 12px", lineHeight: 1.5 }}>
                  Η φωτογραφία δεν είναι κανονικό ανέβασμα (μη έγκυρη διεύθυνση) και δεν εμφανίζεται για λόγους
                  ασφαλείας. Αφαίρεσέ τη.
                </p>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={photoReason}
                  onChange={(e) => setPhotoReason(e.target.value)}
                  placeholder="Λόγος αφαίρεσης (προαιρετικό)"
                  style={{ ...fieldInput, flex: "1 1 180px" }}
                />
                <button type="button" style={{ ...button("secondary"), flexShrink: 0 }} disabled={photoBusy} onClick={handleClearPhoto}>
                  {photoBusy ? "…" : "Αφαίρεση φωτογραφίας"}
                </button>
              </div>
              {photoError && <p style={{ color: colors.danger, fontSize: 13, marginTop: 8 }}>{photoError}</p>}
            </div>
          </div>
        ) : (
          <p style={{ ...muted, fontSize: 13, margin: "0 0 16px" }}>Δεν έχει ανεβάσει φωτογραφία.</p>
        )}
        <InfoGrid
          items={[
            ["Όνομα", u.full_name || "—"],
            ["Τηλέφωνο", u.phone_number],
            ["Email", u.email || "—"],
            ["Ρόλος", sp ? labelForRole(sp.role) : u.role === "client" ? "Πελάτης" : u.role],
            ["Επαλήθευση", u.phone_verified_at ? "Επαληθευμένος" : "Όχι ακόμα"],
            ["Εγγραφή", formatDateTime(u.created_at)],
          ]}
        />
        {oldPhones.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ ...muted, fontSize: 12.5, marginBottom: 6 }}>Προηγούμενα τηλέφωνα (μένουν δεμένα με τον λογαριασμό)</div>
            {oldPhones.map((p) => (
              <div key={p.phone} style={{ fontSize: 13, color: colors.ink, marginBottom: 3 }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.phone}</span>
                <span style={muted}>
                  {" "}· έως {formatDate(p.retired_at.slice(0, 10))}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Μόνο για επαγγελματίες — για πελάτη αυτή η ενότητα ήταν πάντα άδεια
          (καμία «προβολή» δεν υπάρχει για λογαριασμό πελάτη), απλή σύγχυση. */}
      {sp && (
        <Panel title="Χαρακτηριστικά προφίλ">
          <p style={{ ...muted, margin: "0 0 6px", fontSize: 12.5 }}>Ό,τι βλέπει ο πελάτης</p>
          <Chips items={computeCrewHighlights(sp, { languageCount: data.languages?.length || 0 })} />
          <p style={{ ...muted, margin: "16px 0 6px", fontSize: 12.5 }}>Γλώσσες</p>
          <Chips items={data.languages} />
          <p style={{ ...muted, margin: "16px 0 6px", fontSize: 12.5 }}>Τύποι σκαφών</p>
          <Chips items={data.boat_types} />
        </Panel>
      )}

      {sp && (
        <Panel title="Στοιχεία επαγγελματία">
          <ProCredentials profile={sp} roleLabel={labelForRole(sp.role)} />
          {extraRoles.length > 0 && (
            <>
              <p style={{ ...muted, margin: "16px 0 8px", fontSize: 12.5 }}>Επιπλέον ιδιότητες</p>
              {extraRoles.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6, fontSize: 13.5 }}>
                  <span style={{ color: colors.ink, fontWeight: 500 }}>{labelForRole(r.role)}</span>
                  <Status value={r.approval_status} />
                  <span style={muted}>
                    {r.price_per_day != null ? `${r.price_per_day}€ / ημέρα` : ""}
                    {r.years_experience != null ? ` · ${r.years_experience} χρόνια` : ""}
                  </span>
                </div>
              ))}
              {extraRoles.some((r) => r.approval_status === "pending") && (
                <Link href="/platform/admin/approvals" style={{ fontSize: 12.5, color: colors.ink }}>
                  Έγκριση επιπλέον ιδιοτήτων στις Εκκρεμότητες
                </Link>
              )}
            </>
          )}
        </Panel>
      )}

      <Panel title="Διόρθωση στοιχείων" subtitle="Ό,τι θα διόρθωνε ο ίδιος ο χρήστης από «Το προφίλ μου» — προσβάσιμο και από εδώ.">
        <form onSubmit={handleSave}>
          <Field label="Όνομα">
            <input style={fieldInput} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Email">
            <input style={fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {sp && (
            <>
              <Field label="Τιμή / ημέρα (€)">
                <input style={fieldInput} type="number" min="210" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              <Field label="Αριθμός διπλώματος">
                <input style={fieldInput} value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
              </Field>
              <Field label="Τύπος διπλώματος">
                <input style={fieldInput} value={licenseType} onChange={(e) => setLicenseType(e.target.value)} />
              </Field>
              <Field label="Χρόνια εμπειρίας">
                <input style={fieldInput} type="number" min="0" value={years} onChange={(e) => setYears(e.target.value)} />
              </Field>
            </>
          )}
          {error && <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 10px" }}>{error}</p>}
          {notice && <p style={{ color: colors.success, fontSize: 13, margin: "0 0 10px" }}>{notice}</p>}
          <button type="submit" style={button("primary")} disabled={busy}>
            {busy ? "…" : "Αποθήκευση"}
          </button>
        </form>
      </Panel>

      {u.role !== "admin" && (
        <Panel title="Διόρθωση τηλεφώνου" subtitle="Το τηλέφωνο είναι και το αναγνωριστικό σύνδεσης — αλλάζει προσεκτικά.">
          <Hint>
            Ο χρήστης μπορεί να το αλλάξει και μόνος του από «Το προφίλ μου». Από εδώ μόνο αν δεν μπορεί να μπει (π.χ.
            λάθος αριθμός στην εγγραφή). Ο κωδικός του δεν αλλάζει· το παλιό τηλέφωνο μένει στο ιστορικό του και δεν
            μπορεί να το πάρει άλλος λογαριασμός.
          </Hint>
          <form onSubmit={handlePhone} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...fieldInput, flex: "1 1 200px" }} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <button type="submit" style={{ ...button("secondary"), flexShrink: 0 }} disabled={phoneBusy}>
              {phoneBusy ? "…" : "Ενημέρωση"}
            </button>
          </form>
          {phoneError && <p style={{ color: colors.danger, fontSize: 13, marginTop: 8 }}>{phoneError}</p>}
          {phoneNotice && <p style={{ color: colors.success, fontSize: 13, marginTop: 8 }}>{phoneNotice}</p>}
        </Panel>
      )}
    </>
  );
}

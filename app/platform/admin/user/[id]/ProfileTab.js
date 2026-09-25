"use client";
import { useState } from "react";
import { Panel, ProCredentials, colors, muted, button } from "../../ui";
import { labelForRole, computeCrewHighlights } from "../../../../../lib/platform/roles";
import { adminUpdateProfile, adminEditContact, adminClearPhoto } from "../../../../../lib/platform/db";
import { formatDateTime } from "../../../../../lib/platform/notifications";
import { InfoGrid, Field, fieldInput, Chips, Hint, errorLabel } from "./shared";

// «Στοιχεία & πρόσβαση»: ό,τι είναι ο λογαριασμός (προφίλ, επικοινωνία) και
// πώς διορθώνεται όταν κάτι έχει γραφτεί λάθος. Η «Σύνδεση ως» / «Νέος
// κωδικός» μένουν στις persistent γρήγορες ενέργειες πάνω στη σελίδα — εδώ
// μένει μόνο η διόρθωση στοιχείων, που χρειάζεται φόρμα.
export default function ProfileTab({ data, id, reload, confirm }) {
  const u = data.user;
  const sp = data.skipper_profile;

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

  async function handleClearPhoto() {
    if (!(await confirm("Αφαίρεση της φωτογραφίας; Ο χρήστης θα μπορεί να ανεβάσει νέα οποτεδήποτε."))) return;
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
            <a href={u.photo_url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={u.photo_url}
                alt=""
                style={{ width: 120, height: 120, borderRadius: 12, objectFit: "cover", display: "block", border: `1px solid ${colors.border}` }}
              />
            </a>
            <div style={{ minWidth: 200, flex: "1 1 220px" }}>
              <Hint>
                Η φωτογραφία που βλέπουν οι υπόλοιποι — άνοιξέ τη σε πλήρες μέγεθος για να ελέγξεις αν φαίνεται
                τηλέφωνο, email, site, QR code ή social media πάνω της: τέτοιο περιεχόμενο παρακάμπτει την πλατφόρμα.
              </Hint>
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
          <Hint>Χρησιμοποίησέ το μόνο αν ο χρήστης δηλώνει ότι έγραψε λάθος αριθμό στην εγγραφή. Δεν στέλνεται SMS επιβεβαίωσης.</Hint>
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

"use client";
import MultiPick from "../components/MultiPick";
import Stars from "../components/Stars";
import DateField from "../components/calendar/DateField";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "../useFormat";
import { useLocalData } from "../useLocalData";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import MissingProfile from "../skipper/MissingProfile";
import ProfileForm from "../skipper/ProfileForm";
import PhotoUpload from "../components/PhotoUpload";
import PhoneField from "../components/PhoneField";
import { useFeedback } from "../components/FeedbackProvider";
import {
  updateMyPhoto,
  listLookups,
  getMyClientProfile,
  updateClientProfile,
  getClientLanguages,
  setClientLanguages,
  getMySecondaryRoles,
  addSecondaryRole,
  updateSecondaryRole,
  removeSecondaryRole,
  getMyDeliveryAvailabilityWindows,
  addDeliveryAvailabilityWindow,
  removeDeliveryAvailabilityWindow,
  deleteMyAccount,
  signOut,
  becomeProfessional,
  changeMyPhone,
  changeMyEmail,
  setMyEmailNotifications,
  normalizePhone,
  getGoogleIdentity,
  linkGoogleAccount,
  GOOGLE_LOGIN_ENABLED,
} from "../../../lib/platform/db";
import { CREW_ROLES, SUPPORTED_ROLES, labelForRole } from "../../../lib/platform/roles";
import { container, card, h1, h2, muted, colors, radius, select, label, button, input, tapTarget } from "../../../lib/platform/theme";
import SignedOutNotice from "../components/SignedOutNotice";
import { friendlyError } from "../../../lib/platform/friendlyError";
import PushSettings from "../components/PushSettings";

// "Έγκριση σε εκκρεμότητα" vs "Εγκρίθηκε" vs "Δεν εγκρίθηκε" — a secondary
// role goes through the same admin review as the main profile (0065), so it
// needs the same three-state story, just compressed into one line per role
// instead of its own page.
function statusLabel(role, t) {
  if (role.deleted_at) return { text: t("roleRejected"), color: colors.danger };
  if (role.approval_status === "approved") return { text: t("roleApproved"), color: colors.success || colors.accent };
  return { text: t("rolePending"), color: colors.warn || colors.inkSoft };
}

// Names of the common languages, matching the Greek names in the languages list (data, not screen text).
const COMMON_LANGUAGES = ["\u0395\u03bb\u03bb\u03b7\u03bd\u03b9\u03ba\u03ac", "\u0391\u03b3\u03b3\u03bb\u03b9\u03ba\u03ac", "\u0393\u03b5\u03c1\u03bc\u03b1\u03bd\u03b9\u03ba\u03ac", "\u0393\u03b1\u03bb\u03bb\u03b9\u03ba\u03ac", "\u0399\u03c4\u03b1\u03bb\u03b9\u03ba\u03ac", "\u0399\u03c3\u03c0\u03b1\u03bd\u03b9\u03ba\u03ac"];

// A second (third...) specialty on the same account — its own price and,
// for skipper, its own license, but everything else (photo, languages,
// nationality) stays the one already on the main profile above; no reason
// to ask for it twice. Ratings are kept separate per role on the database
// side (0065) — working as cook doesn't touch the skipper rating and vice
// versa.
function SecondaryRoles({ profile }) {
  const t = useTranslations("Profile");
  const [roles, setRoles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newLicenseNumber, setNewLicenseNumber] = useState("");
  const [newLicenseType, setNewLicenseType] = useState("");

  async function load() {
    try {
      setRoles(await getMySecondaryRoles(profile.id));
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    if (profile?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const takenRoles = new Set([profile.role, ...roles.map((r) => r.role)]);
  const availableRoles = CREW_ROLES.filter((r) => r.supported && !takenRoles.has(r.key));

  async function handleAdd() {
    setError("");
    if (!newRole) return;
    if (!(Number(newPrice) > 0)) {
      setError(t("errPrice"));
      return;
    }
    setBusy(true);
    try {
      await addSecondaryRole(profile.id, {
        role: newRole,
        pricePerDay: Number(newPrice),
        licenseNumber: newRole === "skipper" ? newLicenseNumber.trim() : "",
        licenseType: newRole === "skipper" ? newLicenseType.trim() : "",
      });
      setAdding(false);
      setNewRole("");
      setNewPrice("");
      setNewLicenseNumber("");
      setNewLicenseType("");
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handlePriceChange(id, value) {
    setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, price_per_day: value } : r)));
  }

  async function handlePriceSave(id, value) {
    if (!(Number(value) > 0)) {
      setError(t("errPrice"));
      return;
    }
    try {
      await updateSecondaryRole(id, { pricePerDay: Number(value) });
    } catch (err) {
      setError(friendlyError(err));
      await load();
    }
  }

  async function handleRemove(id) {
    setBusy(true);
    try {
      await removeSecondaryRole(id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    // ProfileForm's own save bar is fixed to the bottom of the viewport
    // (see its 88px paddingBottom) — this section renders after that form
    // closes, so it needs the same clearance or its own buttons end up
    // hidden behind that bar once someone scrolls this far down.
    <div style={{ ...card, marginBottom: 88 }}>
      <h2 style={{ ...h2, fontSize: 17 }}>{t("rolesTitle")}</h2>
      <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
        {t("rolesIntro")}
      </p>

      {error && <p style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {roles.map((r) => {
        const st = statusLabel(r, t);
        return (
          <div
            key={r.id}
            style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 0", borderTop: `1px solid ${colors.border}` }}
          >
            <div style={{ minWidth: 100, fontWeight: 600 }}>{labelForRole(r.role)}</div>
            <input
              type="number"
              min={1}
              style={{ ...input, width: 90 }}
              value={r.price_per_day ?? ""}
              onChange={(e) => handlePriceChange(r.id, e.target.value)}
              onBlur={(e) => handlePriceSave(r.id, e.target.value)}
              disabled={busy}
            />
            <span style={{ ...muted, fontSize: 13 }}>{t("eurPerDayShort")}</span>
            <span style={{ fontSize: 12.5, color: st.color, marginLeft: "auto" }}>{st.text}</span>
            <button type="button" style={{ ...button("secondary"), padding: "6px 12px", fontSize: 13 }} disabled={busy} onClick={() => handleRemove(r.id)}>
              {t("remove")}
            </button>
          </div>
        );
      })}

      {adding ? (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <label style={label}>{t("role")}</label>
          <select style={{ ...select, marginBottom: 12 }} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="">{t("choose")}</option>
            {availableRoles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>

          <label style={label}>{t("priceLabel")}</label>
          <input
            type="number"
            min={1}
            style={{ ...input, marginBottom: 12, maxWidth: 160 }}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
          />

          {newRole === "skipper" && (
            <>
              <label style={label}>{t("licenseNumber")}</label>
              <input
                type="text"
                style={{ ...input, marginBottom: 12 }}
                value={newLicenseNumber}
                onChange={(e) => setNewLicenseNumber(e.target.value)}
              />
              <label style={label}>{t("licenseType")}</label>
              <input
                type="text"
                style={{ ...input, marginBottom: 12 }}
                value={newLicenseType}
                onChange={(e) => setNewLicenseType(e.target.value)}
              />
            </>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={button("primary")} disabled={busy || !newRole} onClick={handleAdd}>
              {busy ? t("saving") : t("addRole")}
            </button>
            <button type="button" style={button("secondary")} onClick={() => setAdding(false)}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : availableRoles.length > 0 ? (
        <button type="button" style={{ ...button("secondary"), marginTop: roles.length > 0 ? 14 : 0 }} onClick={() => setAdding(true)}>
          {t("addRolePlus")}
        </button>
      ) : (
        roles.length === 0 && <p style={{ ...muted, fontSize: 13 }}>{t("allRolesCovered")}</p>
      )}
    </div>
  );
}

// Μόνο skipper/ναύτης συμμετέχουν σε μεταφορές σκάφους (0067) — η επιλογή
// είναι ανεξάρτητη από τη συνήθη διαθεσιμότητα πληρώματος και ανά ρόλο, αφού
// κάποιος μπορεί να θέλει μεταφορές μόνο ως skipper αλλά όχι ως ναύτης.
//
// Διαστήματα ημερομηνιών, όχι ένα on/off flag (0068) — έτσι κάποιος που
// κάνει ναύλα το καλοκαίρι δηλώνει διαθεσιμότητα μόνο για τον χειμώνα μία
// φορά, αντί να πρέπει να θυμάται να ανοίγει/κλείνει διακόπτη κάθε σεζόν.
//
// Όλοι οι υποστηριζόμενοι ρόλοι (0070) — ο πελάτης αποφασίζει ο ίδιος ποιο
// πλήρωμα θέλει για μια μεταφορά, όχι η πλατφόρμα για λογαριασμό του.
const DELIVERY_ROLES = new Set(SUPPORTED_ROLES);

function DeliveryAvailability({ profile }) {
  const t = useTranslations("Profile");
  const f = useFormat();
  const [secondary, setSecondary] = useState([]);
  const [windows, setWindows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  async function load() {
    try {
      const [sec, w] = await Promise.all([
        getMySecondaryRoles(profile.id),
        getMyDeliveryAvailabilityWindows(profile.id),
      ]);
      setSecondary(sec);
      setWindows(w);
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  useEffect(() => {
    if (profile?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const roles = [
    { role: profile.role, approval_status: profile.approval_status },
    ...secondary.map((r) => ({ role: r.role, approval_status: r.approval_status })),
  ].filter((r) => DELIVERY_ROLES.has(r.role) && r.approval_status === "approved");

  if (roles.length === 0) return null;

  async function handleAdd() {
    setError("");
    if (!newRole) {
      setError(t("errRole"));
      return;
    }
    if (!newStart || !newEnd || newEnd < newStart) {
      setError(t("errRange"));
      return;
    }
    setBusy(true);
    try {
      await addDeliveryAvailabilityWindow(profile.id, newRole, newStart, newEnd);
      setAdding(false);
      setNewRole("");
      setNewStart("");
      setNewEnd("");
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id) {
    setBusy(true);
    try {
      await removeDeliveryAvailabilityWindow(id);
      await load();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={card}>
      <h2 style={{ ...h2, fontSize: 17 }}>{t("deliveryTitle")}</h2>
      <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
        {t("deliveryIntro")}
      </p>
      {error && <p style={{ color: colors.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {windows.length === 0 && !adding && (
        <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>{t("noRanges")}</p>
      )}

      {windows.map((w) => (
        <div
          key={w.id}
          style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 0", borderTop: `1px solid ${colors.border}` }}
        >
          <span style={{ minWidth: 80, fontWeight: 600 }}>{labelForRole(w.crew_role)}</span>
          <span style={{ fontSize: 13.5 }}>
            {f.dateRange(w.start_date, w.end_date)}
          </span>
          <button
            type="button"
            style={{ ...button("secondary"), marginLeft: "auto", padding: "6px 12px", fontSize: 13 }}
            disabled={busy}
            onClick={() => handleRemove(w.id)}
          >
            {t("remove")}
          </button>
        </div>
      ))}

      {adding ? (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` }}>
          <label style={label}>{t("role")}</label>
          <select style={{ ...select, marginBottom: 12 }} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="">{t("choose")}</option>
            {roles.map((r) => (
              <option key={r.role} value={r.role}>
                {labelForRole(r.role)}
              </option>
            ))}
          </select>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>{t("range")}</label>
            <DateField
              mode="range"
              title={t("availableForDeliveries")}
              value={{ startDate: newStart, endDate: newEnd }}
              onChange={({ startDate, endDate }) => {
                setNewStart(startDate);
                setNewEnd(endDate);
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={button("primary")} disabled={busy} onClick={handleAdd}>
              {busy ? t("saving") : t("addRange")}
            </button>
            <button type="button" style={button("secondary")} onClick={() => setAdding(false)}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" style={{ ...button("secondary"), marginTop: windows.length > 0 ? 14 : 0 }} onClick={() => setAdding(true)}>
          {t("addRangePlus")}
        </button>
      )}
    </div>
  );
}

const chip = (active) => ({
  padding: "9px 16px",
  borderRadius: radius.pill,
  fontSize: 14,
  fontFamily: "inherit",
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  border: `1px solid ${active ? colors.ink : colors.border}`,
  background: active ? colors.ink : "transparent",
  color: active ? "#fff" : colors.ink,
});

// Ένας επαγγελματίας συμπληρώνει ΜΟΝΟ το επαγγελματικό του προφίλ — η
// φωτογραφία, η εθνικότητα και οι γλώσσες που βλέπει ένας πελάτης όταν τον
// προσλαμβάνει αντλούνται αυτόματα από εκεί (lib/platform/db.js,
// updateSkipperProfile/setSkipperLookups). Μόνο ένας απλός λογαριασμός
// πελάτη — χωρίς κανένα επαγγελματικό προφίλ να αντλήσει — συμπληρώνει αυτά
// τα στοιχεία εδώ ο ίδιος.
const DELETE_ERRORS = ["has_pending_activity", "already_deleted", "user_not_found", "wrong_pin", "missing_fields", "locked_out"];

// Error text for a database code: the message \"err_<code>\" when this form knows the code.
const errText = (t, codes, code) => (codes.includes(code) ? t(`err_${code}`) : null);

// Αυτοεξυπηρέτηση διαγραφής — δικαίωμα που ήδη αναφέρει η πολιτική
// απορρήτου ("Μπορείς οποτεδήποτε να ζητήσεις διαγραφή"), εδώ πραγματικό
// κουμπί αντί για αίτημα μέσω φόρμας επικοινωνίας. Ζητά τον κωδικό (PIN),
// όπως η αλλαγή τηλεφώνου/email: ένα ξεκλείδωτο κινητό δεν αρκεί για να
// σβήσει κάποιος τον λογαριασμό σου.
function DeleteAccount() {
  const router = useRouter();
  const t = useTranslations("Profile");
  const [open, setOpen] = useState(false);
  const [pin, setPinValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setError("");
    setBusy(true);
    try {
      await deleteMyAccount(pin);
      await signOut();
      router.push("/platform");
    } catch (err) {
      setError(errText(t, DELETE_ERRORS, err.message) || friendlyError(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div style={{ marginTop: 28, textAlign: "center", display: "flex", justifyContent: "center", gap: 20, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ ...tapTarget, background: "none", border: "none", padding: 0, cursor: "pointer", color: colors.inkSoft, fontSize: 13, textDecoration: "underline" }}
        >
          {t("deleteAccount")}
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...card, borderLeft: `3px solid ${colors.danger}`, marginTop: 28 }}>
      <h2 style={{ ...h2, fontSize: 16 }}>{t("deleteAccount")}</h2>
      <p style={{ ...muted, fontSize: 13.5, margin: "0 0 14px" }}>
        {t("deleteBody")}
      </p>
      <label htmlFor="delete-pin" style={label}>{t("deletePinLabel")}</label>
      <input
        id="delete-pin"
        type="password"
        autoComplete="current-password"
        style={{ ...input, maxWidth: 200, marginBottom: 12 }}
        value={pin}
        onChange={(e) => setPinValue(e.target.value)}
      />
      {error && <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          disabled={busy || pin.length < 6}
          onClick={handleDelete}
          style={{ ...button("primary"), background: colors.danger, borderColor: colors.danger }}
        >
          {busy ? "…" : t("deleteFinal")}
        </button>
        <button type="button" disabled={busy} onClick={() => setOpen(false)} style={button("secondary")}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

const PHONE_ERRORS = ["phone_taken", "same_phone", "invalid_phone", "wrong_pin", "locked_out", "account_not_active"];

const EMAIL_ERRORS = ["invalid_email", "wrong_pin", "locked_out", "account_not_active"];

// Το email κάνει δύο δουλειές: εκεί φτάνουν οι ειδοποιήσεις όταν δεν έχεις
// ανοιχτή την εφαρμογή, κι εκεί έρχεται ο κωδικός αν ξεχάσεις το PIN — γι'
// αυτό αλλάζει μόνο με τον κωδικό, όπως το τηλέφωνο.
function EmailSettings() {
  const { userRow, refresh } = useAuth();
  const t = useTranslations("Profile");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pin, setPinValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const on = userRow?.email_notifications !== false;

  function close() {
    setOpen(false);
    setEmail("");
    setPinValue("");
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await changeMyEmail(email, pin);
      await refresh();
      close();
      setNotice(email.trim() ? t("emailChanged") : t("emailRemoved"));
    } catch (err) {
      setError(errText(t, EMAIL_ERRORS, err.message) || friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    setError("");
    try {
      await setMyEmailNotifications(!on);
      await refresh();
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
  return (
    <div style={card}>
      <h2 style={{ ...h2, fontSize: 17 }}>{t("emailTitle")}</h2>
      {notice && <p style={{ color: colors.success, fontSize: 13.5, margin: "0 0 12px" }}>{notice}</p>}

      <div style={row}>
        <div>
          <div style={{ ...muted, fontSize: 13 }}>{t("email")}</div>
          <div style={{ fontSize: 15, marginTop: 2 }}>{userRow?.email || t("noEmail")}</div>
        </div>
        {!open && (
          <button type="button" style={button("secondary")} onClick={() => { setOpen(true); setNotice(""); setEmail(userRow?.email || ""); }}>
            {userRow?.email ? t("change") : t("add")}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <label style={label} htmlFor="new-email">{t("email")}</label>
          <input id="new-email" type="email" inputMode="email" autoComplete="email" style={{ ...input, marginBottom: 14 }} value={email} onChange={(e) => setEmail(e.target.value)} />
          <label style={label} htmlFor="email-pin">{t("currentPin")}</label>
          <input id="email-pin" required type="password" autoComplete="current-password" style={{ ...input, marginBottom: 16 }} value={pin} onChange={(e) => setPinValue(e.target.value)} />
          {error && <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={busy} style={button("primary")}>{busy ? "…" : t("saveEmail")}</button>
            <button type="button" disabled={busy} onClick={close} style={button("secondary")}>{t("cancel")}</button>
          </div>
        </form>
      )}

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, paddingTop: 16, borderTop: `1px solid ${colors.border}`, cursor: userRow?.email ? "pointer" : "default" }}>
        <input type="checkbox" checked={on && Boolean(userRow?.email)} disabled={!userRow?.email} onChange={toggle} style={{ marginTop: 3 }} />
        <span>
          <span style={{ fontSize: 15 }}>{t("emailNotifications")}</span>
          <span style={{ ...muted, fontSize: 13, display: "block", marginTop: 2, lineHeight: 1.5 }}>
            {userRow?.email
              ? t("emailNotificationsOn")
              : t("emailNotificationsOff")}
          </span>
        </span>
      </label>
      {!open && error && <p style={{ color: colors.danger, fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
    </div>
  );
}

// Τηλέφωνο σύνδεσης και κωδικός μαζί: είναι τα δύο πράγματα με τα οποία
// μπαίνει κανείς, και ήταν πριν διάσπαρτα (το τηλέφωνο «δεν αλλάζει εδώ», ο
// κωδικός ένα μικρό link δίπλα στη διαγραφή λογαριασμού).
function AccountAccess() {
  const { userRow, refresh } = useAuth();
  const t = useTranslations("Profile");
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneAgain, setPhoneAgain] = useState("");
  const [phoneOk, setPhoneOk] = useState(false);
  const [phoneAgainOk, setPhoneAgainOk] = useState(false);
  const [pin, setPinValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tried, setTried] = useState(false);

  function close() {
    setOpen(false);
    setPhone("");
    setPhoneAgain("");
    setPhoneOk(false);
    setPhoneAgainOk(false);
    setTried(false);
    setPinValue("");
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    // Typed twice on purpose: there's no SMS check yet, and a wrong digit
    // here would move the account to a number its owner can't sign in with.
    setTried(true);
    if (!phoneOk) return document.getElementById("new-phone")?.focus();
    if (normalizePhone(phone) !== normalizePhone(phoneAgain) || !phoneAgainOk) return setError(t("phonesMismatch"));
    setBusy(true);
    try {
      const res = await changeMyPhone(phone, pin);
      await refresh();
      close();
      setNotice(t("phoneChanged", { phone: res.phone }));
    } catch (err) {
      setError(errText(t, PHONE_ERRORS, err.message) || friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" };
  return (
    <div style={card}>
      <h2 style={{ ...h2, fontSize: 17 }}>{t("accessTitle")}</h2>
      {notice && <p style={{ color: colors.success, fontSize: 13.5, margin: "0 0 12px" }}>{notice}</p>}

      <div style={row}>
        <div>
          <div style={{ ...muted, fontSize: 13 }}>{t("loginPhone")}</div>
          <div style={{ fontSize: 15, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{userRow?.phone_number}</div>
        </div>
        {!open && (
          <button type="button" style={button("secondary")} onClick={() => { setOpen(true); setNotice(""); }}>
            {t("change")}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <p style={{ ...muted, fontSize: 13, margin: "0 0 14px", lineHeight: 1.5 }}>
            {t("newPhoneNote")}
          </p>
          <label style={label} htmlFor="new-phone">{t("newPhone")}</label>
          <div style={{ marginBottom: 14 }}><PhoneField id="new-phone" showErrors={tried} onChange={({ phone: p, valid }) => { setPhone(p); setPhoneOk(valid); }} /></div>
          <label style={label} htmlFor="new-phone-again">{t("newPhoneAgain")}</label>
          <div style={{ marginBottom: 14 }}><PhoneField id="new-phone-again" quiet onChange={({ phone: p, valid }) => { setPhoneAgain(p); setPhoneAgainOk(valid); }} /></div>
          <label style={label} htmlFor="current-pin">{t("currentPin")}</label>
          <input id="current-pin" required type="password" autoComplete="current-password" style={{ ...input, marginBottom: 16 }} value={pin} onChange={(e) => setPinValue(e.target.value)} />
          {error && <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={busy} style={button("primary")}>{busy ? "…" : t("changePhone")}</button>
            <button type="button" disabled={busy} onClick={close} style={button("secondary")}>{t("cancel")}</button>
          </div>
        </form>
      )}

      <div style={{ ...row, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
        <div>
          <div style={{ ...muted, fontSize: 13 }}>{t("pin")}</div>
          <div style={{ fontSize: 15, marginTop: 2, letterSpacing: "0.15em" }}>••••••</div>
        </div>
        <Link href="/platform/set-pin?change=1" style={{ ...button("secondary"), textDecoration: "none" }}>
          {t("changePin")}
        </Link>
      </div>

      {GOOGLE_LOGIN_ENABLED && <GoogleLink rowStyle={row} />}
    </div>
  );
}

// Σύνδεση του λογαριασμού με Google (0121): ο ίδιος λογαριασμός, δεύτερος τρόπος εισόδου.
function GoogleLink({ rowStyle }) {
  const t = useTranslations("Profile");
  const [identity, setIdentity] = useState(undefined); // undefined: φορτώνει · null: δεν έχει
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { fail } = useFeedback();
  useEffect(() => {
    // Επιστροφή από τη Google χωρίς σύνδεση: ακυρώθηκε, ή ο λογαριασμός Google ανήκει ήδη σε άλλον.
    // Η σελίδα ανοίγει από την κορυφή: το μήνυμα φαίνεται και κάτω στην οθόνη, όχι μόνο εδώ.
    const q = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
    const failed = q.get("error_code") || q.get("error");
    if (failed) {
      const message =
        failed === "identity_already_exists"
          ? t("googleTaken")
          : t("googleFailed");
      setError(message);
      fail(message);
      const keep = new URLSearchParams(window.location.search);
      ["error", "error_code", "error_description"].forEach((k) => keep.delete(k));
      window.history.replaceState(null, "", window.location.pathname + (keep.toString() ? `?${keep}` : ""));
    }
    getGoogleIdentity().then(setIdentity).catch(() => setIdentity(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (identity === undefined) return null;

  async function connect() {
    setError("");
    setBusy(true);
    try {
      await linkGoogleAccount();
    } catch (err) {
      setBusy(false);
      setError(friendlyError(err));
    }
  }

  return (
    <div style={{ ...rowStyle, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${colors.border}` }}>
      <div>
        <div style={{ ...muted, fontSize: 13 }}>Google</div>
        <div style={{ fontSize: 15, marginTop: 2, overflowWrap: "anywhere" }}>{identity ? identity.email : t("googleNotLinked")}</div>
        {error && <p style={{ color: colors.danger, fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
      </div>
      {!identity && (
        <button type="button" disabled={busy} onClick={connect} style={button("secondary")}>
          {busy ? "…" : t("googleLink")}
        </button>
      )}
    </div>
  );
}

const BECOME_PROFESSIONAL_ERRORS = [
  "already_professional",
  "account_not_active",
  "license_number_required",
  "license_type_required",
  "license_already_registered",
  "profile_already_exists",
];

// Ένας ήδη ζωντανός πελάτης δεν ξαναγράφεται από την αρχή για να αποκτήσει
// επαγγελματικό προφίλ — απλό, ρητό κουμπί εδώ αντί γι' αυτό (βλ. σχόλιο στο
// migration 0082: το complete_registration αρνείται σκόπιμα να αλλάξει ρόλο
// σε ζωντανό λογαριασμό). Φωτογραφία/εθνικότητα/γλώσσες δεν ξαναζητούνται —
// ζουν πλέον στο users (0081), έρχονται αυτόματα· μόνο τα καθαρά
// επαγγελματικά στοιχεία λείπουν. approval_status ξεκινάει πάντα 'pending',
// ίδια πορεία έγκρισης με κάθε νέο επαγγελματία.
function BecomeProfessional() {
  const router = useRouter();
  const t = useTranslations("Profile");
  const { refresh } = useAuth();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  // Ο σύνδεσμος από «Οι ρόλοι μου» (?become=professional) ανοίγει κατευθείαν τη φόρμα και τη φέρνει στο κέντρο.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("become") !== "professional") return;
    setOpen(true);
    setTimeout(() => boxRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 150);
  }, []);
  const [crewRole, setCrewRole] = useState("skipper");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseType, setLicenseType] = useState("");
  const [yearsExperience, setYearsExperience] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!licenseNumber.trim()) return setError(t("err_license_number_required"));
    if (!licenseType.trim()) return setError(t("err_license_type_required"));
    if (!(Number(pricePerDay) > 0)) {
      return setError(t("errPrice"));
    }
    setBusy(true);
    try {
      await becomeProfessional({
        crewRole,
        licenseNumber: licenseNumber.trim(),
        licenseType: licenseType.trim(),
        yearsExperience: Number(yearsExperience) || 0,
        pricePerDay: Number(pricePerDay),
      });
      await refresh();
      router.push("/platform/profile");
    } catch (err) {
      setError(errText(t, BECOME_PROFESSIONAL_ERRORS, err.message) || friendlyError(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div ref={boxRef} style={{ ...card, textAlign: "center" }}>
        <p style={{ margin: "0 0 12px", fontSize: 14.5 }}>{t("becomeQuestion")}</p>
        <button type="button" style={button("secondary")} onClick={() => setOpen(true)}>
          {t("start")}
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={card}>
      <h2 style={{ ...h2, fontSize: 17 }}>{t("becomeTitle")}</h2>
      <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
        {t("becomeIntro")}
      </p>
      <form onSubmit={handleSubmit}>
        <label style={label}>{t("capacity")}</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {CREW_ROLES.map((r) => (
            <button key={r.key} type="button" style={chip(crewRole === r.key)} onClick={() => setCrewRole(r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        <label style={label} htmlFor="bp-license-number">
          {t("licenseNumber")}
        </label>
        <input
          id="bp-license-number"
          style={{ ...input, marginBottom: 16 }}
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
        />

        <label style={label} htmlFor="bp-license-type">
          {t("licenseType")}
        </label>
        <input
          id="bp-license-type"
          style={{ ...input, marginBottom: 16 }}
          value={licenseType}
          onChange={(e) => setLicenseType(e.target.value)}
        />

        <label style={label} htmlFor="bp-years">
          {t("yearsExperience")}
        </label>
        <input
          id="bp-years"
          type="number"
          min={0}
          style={{ ...input, marginBottom: 16 }}
          value={yearsExperience}
          onChange={(e) => setYearsExperience(e.target.value)}
        />

        <label style={label} htmlFor="bp-price">
          {t("priceLabel")}
        </label>
        <input
          id="bp-price"
          type="number"
          min={1}
          style={{ ...input, marginBottom: 20 }}
          value={pricePerDay}
          onChange={(e) => setPricePerDay(e.target.value)}
        />

        {error && <p style={{ color: colors.danger, fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" disabled={busy} style={button("primary")}>
            {busy ? "…" : t("submit")}
          </button>
          <button type="button" disabled={busy} style={button("secondary")} onClick={() => setOpen(false)}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function ClientIdentityProfile({ role }) {
  const { session, userRow, refresh } = useAuth();
  const t = useTranslations("Profile");
  const L = useLocalData();
  const [lookups, setLookups] = useState({ nationalities: [], languages: [] });
  const [nationalityId, setNationalityId] = useState("");
  const [languageIds, setLanguageIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session) return;
    listLookups().then(setLookups).catch(() => {});
    getMyClientProfile().then((p) => setNationalityId(p?.nationality_id || "")).catch(() => {});
    getClientLanguages(userRow?.id).then(setLanguageIds).catch(() => {});
  }, [session, userRow?.id]);

  async function handleUploaded(url) {
    await updateMyPhoto(url);
    await refresh();
  }

  async function handleSave() {
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await updateClientProfile({ nationality_id: nationalityId || null });
      await setClientLanguages(userRow.id, languageIds);
      setSaved(true);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={container}>
      <h1 style={h1}>{t("title")}</h1>
      <PinChangedNotice />
      {role && role !== "client" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>{t("asClient")}</p>}
      <MyRatings />

      <div style={card}>
        <h2 style={{ ...h2, fontSize: 17 }}>{t("photo")}</h2>
        <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
          {t("photoNote")}
        </p>
        <PhotoUpload value={userRow?.photo_url} onUploaded={handleUploaded} />
      </div>

      <div style={card}>
        <h2 style={{ ...h2, fontSize: 17 }}>{t("natLangTitle")}</h2>
        <p style={{ ...muted, fontSize: 13, margin: "0 0 14px" }}>
          {t("natLangNote")}
        </p>

        <label style={label} htmlFor="c-nationality">
          {t("nationality")}
        </label>
        <select
          id="c-nationality"
          style={{ ...select, marginBottom: 18 }}
          value={nationalityId}
          onChange={(e) => {
            setNationalityId(e.target.value);
            setSaved(false);
          }}
        >
          <option value="">—</option>
          {lookups.nationalities.map((n) => (
            <option key={n.id} value={n.id}>
              {L.text(n.name)}
            </option>
          ))}
        </select>

        <span style={label}>{t("languages")}</span>
        <div style={{ marginBottom: 20 }}>
          <MultiPick
            label={t("languages")}
            placeholder={t("addLanguage")}
            options={lookups.languages}
            value={languageIds}
            common={COMMON_LANGUAGES}
            onChange={(ids) => {
              setLanguageIds(ids);
              setSaved(false);
            }}
          />
        </div>

        <button type="button" disabled={busy} style={button("primary")} onClick={handleSave}>
          {busy ? t("saving") : saved ? t("saved") : t("save")}
        </button>
        {error && <p style={{ color: colors.danger, marginTop: 10, fontSize: 13 }}>{error}</p>}
      </div>

      <AccountAccess />
      <PushSettings />
      <EmailSettings />

      <p style={{ ...muted, fontSize: 12.5, marginTop: 4, color: colors.inkSoft }}>
        {t("nameNote")}
      </p>

      <BecomeProfessional />

      <DeleteAccount />
    </div>
  );
}

// Shown once after Αλλαγή κωδικού sends the user back here. Read from
// window.location in an effect: this page has no Suspense boundary for
// useSearchParams, and the note has nothing to render on the server anyway.
function PinChangedNotice() {
  const t = useTranslations("Profile");
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("pin") === "changed") setShow(true);
  }, []);
  if (!show) return null;
  return (
    <div style={{ ...card, borderLeft: `3px solid ${colors.success}`, marginBottom: 16 }}>
      {t("pinChanged")}
    </div>
  );
}

// Οι αξιολογήσεις του χρήστη: ως επαγγελματίας (αν είναι) και ως πελάτης.
function MyRatings({ proProfile }) {
  const t = useTranslations("Profile");
  const [clientProfile, setClientProfile] = useState(null);
  useEffect(() => {
    getMyClientProfile().then(setClientProfile).catch(() => {});
  }, []);
  if (!proProfile && !clientProfile) return null;
  return (
    <div style={card}>
      <h2 style={{ ...h2, fontSize: 17 }}>{t("ratings")}</h2>
      {proProfile && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <span style={{ ...muted, fontSize: 13.5, minWidth: 120 }}>{t("asProfessionalLabel")}</span>
          <Stars rating={proProfile.rating_avg} count={proProfile.rating_count} size={16} />
        </div>
      )}
      {clientProfile && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          <span style={{ ...muted, fontSize: 13.5, minWidth: 120 }}>{t("asClientLabel")}</span>
          <Stars rating={clientProfile.rating_avg} count={clientProfile.rating_count ?? 0} size={16} />
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const t = useTranslations("Profile");
  const { session, profile, userRow, loading, refresh, loadError, isAdmin, role } = useAuth();

  if (loading) return <div style={container}>{t("loading")}</div>;
  if (!session) return <SignedOutNotice />;

  const isProfessional = userRow?.role === "skipper" || isAdmin;
  if (!isProfessional) return <ClientIdentityProfile role={role} />;
  if (!profile) return <MissingProfile userRow={userRow} isAdmin={isAdmin} refresh={refresh} loadError={loadError} />;

  return (
    <div style={container}>
      <h1 style={h1}>{t("title")}</h1>
      <PinChangedNotice />
      {userRow?.role !== "skipper" && <p style={{ ...muted, marginTop: -8, marginBottom: 16 }}>{t("asProfessional")}</p>}
      <MyRatings proProfile={profile} />
      <ProfileForm profile={profile} onSaved={refresh} />
      <DeliveryAvailability profile={profile} />
      <SecondaryRoles profile={profile} />
      <AccountAccess />
      <PushSettings />
      <EmailSettings />
      <DeleteAccount />
    </div>
  );
}

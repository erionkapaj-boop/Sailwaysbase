"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js/mobile";
import { countriesFor, countryByIso } from "../../../lib/platform/countryCodes";
import { isValidPhone, formatPhone } from "../../../lib/platform/phone";
import { colors, input, radius } from "../../../lib/platform/theme";

// Πεδίο τηλεφώνου (μόνο κινητό): χώρα (προεπιλογή Ελλάδα, +30) και αριθμός. Ο αριθμός ελέγχεται με τους
// κανόνες της χώρας (μήκος, πρώτα ψηφία) καθώς γράφεται, και όταν είναι σωστός φαίνεται
// ολόκληρος και μορφοποιημένος, ώστε να τον δει ο ίδιος ο χρήστης πριν συνεχίσει. Ένας
// διεθνής αριθμός που επικολλάται («+30 694…», «0030…») διαλέγει μόνος του τη χώρα.
//
// onChange({ phone, valid }): phone σε μορφή E.164 (+306940903478), valid αν περνά τον έλεγχο.
//   quiet: χωρίς μηνύματα (π.χ. στη Σύνδεση, όπου ένας λάθος αριθμός απλώς δεν βρίσκεται).
//   showErrors: δείχνει το σφάλμα και πριν φύγει ο χρήστης από το πεδίο (π.χ. μετά το «Συνέχεια»).

// Η επιλογή χώρας φαίνεται ως «+30» (το όνομα δεν χωρά στο κινητό), αλλά μένει κανονικό
// select από πάνω, ώστε να ανοίγει η λίστα του κινητού με τα ονόματα των χωρών.
const CSS = `
.sf-phone-country { position: relative; flex: 0 0 92px; min-width: 0; }
.sf-phone-country-face { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 6px;
  height: 100%; min-height: 44px; padding: 0 12px; border-radius: ${radius.md}px; border: 1px solid ${colors.border};
  background: ${colors.card}; color: ${colors.ink}; font-size: 16px; font-variant-numeric: tabular-nums; }
.sf-phone-country select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 16px; }
.sf-phone-country select:focus-visible + .sf-phone-country-face,
.sf-phone-country:focus-within .sf-phone-country-face { border-color: ${colors.ink}; box-shadow: 0 0 0 4px rgba(22,40,60,0.07); }
.sf-phone-country select:disabled + .sf-phone-country-face { opacity: .6; }
`;

function toE164(iso, national) {
  const digits = national.replace(/\D/g, "");
  if (!digits) return "";
  const local = iso === "GR" ? digits.replace(/^0+/, "") : digits;
  const parsed = parsePhoneNumberFromString(local, iso);
  return parsed?.number || `${countryByIso(iso).code}${local}`;
}

export default function PhoneField({ id, onChange, quiet = false, showErrors = false, defaultIso = "GR", autoFocus, required = true, disabled = false }) {
  const t = useTranslations("PhoneField");
  const COUNTRIES = countriesFor(useLocale());
  const [iso, setIso] = useState(defaultIso);
  const [display, setDisplay] = useState("");
  const [touched, setTouched] = useState(false);

  const emit = (nextIso, nextDisplay) => {
    const phone = toE164(nextIso, nextDisplay);
    onChange?.({ phone, valid: phone ? isValidPhone(phone) : false });
  };

  const format = (nextIso, digits) => (digits ? new AsYouType(nextIso).input(nextIso === "GR" ? digits.replace(/^0+/, "") : digits) : "");

  function handleInput(raw) {
    // Διεθνής αριθμός μέσα στον αριθμό: διαλέγει τη χώρα και κρατά μόνο το τοπικό μέρος.
    if (/^\s*(\+|00)/.test(raw)) {
      const parsed = parsePhoneNumberFromString(raw.replace(/^\s*00/, "+"));
      if (parsed) {
        const known =
          COUNTRIES.find((c) => c.iso === parsed.country) || COUNTRIES.find((c) => c.code === `+${parsed.countryCallingCode}`);
        if (known) {
          const nextDisplay = format(known.iso, parsed.nationalNumber);
          setIso(known.iso);
          setDisplay(nextDisplay);
          emit(known.iso, nextDisplay);
          return;
        }
      }
    }
    const digits = raw.replace(/\D/g, "");
    const nextDisplay = format(iso, digits);
    setDisplay(nextDisplay);
    emit(iso, nextDisplay);
  }

  function handleCountry(nextIso) {
    setIso(nextIso);
    const digits = display.replace(/\D/g, "");
    const nextDisplay = format(nextIso, digits);
    setDisplay(nextDisplay);
    emit(nextIso, nextDisplay);
  }

  const phone = toE164(iso, display);
  const valid = phone ? isValidPhone(phone) : false;
  const digitCount = display.replace(/\D/g, "").length;
  const showError = !quiet && !valid && digitCount > 0 && (touched || showErrors);
  const message = showError ? (iso === "GR" ? t("hintGR") : t("hint")) : "";
  const echo = !quiet && valid ? formatPhone(phone) : "";

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ display: "flex", gap: 8 }}>
        <div className="sf-phone-country">
          <select aria-label={t("country")} value={iso} disabled={disabled} onChange={(e) => handleCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.iso} value={c.iso}>
                {c.name} {c.code}
              </option>
            ))}
          </select>
          <div className="sf-phone-country-face" aria-hidden="true">
            <span>{countryByIso(iso).code}</span>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1l4 4 4-4" stroke={colors.inkSoft} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          autoFocus={autoFocus}
          required={required}
          placeholder={iso === "GR" ? t("placeholderGR") : t("placeholder")}
          aria-invalid={showError || undefined}
          style={{ ...input, flex: 1, minWidth: 0, fontSize: 16, borderColor: showError ? colors.danger : colors.border }}
          value={display}
          disabled={disabled}
          onChange={(e) => handleInput(e.target.value)}
          onBlur={() => setTouched(true)}
        />
      </div>
      {message && (
        <p role="alert" style={{ color: colors.danger, fontSize: 13, margin: "8px 0 0" }}>
          {message}
        </p>
      )}
      {echo && (
        <p aria-live="polite" style={{ color: colors.inkSoft, fontSize: 13, margin: "8px 0 0" }}>
          {echo}
        </p>
      )}
    </div>
  );
}

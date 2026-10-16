"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Flag from "./Flags";
import { enabledLocales, LANGUAGES, LOCALE_COOKIE } from "../../../lib/platform/i18n";
import { setMyLocale } from "../../../lib/platform/db";
import { colors, radius, shadow, fontSans } from "../../../lib/platform/theme";

// Το κλασικό κουμπί γλώσσας: σημαία και κωδικός, και λίστα με τις γλώσσες που
// υπάρχουν (docs/I18N.md). Στέκεται πάνω δεξιά στην κεφαλίδα, εκεί που το
// ψάχνει όποιος δεν διαβάζει τη γλώσσα της σελίδας, και τα ονόματα των γλωσσών
// γράφονται πάντα στη δική τους γλώσσα ("Ελληνικά", "English").
//
// Δεν φαίνεται καθόλου όσο υπάρχει μία μόνο ανοιχτή γλώσσα (βλ. enabledLocales):
// ο χρήστης δεν βλέπει ποτέ επιλογή που οδηγεί σε μισή μετάφραση.
//
// Η γλώσσα δεν μπαίνει στη διεύθυνση· γράφεται σε cookie που διαβάζει ο
// διακομιστής (i18n/request.js), και, αν ο χρήστης είναι συνδεδεμένος, και στον
// λογαριασμό του, ώστε τα emails και οι άλλες συσκευές του να τη βρίσκουν.
// Στην κεφαλίδα: μόνο ο κωδικός της γλώσσας με γράμματα («ΕΛ», «EN»), χωρίς σημαία (απόφαση ιδιοκτήτη 16/10/2026).
// compact: λίγο μεγαλύτερα γράμματα (κεφαλίδα της αρχικής).
export default function LanguageSwitcher({ compact = false }) {
  const locale = useLocale();
  const t = useTranslations("LanguageSwitcher");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const root = useRef(null);
  const options = enabledLocales();

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (root.current && !root.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (options.length < 2) return null;
  const current = LANGUAGES[locale] || LANGUAGES[options[0]];

  function choose(code) {
    setOpen(false);
    if (code === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    // Στον λογαριασμό, αθόρυβα: αν αποτύχει, το cookie φτάνει για αυτή τη συσκευή.
    setMyLocale(code).catch(() => {});
    startTransition(() => router.refresh());
  }

  return (
    <div ref={root} className="sf-lang" style={{ position: "relative", flexShrink: 0, opacity: pending ? 0.6 : 1 }}>
      <style
        dangerouslySetInnerHTML={{
          __html:
                        ".sf-lang-item:hover,.sf-lang-item:focus-visible{background:" + colors.seaGlass + "}",
        }}
      />
      <button
        type="button"
        data-language-button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("change")}: ${current.name}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          minHeight: 44,
          minWidth: 44,
          padding: "0 10px",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          borderRadius: radius.md,
          cursor: "pointer",
          fontFamily: fontSans,
          fontSize: 13,
          fontWeight: 500,
          color: colors.ink,
        }}
      >
        <span data-language-code style={{ fontSize: compact ? 14 : 13, fontWeight: 400, color: colors.inkSoft }}>{t("short")}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true" style={{ opacity: 0.55 }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("change")}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 60,
            listStyle: "none",
            margin: 0,
            padding: 6,
            minWidth: 180,
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: radius.lg,
            boxShadow: shadow.raised,
          }}
        >
          {options.map((code) => {
            const lang = LANGUAGES[code];
            const active = code === locale;
            return (
              <li key={code} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  lang={code}
                  className="sf-lang-item"
                  onClick={() => choose(code)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    minHeight: 48,
                    padding: "0 12px",
                    background: "transparent",
                    border: "none",
                    borderRadius: radius.md,
                    cursor: "pointer",
                    fontFamily: fontSans,
                    fontSize: 15,
                    fontWeight: active ? 600 : 400,
                    color: colors.ink,
                    textAlign: "left",
                  }}
                >
                  <Flag name={lang.flag} />
                  <span style={{ flex: 1 }}>{lang.name}</span>
                  {active && (
                    <svg width="14" height="11" viewBox="0 0 14 11" aria-hidden="true">
                      <path d="M1 5.5l4 4 8-8.5" stroke={colors.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

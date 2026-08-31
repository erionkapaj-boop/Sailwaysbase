"use client";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { colors, radius } from "../../../lib/platform/theme";

// No URL segment for locale (see i18n/request.js) — switching just writes
// the cookie the server-side config reads, then asks the router to re-run
// the current route's server work so every server component (this whole
// tree, since app/platform/layout.js is one) picks up the new language on
// the very next render. A plain reload would do the same thing louder.
export default function LanguageSwitcher({ compact }) {
  const locale = useLocale();
  const t = useTranslations("LanguageSwitcher");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setLocale(next) {
    if (next === locale) return;
    document.cookie = `sf_locale=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => {
      router.refresh();
    });
  }

  const option = (code, label) => ({
    padding: compact ? "4px 7px" : "5px 9px",
    fontSize: 12,
    fontFamily: "inherit",
    fontWeight: locale === code ? 600 : 400,
    cursor: pending ? "default" : "pointer",
    border: "none",
    background: "transparent",
    color: locale === code ? colors.ink : colors.inkSoft,
    borderRadius: radius.sm,
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        border: `1px solid ${colors.border}`,
        borderRadius: radius.pill,
        padding: 2,
        opacity: pending ? 0.6 : 1,
        flexShrink: 0,
      }}
      role="group"
      aria-label={t("greek") + " / " + t("english")}
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => setLocale("el")}
        aria-pressed={locale === "el"}
        aria-label={t("switchTo", { language: t("greek") })}
        style={option("el")}
      >
        EL
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        aria-label={t("switchTo", { language: t("english") })}
        style={option("en")}
      >
        EN
      </button>
    </div>
  );
}

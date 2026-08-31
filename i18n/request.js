import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

// Greek/English only, no URL prefix — the language lives in a cookie, not
// the path. Chosen specifically so this stays additive: every existing
// /platform/* URL keeps working exactly as it does today, nothing about
// routing or the middleware.js host-rewrite changes because of this.
export const LOCALES = ["el", "en"];
export const DEFAULT_LOCALE = "el";
export const LOCALE_COOKIE = "sf_locale";

// Same hostnames middleware.js already rewrites to /platform — once
// skipperfinder.com is actually pointed here, opening it lands in English
// by default instead of the platform-wide Greek default. This only decides
// the STARTING language when nobody has picked one yet; an explicit choice
// via the cookie (LanguageSwitcher) always wins, on either domain.
const ENGLISH_DEFAULT_HOSTS = new Set(["skipperfinder.com", "www.skipperfinder.com"]);

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;

  let locale;
  if (LOCALES.includes(raw)) {
    locale = raw;
  } else {
    const hdrs = await headers();
    const hostname = (hdrs.get("host") || "").split(":")[0];
    locale = ENGLISH_DEFAULT_HOSTS.has(hostname) ? "en" : DEFAULT_LOCALE;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

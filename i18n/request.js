import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

// Greek/English only, no URL prefix — the language lives in a cookie, not
// the path. Chosen specifically so this stays additive: every existing
// /platform/* URL keeps working exactly as it does today, nothing about
// routing or the middleware.js host-rewrite changes because of this.
export const LOCALES = ["el", "en"];
export const DEFAULT_LOCALE = "el";
export const LOCALE_COOKIE = "sf_locale";

export default getRequestConfig(async () => {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  const locale = LOCALES.includes(raw) ? raw : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

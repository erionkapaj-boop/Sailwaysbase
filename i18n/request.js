import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, resolveLocale } from "../lib/platform/i18n";
import { loadMessages } from "../lib/platform/loadMessages";

// Οι γλώσσες, η προεπιλογή και ό,τι ανοίγει ανά domain ζουν στο
// lib/platform/i18n.js (docs/I18N.md). Εδώ μόνο διαβάζονται το cookie και το
// domain του αιτήματος. Η γλώσσα δεν μπαίνει στη διεύθυνση: κάθε υπάρχον
// /platform/* link δουλεύει όπως πριν και το middleware.js δεν αλλάζει.
export { LOCALE_COOKIE };

export default getRequestConfig(async () => {
  const store = await cookies();
  const hdrs = await headers();
  const locale = resolveLocale({
    cookie: store.get(LOCALE_COOKIE)?.value,
    hostname: (hdrs.get("host") || "").split(":")[0],
  });

  return {
    locale,
    messages: await loadMessages(locale),
  };
});

import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, LANGUAGES } from "./i18n.js";
import { loadMessages } from "./loadMessages.js";

// Μηνύματα στον διακομιστή (emails, cron), εκεί που δεν υπάρχει React
// (docs/I18N.md). Η γλώσσα έρχεται από τον παραλήπτη, όχι από το αίτημα:
//   const t = await translatorFor(user.locale, "Email");
//   t("greetingNamed", { name })
// Νέα γλώσσα = το αρχείο της στα messages· κανένας κώδικας εδώ.
export async function translatorFor(locale, namespace) {
  const code = LANGUAGES[locale] ? locale : DEFAULT_LOCALE;
  const messages = await loadMessages(code);
  return createTranslator({ locale: code, messages, namespace, onError: () => {} });
}

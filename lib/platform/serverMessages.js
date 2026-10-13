import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, LANGUAGES } from "./i18n.js";

// Μηνύματα στον διακομιστή (emails, cron), εκεί που δεν υπάρχει React
// (docs/I18N.md). Η γλώσσα έρχεται από τον παραλήπτη, όχι από το αίτημα:
//   const t = await translatorFor(user.locale, "Email");
//   t("greetingNamed", { name })
// Νέα γλώσσα = το αρχείο της στα messages· κανένας κώδικας εδώ.
export async function translatorFor(locale, namespace) {
  const code = LANGUAGES[locale] ? locale : DEFAULT_LOCALE;
  let messages;
  try {
    messages = (await import(`../../messages/${code}.json`)).default;
  } catch {
    messages = (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default;
  }
  return createTranslator({ locale: code, messages, namespace, onError: () => {} });
}

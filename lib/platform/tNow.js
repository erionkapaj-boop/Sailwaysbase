import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE } from "./i18n.js";

// Μεταφράσεις για κώδικα που δεν είναι component (friendlyError, ρόλοι,
// μηνύματα επιτυχίας…). Το MessageBridge (μέσα στον NextIntlClientProvider)
// ρυθμίζει εδώ τη γλώσσα και τα μηνύματα της σελίδας πριν ζωγραφιστεί ο,τιδήποτε,
// ώστε οι συναρτήσεις αυτές να μιλούν πάντα τη γλώσσα που βλέπει ο χρήστης.
// Σε διακομιστή (emails, cron) δεν χρησιμοποιείται: εκεί υπάρχει το translatorFor
// με ρητή γλώσσα (serverMessages.js).
let current = { locale: DEFAULT_LOCALE, messages: null };
const cache = new Map();

export function setCurrentMessages(locale, messages) {
  if (current.messages === messages && current.locale === locale) return;
  current = { locale, messages };
  cache.clear();
}

export function currentLocale() {
  return current.locale;
}

function translator(namespace) {
  if (!cache.has(namespace)) {
    cache.set(
      namespace,
      createTranslator({ locale: current.locale, messages: current.messages || {}, namespace, onError: () => {} })
    );
  }
  return cache.get(namespace);
}

export function tNow(namespace, key, values) {
  if (!current.messages) return key;
  return translator(namespace)(key, values);
}

export function hasNow(namespace, key) {
  if (!current.messages) return false;
  return translator(namespace).has(key);
}

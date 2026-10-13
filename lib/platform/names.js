import { DEFAULT_LOCALE } from "./i18n.js";

// Το όνομα ενός ανθρώπου στη γλώσσα της σελίδας: στα ελληνικά όπως γράφτηκε, σε κάθε
// άλλη γλώσσα το λατινικό (full_name_latin, που το υπολογίζει η βάση, docs/I18N.md §6)
// και, αν λείπει, όπως γράφτηκε.
export function displayName(person, locale = DEFAULT_LOCALE) {
  if (!person) return "";
  return (locale !== DEFAULT_LOCALE && person.full_name_latin) || person.full_name || "";
}

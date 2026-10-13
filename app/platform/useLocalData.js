"use client";
import { useLocale } from "next-intl";
import { localizeData, localizeName, displayName } from "../../lib/platform/localData";

// Δεδομένα της βάσης στη γλώσσα της σελίδας (docs/I18N.md §7):
//   const L = useLocalData();
//   L.text(place.name)        τόποι, περιοχές, τύποι σκαφών, γλώσσες, εθνικότητες
//   L.person(person)          όνομα ανθρώπου (full_name_latin ή μεταγραφή)
//   L.name("Φανούριος …")     όνομα που έρχεται ως απλό κείμενο
export function useLocalData() {
  const locale = useLocale();
  return {
    locale,
    text: (v) => localizeData(v, locale),
    name: (v) => localizeName(v, locale),
    person: (p) => displayName(p, locale),
  };
}

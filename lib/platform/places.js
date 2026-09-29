// Λεξικό μερών: ό,τι μπορεί να γράψει ένας πελάτης για το πού ξεκινά το
// ταξίδι του (νησί, πόλη, λιμάνι), με την περιοχή στην οποία ανήκει.
//
// Ο πελάτης δεν χρειάζεται να ξέρει τις περιοχές: γράφει «Πάρος» και η
// περιοχή (Κυκλάδες) προκύπτει από εδώ. Οι επαγγελματίες συνεχίζουν να
// δηλώνουν περιοχές· το λεξικό είναι η γέφυρα ανάμεσα στα δύο. Κάθε παράκτιο
// μέρος έχει περιοχή, ώστε να ξέρουμε ποιοι επαγγελματίες το καλύπτουν.
//
// Κάθε χώρα είναι ένα αρχείο στο ./countries με την ίδια μορφή (βλ. gr.js).
// Νέα χώρα: αντιγράφεις το gr.js, αλλάζεις τα δεδομένα, και προσθέτεις μία
// γραμμή στη λίστα παρακάτω. Ο κώδικας του πεδίου δεν αλλάζει.

import { GREECE } from "./countries/gr.js";

const COUNTRY_FILES = [GREECE];

export const COUNTRIES = COUNTRY_FILES.map(({ code, name, en, aka }) => ({ code, name, en, aka: aka || [] }));

// Περιοχές: όνομα → { country, in, en, aka, order, near? }. Ίδια ονόματα με
// τον πίνακα regions. Όσες δεν υπάρχουν εκεί δεν καλύπτονται ακόμα.
export const REGION_INFO = Object.fromEntries(
  COUNTRY_FILES.flatMap((c) => Object.entries(c.areas).map(([name, info]) => [name, { ...info, country: c.code }]))
);

export const PLACES = COUNTRY_FILES.flatMap((c) => c.places.map((p) => ({ ...p, country: c.code })));

// Τρία γνωστά μέρη ανά περιοχή, για να καταλαβαίνει κανείς τι σημαίνει το όνομά της.
export function regionExamples(regionName, count = 3) {
  const inRegion = PLACES.filter((p) => p.region === regionName && p.kind !== "port");
  const byPopular = [...inRegion].sort((a, b) => (a.popular || 99) - (b.popular || 99));
  return byPopular.slice(0, count).map((p) => p.name);
}

// «στις Κυκλάδες», «στον Σαρωνικό»· για περιοχή χωρίς καταχώριση, ουδέτερο.
export function regionIn(regionName) {
  return REGION_INFO[regionName]?.in || `στην περιοχή ${regionName}`;
}

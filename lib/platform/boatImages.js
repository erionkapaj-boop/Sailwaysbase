// Εικόνα μοντέλου από τον κατάλογο (data/): κάθε μοντέλο έχει μια ενδεικτική εικόνα AI
// (public/boats/, 9 κοινές εικόνες ανά τύπο/μέγεθος). Δεν απεικονίζει το συγκεκριμένο
// μοντέλο, γι' αυτό η εμφάνισή της συνοδεύεται πάντα από την ένδειξη «Ενδεικτική εικόνα AI».
// Δική του φωτογραφία ανά μοντέλο (που θα ανεβάζει ο διαχειριστής) υπερισχύει όταν υπάρχει.
import { findModel, imageFileOfGroup } from "./boatCatalog.js";

// Φωτογραφίες ανά μοντέλο («πλήρες όνομα»: διαδρομή). Άδειο προς το παρόν.
export const BOAT_PHOTOS = {};

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

// boatImage("Bavaria", "Cruiser 46") ή boatImage("Bavaria Cruiser 46")
// → { src, illustrative } ή null.
export function boatImage(brandOrFullName, model) {
  const name = model === undefined ? brandOrFullName : `${brandOrFullName} ${model}`;
  const own = BOAT_PHOTOS[norm(name)];
  if (own) return { src: own, illustrative: false };
  const hit = findModel(brandOrFullName, model);
  const file = hit && imageFileOfGroup(hit.group);
  return file ? { src: `/boats/${file}`, illustrative: true } : null;
}

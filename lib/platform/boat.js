// Στοιχεία σκάφους σε αίτημα ή κράτηση (0127): μοντέλο, μήκος σε πόδια, έτος.
// Επιστρέφει τα κομμάτια που υπάρχουν, για εμφάνιση σε μία γραμμή.
//   boatParts({ boat_model: "Lagoon 42", boat_length_ft: 42, boat_year: 2019 })
//   → ["Lagoon 42", "2019"]  (τα 42 ft υπάρχουν ήδη στο όνομα)
//   boatParts({ boat_model: "Jeanneau 349", boat_length_ft: 35, boat_year: 2019 }) → ["Jeanneau 349", "35 ft", "2019"]
// Τα πόδια δεν επαναλαμβάνονται όταν το όνομα του μοντέλου ήδη τα περιέχει («Bavaria 46» και 46 → «Bavaria 46 · 2022»).
export function boatParts(r) {
  if (!r) return [];
  const model = r.boat_model || "";
  const feet = r.boat_length_ft;
  const feetInName = feet && new RegExp(`(^|[^0-9])${feet}([^0-9]|$)`).test(model);
  return [model, feet && !feetInName ? `${feet} ft` : "", r.boat_year ? String(r.boat_year) : ""].filter(Boolean);
}

export const boatLine = (r) => boatParts(r).join(" · ");

// Ίδια όρια με τη βάση (check_boat_details). Επιστρέφει true όταν οι τιμές είναι δεκτές.
export function boatValid({ model, lengthFt, year } = {}) {
  if (model && model.trim().length > 60) return false;
  if (lengthFt && !(Number(lengthFt) >= 10 && Number(lengthFt) <= 300)) return false;
  if (year && !(Number(year) >= 1900 && Number(year) <= 2100)) return false;
  return true;
}

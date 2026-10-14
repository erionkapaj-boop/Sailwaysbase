// Στοιχεία σκάφους σε αίτημα ή κράτηση (0127): μοντέλο, μήκος σε πόδια, έτος.
// Επιστρέφει τα κομμάτια που υπάρχουν, για εμφάνιση σε μία γραμμή.
//   boatParts({ boat_model: "Lagoon 42", boat_length_ft: 42, boat_year: 2019 })
//   → ["Lagoon 42", "42 ft", "2019"]
export function boatParts(r) {
  if (!r) return [];
  return [r.boat_model, r.boat_length_ft ? `${r.boat_length_ft} ft` : "", r.boat_year ? String(r.boat_year) : ""].filter(Boolean);
}

export const boatLine = (r) => boatParts(r).join(" · ");

// Ίδια όρια με τη βάση (check_boat_details). Επιστρέφει true όταν οι τιμές είναι δεκτές.
export function boatValid({ model, lengthFt, year } = {}) {
  if (model && model.trim().length > 60) return false;
  if (lengthFt && !(Number(lengthFt) >= 10 && Number(lengthFt) <= 300)) return false;
  if (year && !(Number(year) >= 1900 && Number(year) <= 2100)) return false;
  return true;
}

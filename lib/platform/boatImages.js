// Φωτογραφίες σκαφών ανά μοντέλο/μάρκα. Προς το παρόν άδειο: ό,τι λείπει δείχνει τη
// σχηματική εικόνα του τύπου. Για να μπει φωτογραφία: βάλε το αρχείο στο public/boats/ και
// πρόσθεσε μια γραμμή εδώ. Κλειδί: «μάρκα μοντέλο» ή μόνο «μάρκα», πεζά, χωρίς σημεία στίξης.
//   "bavaria cruiser 46": "/boats/bavaria-cruiser-46.jpg",
//   "lagoon": "/boats/lagoon.jpg",
export const BOAT_IMAGES = {};

const key = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.\s]+/g, " ").replace(/\s+/g, " ").trim();

// Πρώτα το μοντέλο, μετά η μάρκα· null αν δεν υπάρχει φωτογραφία.
export function boatImage(brand, model) {
  const full = key(`${brand} ${model}`);
  const m = key(model);
  return BOAT_IMAGES[full] || BOAT_IMAGES[m] || BOAT_IMAGES[key(brand)] || null;
}

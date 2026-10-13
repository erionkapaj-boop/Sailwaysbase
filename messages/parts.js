// Τα μηνύματα χωρισμένα σε αρχεία ανά περιοχή (messages/<γλώσσα>/<μέρος>.json).
// Κάθε μέρος έχει δικά του namespaces· δύο μέρη δεν μοιράζονται namespace
// (το ελέγχει το scripts/check-i18n.mjs). Νέο μέρος = μία γραμμή εδώ + ένα
// αρχείο σε κάθε γλώσσα.
export const PARTS = ["core", "auth", "search", "delivery", "account", "system", "adminHome", "adminUsers", "adminOps", "adminLib", "board"];

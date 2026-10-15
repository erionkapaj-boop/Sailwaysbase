// Φίλτρο γλωσσών της αναζήτησης: ο επαγγελματίας μένει αν μιλά ΤΟΥΛΑΧΙΣΤΟΝ μία από τις
// επιλεγμένες γλώσσες. Καμία επιλεγμένη = όλοι. row.languages: ονόματα γλωσσών (πίνακας).
export function parseLanguageIds(value) {
  return String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
}

export function speaksAny(rows, names) {
  const wanted = new Set(names || []);
  if (!wanted.size) return rows;
  return rows.filter((r) => (r.languages || []).some((n) => wanted.has(n)));
}

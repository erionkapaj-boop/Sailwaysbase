// Ελληνικά → λατινικά, με το πρότυπο των διαβατηρίων (ΕΛΟΤ 743, τύπος 2).
// «Γιώργος Παπαδόπουλος» → «Giorgos Papadopoulos».
//
// Χρησιμεύει στα ονόματα που βλέπει όποιος διαβάζει την πλατφόρμα σε άλλη
// γλώσσα (docs/I18N.md). Το ίδιο ακριβώς κάνει και η συνάρτηση greek_to_latin
// της βάσης (0123)· και οι δύο δοκιμάζονται με τα ίδια παραδείγματα
// (tests/fixtures/translit.json), ώστε να μην αποκλίνουν ποτέ.
//
// Κανόνες που μετρούν:
//  · αυ ευ ηυ → av ev iv πριν από φωνήεν ή ηχηρό σύμφωνο (β γ δ ζ λ μ ν ρ),
//    af ef if πριν από άηχο (θ κ ξ π σ τ φ χ ψ) ή στο τέλος λέξης· ay ey iy αν το
//    φωνήεν πριν το υ έχει τόνο ή το υ διαλυτικά·
//  · ου → ou · γγ γξ γχ → ng nx nch · μπ → b στην αρχή ή στο τέλος λέξης, αλλιώς mp
//  · θ → th, χ → ch, ψ → ps · τόνοι και διαλυτικά αφαιρούνται
//  · ό,τι δεν είναι ελληνικό (λατινικά, αριθμοί, παύλες) μένει όπως είναι.

const SINGLE = {
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m",
  ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
};
const VOICELESS = new Set(["θ", "κ", "ξ", "π", "σ", "ς", "τ", "φ", "χ", "ψ"]);
const GREEK_BLOCK = /[Ͱ-Ͽἀ-῿]/;
const MARKS = /[̀-ͯ]/;
const ACCENTS = /[̀́͂̓̔]/;

function tokens(text) {
  const out = [];
  for (const ch of String(text ?? "").normalize("NFD")) {
    if (MARKS.test(ch)) {
      // Σημάδι χωρίς γράμμα πριν από αυτό (αρχή κειμένου): αγνοείται, όπως και στη βάση.
      if (out.length) out[out.length - 1].marks += ch;
    } else out.push({ base: ch, marks: "" });
  }
  return out.map((t) => ({
    ...t,
    greek: GREEK_BLOCK.test(t.base),
    lower: t.base.toLowerCase(),
    upper: t.base !== t.base.toLowerCase(),
    accent: ACCENTS.test(t.marks),
    dialytika: t.marks.includes("̈"),
  }));
}

function cased(out, srcUpper, allUpper) {
  if (!srcUpper) return out;
  return allUpper ? out.toUpperCase() : out[0].toUpperCase() + out.slice(1);
}

export function greekToLatin(text) {
  const t = tokens(text);
  const n = t.length;
  const isLetter = (i) => i >= 0 && i < n && t[i].greek;
  let out = "";
  for (let i = 0; i < n; i += 1) {
    const c = t[i];
    if (!c.greek) {
      out += (c.base + c.marks).normalize("NFC");
      continue;
    }
    const next = isLetter(i + 1) ? t[i + 1] : null;
    const after = isLetter(i + 2) ? t[i + 2] : null;
    // Κεφαλαία: πολλά γράμματα στην έξοδο (th, ch, ps, ou…) μένουν κεφαλαία μόνο αν
    // και το επόμενο γράμμα της λέξης είναι κεφαλαίο (ΘΩΜΑΣ → THOMAS, Θωμάς → Thomas).
    const upperNext = (j) => (isLetter(j) ? t[j].upper : false);

    // αυ ευ ηυ
    if ((c.lower === "α" || c.lower === "ε" || c.lower === "η") && next && next.lower === "υ") {
      const vowel = SINGLE[c.lower];
      let end;
      if (c.accent || next.dialytika) end = "y";
      else if (!after || VOICELESS.has(after.lower)) end = "f";
      else end = "v";
      out += cased(vowel + end, c.upper, next.upper);
      i += 1;
      continue;
    }
    // ου
    if (c.lower === "ο" && next && next.lower === "υ") {
      out += cased("ou", c.upper, next.upper);
      i += 1;
      continue;
    }
    // γγ γξ γχ: το πρώτο γ είναι n
    if (c.lower === "γ" && next && (next.lower === "γ" || next.lower === "ξ" || next.lower === "χ")) {
      out += cased("n", c.upper, false);
      continue;
    }
    // μπ
    if (c.lower === "μ" && next && next.lower === "π") {
      const wordStart = !isLetter(i - 1);
      const wordEnd = !after;
      if (wordStart || wordEnd) {
        out += cased("b", c.upper, false);
        i += 1;
        continue;
      }
    }
    const mapped = SINGLE[c.lower];
    if (mapped === undefined) {
      out += (c.base + c.marks).normalize("NFC");
      continue;
    }
    out += cased(mapped, c.upper, mapped.length > 1 && upperNext(i + 1));
  }
  return out;
}

// Μόνο όταν το όνομα έχει ελληνικά γράμματα. Αλλιώς μένει όπως γράφτηκε.
export function hasGreek(text) {
  return GREEK_BLOCK.test(String(text ?? ""));
}

export function latinName(text) {
  return hasGreek(text) ? greekToLatin(text) : String(text ?? "");
}

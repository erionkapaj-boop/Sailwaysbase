// Εύρεση μέρους με ορθογραφικά λάθη: ό,τι θα έγραφε ένας πραγματικός πελάτης.
// Κάθε γραμμή: [τι έγραψε, τι ήθελε]. Το σωστό πρέπει να είναι στις 3 πρώτες
// επιλογές (και πρώτο στις περισσότερες). Τρέχει με: node tests/unit/placeSearch.test.mjs
import { buildPlaceIndex, searchPlaces, phoneticKey, editDistance, describeChoice, pointFor, pointOf, suggestedPlaces } from "../../lib/platform/placeSearch.js";
import { PLACES, REGION_INFO } from "../../lib/platform/places.js";

// Οι περιοχές που έχουν επαγγελματίες στη βάση (οι υπόλοιπες δεν καλύπτονται ακόμα).
const COVERED = ["Σαρωνικός", "Κυκλάδες", "Ιόνιο", "Δωδεκάνησα", "Σποράδες", "Κρήτη"];
const regions = COVERED.map((name, i) => ({ id: `r${i}`, name }));
const index = buildPlaceIndex(regions);

const CASES = [
  // Αθήνα και λιμάνια
  ["αθηνα", "Αθήνα"], ["athens", "Αθήνα"], ["athina", "Αθήνα"], ["αθινα", "Αθήνα"], ["ΑΘΗΝΑ", "Αθήνα"],
  ["αλιμος", "Άλιμος"], ["Alimos", "Άλιμος"], ["αλημος", "Άλιμος"], ["alimoss", "Άλιμος"], ["αλιμο", "Άλιμος"], ["καλαμακι", "Άλιμος"],
  ["λαυριο", "Λαύριο"], ["lavrio", "Λαύριο"], ["λαβριο", "Λαύριο"], ["lavrion", "Λαύριο"], ["λαυρειο", "Λαύριο"],
  ["πειραιας", "Πειραιάς"], ["peiraias", "Πειραιάς"], ["piraeus", "Πειραιάς"], ["πηραιας", "Πειραιάς"], ["πειρεας", "Πειραιάς"],
  ["γλυφαδα", "Γλυφάδα"], ["glifada", "Γλυφάδα"], ["γληφαδα", "Γλυφάδα"],
  ["φλοισβος", "Φλοίσβος"], ["flisvos", "Φλοίσβος"], ["φλυσβος", "Φλοίσβος"],
  ["αιγινα", "Αίγινα"], ["egina", "Αίγινα"], ["aegina", "Αίγινα"], ["εγινα", "Αίγινα"],
  ["υδρα", "Ύδρα"], ["idra", "Ύδρα"], ["hydra", "Ύδρα"], ["ηδρα", "Ύδρα"],
  ["σπετσες", "Σπέτσες"], ["spetses", "Σπέτσες"], ["σπετσεσ", "Σπέτσες"],
  ["portoheli", "Πόρτο Χέλι"], ["πορτο χελι", "Πόρτο Χέλι"],
  // Κυκλάδες
  ["παρος", "Πάρος"], ["paros", "Πάρος"], ["πάρωσ", "Πάρος"], ["Paross", "Πάρος"], ["παροσ", "Πάρος"],
  ["μυκονος", "Μύκονος"], ["mikonos", "Μύκονος"], ["mykonos", "Μύκονος"], ["μηκονος", "Μύκονος"], ["μικονοσ", "Μύκονος"],
  ["σαντορινη", "Σαντορίνη"], ["santorini", "Σαντορίνη"], ["σαντορήνη", "Σαντορίνη"], ["santorinni", "Σαντορίνη"], ["σαντορηνι", "Σαντορίνη"], ["thira", "Σαντορίνη"], ["θηρα", "Σαντορίνη"],
  ["νάξος", "Νάξος"], ["naxos", "Νάξος"], ["ναξωσ", "Νάξος"], ["ναξο", "Νάξος"],
  ["μηλος", "Μήλος"], ["milos", "Μήλος"], ["μιλοσ", "Μήλος"],
  ["συρος", "Σύρος"], ["siros", "Σύρος"], ["ερμουπολη", "Ερμούπολη"], ["ermoupolis", "Ερμούπολη"],
  ["ναουσα", "Νάουσα"], ["naousa", "Νάουσα"], ["naoussa", "Νάουσα"], ["νααουσα", "Νάουσα"],
  ["τζια", "Κέα"], ["kea", "Κέα"], ["κουφονησια", "Κουφονήσι"], ["koufonisi", "Κουφονήσι"],
  ["φολεγανδρος", "Φολέγανδρος"], ["folegandros", "Φολέγανδρος"], ["αμοργος", "Αμοργός"],
  // Ιόνιο
  ["κερκυρα", "Κέρκυρα"], ["corfu", "Κέρκυρα"], ["kerkira", "Κέρκυρα"], ["κέρκηρα", "Κέρκυρα"], ["γουβια", "Gouvia Marina"], ["gouvia", "Gouvia Marina"],
  ["λευκαδα", "Λευκάδα"], ["lefkada", "Λευκάδα"], ["lefkas", "Λευκάδα"], ["λεφκαδα", "Λευκάδα"], ["νυδρι", "Νυδρί"], ["nidri", "Νυδρί"],
  ["ζακυνθος", "Ζάκυνθος"], ["zante", "Ζάκυνθος"], ["zakinthos", "Ζάκυνθος"], ["ζακηνθος", "Ζάκυνθος"],
  ["κεφαλονια", "Κεφαλονιά"], ["kefalonia", "Κεφαλονιά"], ["cefalonia", "Κεφαλονιά"], ["κεφαλωνια", "Κεφαλονιά"], ["argostoli", "Αργοστόλι"], ["fiskardo", "Φισκάρδο"],
  ["ιθακη", "Ιθάκη"], ["ithaca", "Ιθάκη"], ["ithaki", "Ιθάκη"], ["παξοι", "Παξοί"], ["paxos", "Παξοί"],
  ["πρεβεζα", "Πρέβεζα"], ["preveza", "Πρέβεζα"], ["παργα", "Πάργα"],
  // Δωδεκάνησα
  ["ροδος", "Ρόδος"], ["rodos", "Ρόδος"], ["rhodes", "Ρόδος"], ["ρωδος", "Ρόδος"],
  ["κοσ", "Κως"], ["kos", "Κως"], ["κως", "Κως"],
  ["συμη", "Σύμη"], ["symi", "Σύμη"], ["πατμος", "Πάτμος"], ["λερος", "Λέρος"], ["καλυμνος", "Κάλυμνος"], ["kalimnos", "Κάλυμνος"],
  // Σποράδες
  ["σκιαθος", "Σκιάθος"], ["skiathos", "Σκιάθος"], ["σκιαθοσ", "Σκιάθος"], ["skiatos", "Σκιάθος"],
  ["βολος", "Βόλος"], ["volos", "Βόλος"], ["σκοπελος", "Σκόπελος"], ["alonissos", "Αλόννησος"], ["αλονησος", "Αλόννησος"],
  // Κρήτη
  ["ηρακλειο", "Ηράκλειο"], ["iraklio", "Ηράκλειο"], ["heraklion", "Ηράκλειο"], ["ηρακλιο", "Ηράκλειο"],
  ["χανια", "Χανιά"], ["hania", "Χανιά"], ["chania", "Χανιά"], ["χανηα", "Χανιά"], ["xania", "Χανιά"],
  ["αγιος νικολαος", "Άγιος Νικόλαος"], ["agios nikolaos", "Άγιος Νικόλαος"], ["νικολαος", "Άγιος Νικόλαος"], ["ρεθυμνο", "Ρέθυμνο"],
  // Περιοχές και χώρα
  ["κυκλαδες", "Κυκλάδες"], ["cyclades", "Κυκλάδες"], ["κικλαδες", "Κυκλάδες"], ["ιονιο", "Ιόνιο"], ["ionian", "Ιόνιο"],
  ["σαρωνικος", "Σαρωνικός"], ["saronic", "Σαρωνικός"], ["αργοσαρωνικος", "Σαρωνικός"], ["δωδεκανησα", "Δωδεκάνησα"], ["dodecanese", "Δωδεκάνησα"],
  ["σποραδες", "Σποράδες"], ["sporades", "Σποράδες"], ["κρητη", "Κρήτη"], ["crete", "Κρήτη"],
  ["ελλαδα", "Ελλάδα"], ["greece", "Ελλάδα"],
  // Πόλεις που ζήτησε ο ιδιοκτήτης να βρίσκονται
  ["καλαματα", "Καλαμάτα"], ["kalamata", "Καλαμάτα"], ["καλαματτα", "Καλαμάτα"],
  ["πατρα", "Πάτρα"], ["patras", "Πάτρα"], ["πατρα", "Πάτρα"], ["πάτρας", "Πάτρα"],
  ["θεσσαλονικη", "Θεσσαλονίκη"], ["thessaloniki", "Θεσσαλονίκη"], ["σαλονικη", "Θεσσαλονίκη"], ["θεσαλονικη", "Θεσσαλονίκη"], ["salonica", "Θεσσαλονίκη"],
  ["χαλκιδικη", "Χαλκιδική"], ["halkidiki", "Χαλκιδική"], ["καβαλα", "Καβάλα"], ["λεσβοσ", "Λέσβος"], ["lesvos", "Λέσβος"], ["μυτιληνη", "Μυτιλήνη"],
  ["σαλαμινα", "Σαλαμίνα"], ["salamis", "Σαλαμίνα"], ["ναυπλιο", "Ναύπλιο"], ["nafplio", "Ναύπλιο"], ["ραφηνα", "Ραφήνα"], ["rafina", "Ραφήνα"],
  // Από τον έλεγχο κάλυψης (docs/PORTS_AUDIT.md)
  ["μαρμαρι", "Μαρμάρι"], ["νεα στυρα", "Νέα Στύρα"], ["λιμνη", "Λίμνη"], ["ωρεοι", "Ωρεοί"], ["orei", "Ωρεοί"],
  ["olympic marine", "Λαύριο"], ["lefkas marina", "Λευκάδα"], ["λουτρακι", "Λουτράκι"], ["κιατο", "Κιάτο"], ["τριζονια", "Τριζόνια"],
  ["κατακολο", "Κατάκολο"], ["katakolon", "Κατάκολο"], ["πορτο καγιο", "Πόρτο Κάγιο"], ["καψαλι", "Καψάλι"], ["λερος αγια μαρινα", "Αγία Μαρίνα"],
  ["partheni", "Παρθένι"], ["ψεριμος", "Ψέριμος"], ["αγια γαληνη", "Αγία Γαλήνη"], ["γαυδος", "Γαύδος"], ["πορτο κουφο", "Πόρτο Κουφό"],
  ["aretsou", "Μαρίνα Αρετσού"], ["πυθαγορειο", "Πυθαγόρειο"], ["μολυβος", "Μόλυβος"], ["μυρινα", "Μύρινα"], ["αχιλλειο", "Αχίλλειο"],
  ["ηγουμενιτσα", "Ηγουμενίτσα"], ["igoumenitsa", "Ηγουμενίτσα"], ["χιοσ", "Χίος"], ["σαμοσ", "Σάμος"], ["ικαρια", "Ικαρία"],
  // Όσο γράφει
  ["σαντ", "Σαντορίνη"], ["μυκο", "Μύκονος"], ["κεφαλ", "Κεφαλονιά"], ["λευκ", "Λευκάδα"],
];

// Ό,τι ΔΕΝ πρέπει να ταιριάζει με κάτι τυχαίο.
const NOTHING = ["xyzqw", "ασδφγ", "12345", "πλατεια συνταγματος"];

let top1 = 0;
let top3 = 0;
const failures = [];
for (const [q, want] of CASES) {
  const names = searchPlaces(index, q, 5).map((e) => e.name);
  if (names[0] === want) top1++;
  else if (process.env.SHOW) console.log("δεν είναι πρώτο:", q, "→", names.join(", "), "| ήθελε", want);
  if (names.slice(0, 3).includes(want)) top3++;
  else failures.push(`«${q}» → ${names.join(", ") || "—"} (ήθελε ${want})`);
}
for (const q of NOTHING) {
  const names = searchPlaces(index, q, 5).map((e) => e.name);
  if (names.length) failures.push(`«${q}» δεν έπρεπε να ταιριάξει → ${names.join(", ")}`);
}

// Ο «Πόρος» και η «Πάρος» διαφέρουν κατά ένα γράμμα: και τα δύο πρέπει να φαίνονται.
const both = searchPlaces(index, "ποροσ", 5).map((e) => e.name);
if (!(both.includes("Πόρος") && both.includes("Πάρος"))) failures.push(`«ποροσ» πρέπει να δείχνει Πόρο και Πάρο → ${both.join(", ")}`);
if (both[0] !== "Πόρος") failures.push(`«ποροσ» → πρώτο πρέπει να είναι ο Πόρος → ${both.join(", ")}`);

// Κάθε μέρος έχει γνωστή περιοχή και βρίσκεται με το ίδιο του το όνομα.
for (const p of PLACES) {
  if (!REGION_INFO[p.region]) failures.push(`${p.name}: άγνωστη περιοχή ${p.region}`);
  // Λιμάνι νησιού: βρίσκεται με «Νησί Λιμάνι» (το «Βαθύ» υπάρχει σε πολλά νησιά).
  const queries = p.child ? [`${p.parent} ${p.name}`] : [p.name, p.en].filter(Boolean);
  for (const n of queries) {
    const got = searchPlaces(index, n, 3).map((e) => (e.child ? `${e.parent}–${e.name}` : e.name));
    const want = p.child ? `${p.parent}–${p.name}` : p.name;
    if (!got.includes(want) && !p.aka?.includes(n)) failures.push(`«${n}» δεν βρίσκει το ${want} → ${got.join(", ")}`);
  }
}
// Κάθε όνομα μία φορά ανά περιοχή (τα λιμάνια νησιών ξεχωρίζουν με το νησί τους).
const ids = PLACES.map((p) => `${p.region}|${p.parent || ""}|${p.name}`);
const dup = ids.filter((k, i) => ids.indexOf(k) !== i);
if (dup.length) failures.push(`διπλά μέρη στο λεξικό: ${dup.join(", ")}`);
const standalone = PLACES.filter((p) => !p.child).map((p) => phoneticKey(p.name));
const dupStandalone = standalone.filter((k, i) => standalone.indexOf(k) !== i);
if (dupStandalone.length) failures.push(`ίδια προφορά σε δύο μέρη (ενοποίησέ τα): ${dupStandalone.join(", ")}`);
// Ίδιο λιμάνι με δύο γραφές, π.χ. «Κουφονήσι» / «Κουφονήσια»: ενοποιείται.
// Πραγματικά διαφορετικά μέρη με σχεδόν ίδιο όνομα.
const DIFFERENT = [["Ηρακλειά", "Ηράκλειο"], ["Καστός", "Κάσος"], ["Ηρακλειά", "Ηρακλείτσα"], ["Κυπαρίσσι", "Κυπαρισσία"], ["Λιμένι", "Λίμνη"]];
const names = PLACES.filter((p) => !p.child).map((p) => [phoneticKey(p.name), p.name]);
for (let i = 0; i < names.length; i++)
  for (let j = i + 1; j < names.length; j++)
    if (names[i][0].length > 5 && editDistance(names[i][0], names[j][0]) <= 1 && !DIFFERENT.some(([a, b]) => [a, b].sort().join() === [names[i][1], names[j][1]].sort().join()))
      failures.push(`σχεδόν ίδια ονόματα: ${names[i][1]} / ${names[j][1]}`);

// Μια αποθηκευμένη επιλογή ξαναδιαβάζεται όπως επιλέχτηκε.
const cyc = regions.find((r) => r.name === "Κυκλάδες").id;
const paros = index.find((e) => e.name === "Πάρος");
const choices = [
  [{ regionId: "", point: "" }, "empty"],
  [{ regionId: cyc, point: "Πάρος" }, "place:Πάρος:"],
  [{ regionId: cyc, point: pointFor(paros, "Νάουσα") }, "place:Πάρος:Νάουσα"],
  [{ regionId: cyc, point: "Κυκλάδες" }, "region"],
  [{ regionId: cyc, point: "" }, "region"],
  [{ regionId: cyc, point: "Ψαθή" }, "custom:Ψαθή"],
  [{ regionId: cyc, point: "Ραφήνα" }, "custom:Ραφήνα"], // μέρος άλλης περιοχής = κείμενο
  [{ regionId: cyc, point: "Άλιμος (Πάρος)" }, "custom:Άλιμος (Πάρος)"], // λιμάνι που δεν ανήκει εκεί
];
for (const [v, want] of choices) {
  const c = describeChoice(index, v);
  const got = c.kind === "place" ? `place:${c.entry.name}:${c.port || ""}` : c.kind === "custom" ? `custom:${c.text}` : c.kind;
  if (got !== want) failures.push(`describeChoice(${JSON.stringify(v.point)}) → ${got} (ήθελε ${want})`);
}

// Κάθε μέρος έχει γεωγραφική περιοχή· όπου η περιοχή έχει επαγγελματίες, έχει και id.
for (const e of index.filter((x) => x.type === "place")) {
  if (e.covered !== COVERED.includes(e.regionName)) failures.push(`${e.name}: covered=${e.covered} αλλά περιοχή ${e.regionName}`);
  if (e.covered && !e.regionId) failures.push(`${e.name}: καλυμμένη περιοχή χωρίς id`);
}
const thess = index.find((e) => e.name === "Θεσσαλονίκη");
if (!thess || thess.covered || !thess.near.some((n) => n.name === "Σποράδες")) failures.push("Θεσσαλονίκη: πρέπει να είναι εκτός κάλυψης με κοντινή περιοχή τις Σποράδες");
const kal = index.find((e) => e.name === "Καλαμάτα");
if (!kal?.covered || kal.regionName !== "Ιόνιο") failures.push("Καλαμάτα → Ιόνιο");

// Βασικά λιμάνια = η λίστα του ιδιοκτήτη (gr.ports.js), με τη σειρά της.
const suggested = suggestedPlaces(index, "GR").map((e) => [e.child ? `${e.parent} – ${e.name}` : e.name, e.regionName]);
const BASES = [["Άλιμος", "Σαρωνικός"], ["Λαύριο", "Σαρωνικός"], ["Λευκάδα", "Ιόνιο"], ["Πρέβεζα", "Ιόνιο"], ["Κέρκυρα – Gouvia Marina", "Ιόνιο"], ["Κως", "Δωδεκάνησα"], ["Ρόδος", "Δωδεκάνησα"], ["Σκιάθος", "Σποράδες"], ["Βόλος", "Σποράδες"], ["Πάρος", "Κυκλάδες"], ["Μύκονος", "Κυκλάδες"], ["Ζάκυνθος", "Ιόνιο"]];
if (JSON.stringify(suggested) !== JSON.stringify(BASES)) failures.push(`βασικά λιμάνια: ${suggested.map((b) => b.join("—")).join(", ")}`);

// Λιμάνια που υπάρχουν σε πολλά νησιά ξεχωρίζουν, και το σημείο αναχώρησης τα ξαναδιαβάζει σωστά.
const vathy = searchPlaces(index, "βαθυ", 8).filter((e) => e.name === "Βαθύ").map((e) => e.parent).sort().join(",");
if (vathy !== "Αστυπάλαια,Ιθάκη,Κάλυμνος,Μέθανα,Μεγανήσι,Σάμος,Σίφνος") failures.push(`«Βαθύ» σε: ${vathy}`);
const ithaca = searchPlaces(index, "ithaki vathy", 1)[0];
if (!(ithaca?.parent === "Ιθάκη" && ithaca.name === "Βαθύ")) failures.push("«ithaki vathy» → Ιθάκη – Βαθύ");
const ion = regions.find((r) => r.name === "Ιόνιο").id;
const back = describeChoice(index, { regionId: ion, point: pointOf(ithaca) });
if (!(back.kind === "place" && back.entry.name === "Ιθάκη" && back.port === "Βαθύ")) failures.push(`σημείο «${pointOf(ithaca)}» δεν ξαναδιαβάζεται`);
const naoussa = searchPlaces(index, "naousa", 1)[0];
if (pointOf(naoussa) !== "Νάουσα (Πάρος)") failures.push(`Νάουσα → ${pointOf(naoussa)}`);

const pct = (n) => Math.round((100 * n) / CASES.length);
console.log(`δοκιμές: ${CASES.length} · σωστό πρώτο: ${top1} (${pct(top1)}%) · στις 3 πρώτες: ${top3} (${pct(top3)}%)`);
// Όριο: όλα στις 3 πρώτες, και τουλάχιστον 95% πρώτο.
if (pct(top1) < 95) failures.push(`σωστό πρώτο κάτω από 95% (${pct(top1)}%)`);
if (failures.length) {
  console.log("FAIL\n" + failures.join("\n"));
  process.exit(1);
}
console.log("ok   εύρεση μέρους με λάθη γραφής");

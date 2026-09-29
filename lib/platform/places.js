// Λεξικό μερών: ό,τι μπορεί να γράψει ένας πελάτης για το πού ξεκινά το
// ταξίδι του (νησί, πόλη, λιμάνι), με την περιοχή στην οποία ανήκει.
//
// Ο πελάτης δεν χρειάζεται να ξέρει τις περιοχές: γράφει «Πάρος» και η
// περιοχή (Κυκλάδες) προκύπτει από εδώ. Οι επαγγελματίες συνεχίζουν να
// δηλώνουν περιοχές· το λεξικό είναι η γέφυρα ανάμεσα στα δύο.
//
// Πεδία:
//   name      όνομα όπως εμφανίζεται
//   en        αγγλικό όνομα (και ό,τι γράφεται με λατινικούς)
//   aka       άλλα ονόματα και συνηθισμένες γραφές (π.χ. Zante, Τζια)
//   region    όνομα περιοχής, ίδιο με τον πίνακα regions
//   kind      island | town | port
//   ports     λιμάνια/μαρίνες του μέρους (προαιρετικό)· αν λείπει, το ίδιο
//             το μέρος είναι το σημείο αναχώρησης
//   popular   σειρά στις γρήγορες επιλογές (μικρότερο = πρώτο)
//
// Νέο μέρος ή νέα γραφή: μία γραμμή εδώ (και τεστ στο tests/unit). Τα μέρη
// που έψαξαν πελάτες και δεν βρέθηκαν φαίνονται στη διαχείριση (Υγεία
// εφαρμογής → Μέρη που δεν βρέθηκαν).

export const COUNTRIES = [{ code: "GR", name: "Ελλάδα", en: "Greece", aka: ["Hellas", "Ellada"] }];

// Περιοχές: ίδια ονόματα με τον πίνακα regions. Χώρα, «στην/στις …» για τα
// κείμενα, αγγλικό όνομα, άλλα ονόματα και σειρά εμφάνισης.
export const REGION_INFO = {
  Σαρωνικός: { country: "GR", in: "στον Σαρωνικό", en: "Saronic Gulf", aka: ["Αργοσαρωνικός", "Argosaronic", "Saronikos", "Αττική", "Attica"], order: 1 },
  Κυκλάδες: { country: "GR", in: "στις Κυκλάδες", en: "Cyclades", aka: ["Kyklades", "Cyclades islands"], order: 2 },
  Ιόνιο: { country: "GR", in: "στο Ιόνιο", en: "Ionian", aka: ["Ιόνια νησιά", "Ionian islands", "Ionio"], order: 3 },
  Δωδεκάνησα: { country: "GR", in: "στα Δωδεκάνησα", en: "Dodecanese", aka: ["Dodekanisa", "Dodecanese islands"], order: 4 },
  Σποράδες: { country: "GR", in: "στις Σποράδες", en: "Sporades", aka: ["Sporades islands", "Pagasitikos", "Παγασητικός"], order: 5 },
  Κρήτη: { country: "GR", in: "στην Κρήτη", en: "Crete", aka: ["Kriti", "Creta"], order: 6 },
};

export const PLACES = [
  // ---- Σαρωνικός (και Αθήνα) ----
  { name: "Αθήνα", en: "Athens", aka: ["Athina", "Athena", "Αθηνα"], region: "Σαρωνικός", kind: "town", ports: ["Άλιμος", "Άγιος Κοσμάς", "Λαύριο"], popular: 1 },
  { name: "Άλιμος", en: "Alimos", aka: ["Kalamaki", "Καλαμάκι", "Alimos marina"], region: "Σαρωνικός", kind: "port" },
  { name: "Άγιος Κοσμάς", en: "Agios Kosmas", aka: ["Ag. Kosmas", "Ellinikon"], region: "Σαρωνικός", kind: "port" },
  { name: "Λαύριο", en: "Lavrio", aka: ["Lavrion", "Laurium"], region: "Σαρωνικός", kind: "port", popular: 2 },
  { name: "Πειραιάς", en: "Piraeus", aka: ["Pireas", "Peiraias", "Zea", "Ζέα", "Μαρίνα Ζέας"], region: "Σαρωνικός", kind: "port" },
  { name: "Φλοίσβος", en: "Flisvos", aka: ["Flisvos marina", "Παλαιό Φάληρο", "Faliro"], region: "Σαρωνικός", kind: "port" },
  { name: "Γλυφάδα", en: "Glyfada", aka: ["Glifada"], region: "Σαρωνικός", kind: "port" },
  { name: "Βουλιαγμένη", en: "Vouliagmeni", aka: [], region: "Σαρωνικός", kind: "port" },
  { name: "Αίγινα", en: "Aegina", aka: ["Egina", "Aigina"], region: "Σαρωνικός", kind: "island", popular: 12 },
  { name: "Αγκίστρι", en: "Agistri", aka: ["Angistri"], region: "Σαρωνικός", kind: "island" },
  { name: "Σαλαμίνα", en: "Salamina", aka: ["Salamis"], region: "Σαρωνικός", kind: "island" },
  { name: "Πόρος", en: "Poros", aka: [], region: "Σαρωνικός", kind: "island", popular: 21 },
  { name: "Ύδρα", en: "Hydra", aka: ["Idra", "Ydra"], region: "Σαρωνικός", kind: "island", popular: 13 },
  { name: "Σπέτσες", en: "Spetses", aka: ["Spetsai"], region: "Σαρωνικός", kind: "island", popular: 20 },
  { name: "Μέθανα", en: "Methana", aka: [], region: "Σαρωνικός", kind: "town" },
  { name: "Ερμιόνη", en: "Ermioni", aka: [], region: "Σαρωνικός", kind: "town" },
  { name: "Πόρτο Χέλι", en: "Porto Heli", aka: ["Porto Cheli", "Portoheli"], region: "Σαρωνικός", kind: "town" },
  { name: "Ναύπλιο", en: "Nafplio", aka: ["Nauplia", "Nafplion"], region: "Σαρωνικός", kind: "town" },
  { name: "Επίδαυρος", en: "Epidavros", aka: ["Epidaurus"], region: "Σαρωνικός", kind: "town" },
  { name: "Σούνιο", en: "Sounio", aka: ["Sounion"], region: "Σαρωνικός", kind: "town" },

  // ---- Κυκλάδες ----
  { name: "Πάρος", en: "Paros", aka: [], region: "Κυκλάδες", kind: "island", ports: ["Παροικιά", "Νάουσα", "Πίσω Λιβάδι"], popular: 3 },
  { name: "Νάουσα", en: "Naoussa", aka: ["Naousa"], region: "Κυκλάδες", kind: "port" },
  { name: "Παροικιά", en: "Parikia", aka: ["Paroikia"], region: "Κυκλάδες", kind: "port" },
  { name: "Αντίπαρος", en: "Antiparos", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Νάξος", en: "Naxos", aka: [], region: "Κυκλάδες", kind: "island", popular: 11 },
  { name: "Μύκονος", en: "Mykonos", aka: ["Mikonos"], region: "Κυκλάδες", kind: "island", popular: 4 },
  { name: "Σαντορίνη", en: "Santorini", aka: ["Θήρα", "Thira", "Thera", "Βλυχάδα", "Vlychada"], region: "Κυκλάδες", kind: "island", popular: 10 },
  { name: "Μήλος", en: "Milos", aka: ["Αδάμαντας", "Adamas"], region: "Κυκλάδες", kind: "island", popular: 22 },
  { name: "Σύρος", en: "Syros", aka: [], region: "Κυκλάδες", kind: "island", ports: ["Ερμούπολη", "Φοίνικας"], popular: 23 },
  { name: "Ερμούπολη", en: "Ermoupoli", aka: ["Hermoupolis"], region: "Κυκλάδες", kind: "port" },
  { name: "Φοίνικας", en: "Finikas", aka: ["Foinikas"], region: "Κυκλάδες", kind: "port" },
  { name: "Τήνος", en: "Tinos", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Άνδρος", en: "Andros", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Κέα", en: "Kea", aka: ["Τζια", "Tzia"], region: "Κυκλάδες", kind: "island" },
  { name: "Κύθνος", en: "Kythnos", aka: ["Kithnos"], region: "Κυκλάδες", kind: "island" },
  { name: "Σέριφος", en: "Serifos", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Σίφνος", en: "Sifnos", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Κίμωλος", en: "Kimolos", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Φολέγανδρος", en: "Folegandros", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Ίος", en: "Ios", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Αμοργός", en: "Amorgos", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Κουφονήσια", en: "Koufonisia", aka: ["Koufonissi", "Κουφονήσι"], region: "Κυκλάδες", kind: "island" },
  { name: "Σχοινούσα", en: "Schinoussa", aka: ["Schinousa"], region: "Κυκλάδες", kind: "island" },
  { name: "Ηρακλειά", en: "Iraklia", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Δονούσα", en: "Donousa", aka: ["Donoussa"], region: "Κυκλάδες", kind: "island" },
  { name: "Ανάφη", en: "Anafi", aka: [], region: "Κυκλάδες", kind: "island" },

  // ---- Ιόνιο ----
  { name: "Λευκάδα", en: "Lefkada", aka: ["Lefkas", "Leukas"], region: "Ιόνιο", kind: "island", popular: 5 },
  { name: "Νυδρί", en: "Nidri", aka: ["Nydri"], region: "Ιόνιο", kind: "port" },
  { name: "Μεγανήσι", en: "Meganisi", aka: [], region: "Ιόνιο", kind: "island" },
  { name: "Κέρκυρα", en: "Corfu", aka: ["Kerkyra", "Kerkira"], region: "Ιόνιο", kind: "island", ports: ["Γουβιά"], popular: 6 },
  { name: "Γουβιά", en: "Gouvia", aka: ["Gouvia marina"], region: "Ιόνιο", kind: "port" },
  { name: "Παξοί", en: "Paxos", aka: ["Paxoi", "Πάξος", "Γάιος", "Gaios"], region: "Ιόνιο", kind: "island" },
  { name: "Αντίπαξοι", en: "Antipaxos", aka: ["Antipaxoi"], region: "Ιόνιο", kind: "island" },
  { name: "Πρέβεζα", en: "Preveza", aka: [], region: "Ιόνιο", kind: "town", popular: 29 },
  { name: "Πάργα", en: "Parga", aka: [], region: "Ιόνιο", kind: "town" },
  { name: "Σύβοτα", en: "Syvota", aka: ["Sivota"], region: "Ιόνιο", kind: "town" },
  { name: "Βόνιτσα", en: "Vonitsa", aka: [], region: "Ιόνιο", kind: "town" },
  { name: "Πάλαιρος", en: "Palairos", aka: ["Paleros"], region: "Ιόνιο", kind: "town" },
  { name: "Κεφαλονιά", en: "Kefalonia", aka: ["Cephalonia", "Kefallonia"], region: "Ιόνιο", kind: "island", ports: ["Αργοστόλι", "Φισκάρδο", "Σάμη"], popular: 14 },
  { name: "Αργοστόλι", en: "Argostoli", aka: [], region: "Ιόνιο", kind: "port" },
  { name: "Φισκάρδο", en: "Fiskardo", aka: ["Fiscardo"], region: "Ιόνιο", kind: "port" },
  { name: "Σάμη", en: "Sami", aka: [], region: "Ιόνιο", kind: "port" },
  { name: "Ιθάκη", en: "Ithaca", aka: ["Ithaki", "Βαθύ", "Vathy"], region: "Ιόνιο", kind: "island", popular: 25 },
  { name: "Ζάκυνθος", en: "Zakynthos", aka: ["Zante", "Zakinthos"], region: "Ιόνιο", kind: "island", popular: 15 },

  // ---- Δωδεκάνησα ----
  { name: "Ρόδος", en: "Rhodes", aka: ["Rodos", "Rhodos", "Mandraki", "Μανδράκι"], region: "Δωδεκάνησα", kind: "island", popular: 7 },
  { name: "Κως", en: "Kos", aka: ["Cos", "Κω"], region: "Δωδεκάνησα", kind: "island", popular: 8 },
  { name: "Σύμη", en: "Symi", aka: ["Simi"], region: "Δωδεκάνησα", kind: "island", popular: 16 },
  { name: "Τήλος", en: "Tilos", aka: [], region: "Δωδεκάνησα", kind: "island" },
  { name: "Νίσυρος", en: "Nisyros", aka: ["Nisiros"], region: "Δωδεκάνησα", kind: "island" },
  { name: "Κάλυμνος", en: "Kalymnos", aka: ["Kalimnos"], region: "Δωδεκάνησα", kind: "island" },
  { name: "Λέρος", en: "Leros", aka: [], region: "Δωδεκάνησα", kind: "island" },
  { name: "Λειψοί", en: "Lipsi", aka: ["Leipsoi", "Lipsoi"], region: "Δωδεκάνησα", kind: "island" },
  { name: "Πάτμος", en: "Patmos", aka: [], region: "Δωδεκάνησα", kind: "island", popular: 24 },
  { name: "Αγαθονήσι", en: "Agathonisi", aka: [], region: "Δωδεκάνησα", kind: "island" },
  { name: "Αστυπάλαια", en: "Astypalaia", aka: ["Astipalea", "Astypalea"], region: "Δωδεκάνησα", kind: "island" },
  { name: "Κάρπαθος", en: "Karpathos", aka: [], region: "Δωδεκάνησα", kind: "island" },
  { name: "Χάλκη", en: "Halki", aka: ["Chalki"], region: "Δωδεκάνησα", kind: "island" },

  // ---- Σποράδες ----
  { name: "Βόλος", en: "Volos", aka: [], region: "Σποράδες", kind: "town", popular: 28 },
  { name: "Σκιάθος", en: "Skiathos", aka: [], region: "Σποράδες", kind: "island", popular: 9 },
  { name: "Σκόπελος", en: "Skopelos", aka: [], region: "Σποράδες", kind: "island", popular: 17 },
  { name: "Αλόννησος", en: "Alonissos", aka: ["Alonnisos", "Alonnesos"], region: "Σποράδες", kind: "island", popular: 26 },
  { name: "Σκύρος", en: "Skyros", aka: ["Skiros"], region: "Σποράδες", kind: "island" },
  { name: "Τρίκερι", en: "Trikeri", aka: [], region: "Σποράδες", kind: "town" },

  // ---- Κρήτη ----
  { name: "Χανιά", en: "Chania", aka: ["Hania", "Xania", "Khania"], region: "Κρήτη", kind: "town", popular: 18 },
  { name: "Ηράκλειο", en: "Heraklion", aka: ["Iraklio", "Irakleio", "Iraklion"], region: "Κρήτη", kind: "town", popular: 19 },
  { name: "Ρέθυμνο", en: "Rethymno", aka: ["Rethimno", "Rethymnon"], region: "Κρήτη", kind: "town" },
  { name: "Άγιος Νικόλαος", en: "Agios Nikolaos", aka: ["Ag. Nikolaos", "Aghios Nikolaos"], region: "Κρήτη", kind: "town", popular: 27 },
  { name: "Ελούντα", en: "Elounda", aka: [], region: "Κρήτη", kind: "town" },
  { name: "Σητεία", en: "Sitia", aka: ["Siteia"], region: "Κρήτη", kind: "town" },
];

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

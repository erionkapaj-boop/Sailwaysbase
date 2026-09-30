// Ελλάδα: περιοχές και μέρη (νησιά, πόλεις, λιμάνια).
//
// Μοτίβο για κάθε χώρα (νέα χώρα = νέο αρχείο xx.js + xx.ports.js με την ίδια
// μορφή, και μία γραμμή στο ../places.js):
//
//   code, name, en, aka     η χώρα
//   areas                   όλες οι περιοχές της χώρας για ιστιοπλοΐα,
//                           καλυμμένες ή όχι. Το όνομα είναι ίδιο με τον πίνακα
//                           regions: μόλις μπει εκεί μια περιοχή, καλύπτεται
//                           αυτόματα. Όσες δεν είναι (ακόμα) στη βάση
//                           φαίνονται ως «δεν καλύπτεται ακόμα», με
//                           τις κοντινότερες καλυμμένες (near).
//     in      «στις Κυκλάδες» — για κείμενα
//     order   σειρά εμφάνισης
//   places                  ό,τι μπορεί να γράψει ένας πελάτης, από δύο πηγές:
//     1. τα λιμάνια του gr.ports.js (προτεινόμενα + πλήρης βάση), που
//        ενημερώνονται με επικόλληση λίστας·
//     2. τα CURATED παρακάτω: πόλεις και νησιά που δεν είναι λιμάνια
//        τσάρτερ, και αγγλικά ονόματα/παραλλαγές γραφής για την αναζήτηση.
//     Όταν ένα όνομα υπάρχει και στις δύο, ενώνονται.
//
// Πεδία μέρους:
//     region    περιοχή (όνομα από τα areas)
//     kind      island | town | port
//     en, aka   αγγλικό όνομα και άλλες γραφές
//     ports     λιμάνια/μαρίνες του νησιού (φτιάχνονται μόνα τους από τη λίστα)
//     parent    (μόνο στα λιμάνια νησιού) το νησί· child:true ξεχωρίζει το
//               «Βαθύ» της Ιθάκης από το «Βαθύ» της Σίφνου
//     base      (φτιάχνεται από τα προτεινόμενα) σειρά στις γρήγορες επιλογές
//     popular   σειρά στα παραδείγματα κάθε περιοχής
//
// Νέο μέρος ή νέα γραφή: μία γραμμή εδώ (και τεστ στο tests/unit). Τα μέρη
// που έψαξαν πελάτες και δεν βρέθηκαν φαίνονται στη διαχείριση (Υγεία
// εφαρμογής).

import { SUGGESTED, FULL } from "./gr.ports.js";

const AREAS = {
  Σαρωνικός: { in: "στον Σαρωνικό", en: "Saronic Gulf", aka: ["Αργοσαρωνικός", "Argosaronic", "Saronikos", "Αττική", "Attica"], order: 1 },
  Κυκλάδες: { in: "στις Κυκλάδες", en: "Cyclades", aka: ["Kyklades", "Cyclades islands"], order: 2 },
  Ιόνιο: { in: "στο Ιόνιο", en: "Ionian", aka: ["Ιόνια νησιά", "Ionian islands", "Ionio"], order: 3 },
  Δωδεκάνησα: { in: "στα Δωδεκάνησα", en: "Dodecanese", aka: ["Dodekanisa", "Dodecanese islands"], order: 4 },
  Σποράδες: { in: "στις Σποράδες", en: "Sporades", aka: ["Sporades islands", "Pagasitikos", "Παγασητικός"], order: 5 },
  Κρήτη: { in: "στην Κρήτη", en: "Crete", aka: ["Kriti", "Creta"], order: 6 },
  "Βόρειο Αιγαίο": { in: "στο Βόρειο Αιγαίο", en: "North Aegean", aka: ["Μακεδονία", "Θράκη", "Thermaikos", "Θερμαϊκός"], order: 7, near: ["Σποράδες"] },
  "Ανατολικό Αιγαίο": { in: "στο Ανατολικό Αιγαίο", en: "East Aegean", aka: ["Βορειοανατολικό Αιγαίο", "North East Aegean"], order: 8, near: ["Δωδεκάνησα", "Κυκλάδες"] },
};

const CURATED = [
  // ---- Σαρωνικός (και Αθήνα) ----
  { name: "Ραφήνα", en: "Rafina", aka: [], region: "Σαρωνικός", kind: "port" },
  { name: "Πόρτο Ράφτη", en: "Porto Rafti", aka: [], region: "Σαρωνικός", kind: "port" },
  { name: "Βάρκιζα", en: "Varkiza", aka: [], region: "Σαρωνικός", kind: "port" },
  { name: "Κόρινθος", en: "Corinth", aka: ["Korinthos", "Ισθμός", "Isthmia"], region: "Σαρωνικός", kind: "town" },
  { name: "Αθήνα", en: "Athens", aka: ["Athina", "Athena", "Αθηνα"], region: "Σαρωνικός", kind: "town", ports: ["Άλιμος", "Άγιος Κοσμάς"], popular: 1 },
  { name: "Άλιμος", parent: "Αθήνα", en: "Alimos", aka: ["Kalamaki", "Καλαμάκι", "Alimos marina"], region: "Σαρωνικός", kind: "port" },
  { name: "Άγιος Κοσμάς", parent: "Αθήνα", en: "Agios Kosmas", aka: ["Ag. Kosmas", "Ellinikon"], region: "Σαρωνικός", kind: "port" },
  { name: "Λαύριο", en: "Lavrio", aka: ["Lavrion", "Laurium"], region: "Σαρωνικός", kind: "port" },
  { name: "Πειραιάς", en: "Piraeus", aka: ["Pireas", "Peiraias", "Piraeus port"], region: "Σαρωνικός", kind: "port" },
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
  { name: "Κουφονήσι", en: "Koufonisi", aka: ["Koufonissi", "Κουφονήσια", "Koufonisia"], region: "Κυκλάδες", kind: "island" },
  { name: "Σχοινούσα", en: "Schinoussa", aka: ["Schinousa"], region: "Κυκλάδες", kind: "island" },
  { name: "Ηρακλειά", en: "Iraklia", aka: [], region: "Κυκλάδες", kind: "island" },
  { name: "Δονούσα", en: "Donousa", aka: ["Donoussa"], region: "Κυκλάδες", kind: "island" },
  { name: "Ανάφη", en: "Anafi", aka: [], region: "Κυκλάδες", kind: "island" },

  // ---- Ιόνιο ----
  { name: "Ηγουμενίτσα", en: "Igoumenitsa", aka: [], region: "Ιόνιο", kind: "town" },
  { name: "Αστακός", en: "Astakos", aka: [], region: "Ιόνιο", kind: "town" },
  { name: "Μύτικας", en: "Mytikas", aka: ["Mitikas"], region: "Ιόνιο", kind: "town" },
  { name: "Βασιλική", en: "Vasiliki", aka: [], region: "Ιόνιο", kind: "port" },
  { name: "Κάλαμος", en: "Kalamos", aka: [], region: "Ιόνιο", kind: "island" },
  { name: "Κυλλήνη", en: "Kyllini", aka: ["Killini"], region: "Ιόνιο", kind: "port" },
  { name: "Λευκάδα", en: "Lefkada", aka: ["Lefkas", "Leukas"], region: "Ιόνιο", kind: "island", popular: 5 },
  { name: "Νυδρί", en: "Nidri", aka: ["Nydri"], region: "Ιόνιο", kind: "port" },
  { name: "Μεγανήσι", en: "Meganisi", aka: [], region: "Ιόνιο", kind: "island" },
  { name: "Κέρκυρα", en: "Corfu", aka: ["Kerkyra", "Kerkira"], region: "Ιόνιο", kind: "island", ports: ["Γουβιά"], popular: 6 },
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
  { name: "Σούδα", en: "Souda", aka: [], region: "Κρήτη", kind: "port" },
  { name: "Κίσσαμος", en: "Kissamos", aka: ["Kastelli"], region: "Κρήτη", kind: "town" },
  { name: "Ιεράπετρα", en: "Ierapetra", aka: [], region: "Κρήτη", kind: "town" },
  { name: "Χερσόνησος", en: "Hersonissos", aka: ["Chersonisos", "Hersonisos"], region: "Κρήτη", kind: "town" },
  { name: "Χανιά", en: "Chania", aka: ["Hania", "Xania", "Khania"], region: "Κρήτη", kind: "town", popular: 18 },
  { name: "Ηράκλειο", en: "Heraklion", aka: ["Iraklio", "Irakleio", "Iraklion"], region: "Κρήτη", kind: "town", popular: 19 },
  { name: "Ρέθυμνο", en: "Rethymno", aka: ["Rethimno", "Rethymnon"], region: "Κρήτη", kind: "town" },
  { name: "Άγιος Νικόλαος", en: "Agios Nikolaos", aka: ["Ag. Nikolaos", "Aghios Nikolaos"], region: "Κρήτη", kind: "town", popular: 27 },
  { name: "Ελούντα", en: "Elounda", aka: [], region: "Κρήτη", kind: "town" },
  { name: "Σητεία", en: "Sitia", aka: ["Siteia"], region: "Κρήτη", kind: "town" },

  // ---- Βόρειο Αιγαίο (δεν καλύπτεται ακόμα) ----
  { name: "Θεσσαλονίκη", en: "Thessaloniki", aka: ["Salonica", "Saloniki", "Θεσ/νίκη", "Σαλονίκη", "Aretsou", "Αρετσού"], region: "Βόρειο Αιγαίο", kind: "town", popular: 30 },
  { name: "Χαλκιδική", en: "Halkidiki", aka: ["Chalkidiki", "Halkidiki", "Κασσάνδρα", "Kassandra", "Σιθωνία", "Sithonia"], region: "Βόρειο Αιγαίο", kind: "town" },
  { name: "Νέα Μουδανιά", en: "Nea Moudania", aka: ["Moudania"], region: "Βόρειο Αιγαίο", kind: "port" },
  { name: "Νικήτη", en: "Nikiti", aka: [], region: "Βόρειο Αιγαίο", kind: "town" },
  { name: "Νέος Μαρμαράς", en: "Neos Marmaras", aka: ["Porto Carras", "Πόρτο Καρράς"], region: "Βόρειο Αιγαίο", kind: "port" },
  { name: "Σάνη", en: "Sani", aka: ["Sani marina"], region: "Βόρειο Αιγαίο", kind: "port" },
  { name: "Ουρανούπολη", en: "Ouranoupoli", aka: ["Ouranoupolis"], region: "Βόρειο Αιγαίο", kind: "town" },
  { name: "Κατερίνη", en: "Katerini", aka: ["Παραλία Κατερίνης"], region: "Βόρειο Αιγαίο", kind: "town" },
  { name: "Καβάλα", en: "Kavala", aka: [], region: "Βόρειο Αιγαίο", kind: "town" },
  { name: "Θάσος", en: "Thassos", aka: ["Thasos"], region: "Βόρειο Αιγαίο", kind: "island" },
  { name: "Αλεξανδρούπολη", en: "Alexandroupoli", aka: ["Alexandroupolis"], region: "Βόρειο Αιγαίο", kind: "town" },
  { name: "Σαμοθράκη", en: "Samothraki", aka: ["Samothrace"], region: "Βόρειο Αιγαίο", kind: "island" },

  // ---- Ανατολικό Αιγαίο (δεν καλύπτεται ακόμα) ----
  { name: "Λέσβος", en: "Lesvos", aka: ["Lesbos", "Μυτιλήνη", "Mytilene", "Mytilini"], region: "Ανατολικό Αιγαίο", kind: "island" },
  { name: "Χίος", en: "Chios", aka: ["Hios", "Xios"], region: "Ανατολικό Αιγαίο", kind: "island" },
  { name: "Σάμος", en: "Samos", aka: ["Πυθαγόρειο", "Pythagorio"], region: "Ανατολικό Αιγαίο", kind: "island" },
  { name: "Ικαρία", en: "Ikaria", aka: ["Icaria"], region: "Ανατολικό Αιγαίο", kind: "island" },
  { name: "Φούρνοι", en: "Fournoi", aka: ["Fourni"], region: "Ανατολικό Αιγαίο", kind: "island" },
  { name: "Λήμνος", en: "Limnos", aka: ["Lemnos", "Μύρινα", "Myrina"], region: "Ανατολικό Αιγαίο", kind: "island" },
  { name: "Οινούσσες", en: "Oinousses", aka: ["Inousses"], region: "Ανατολικό Αιγαίο", kind: "island" },
  { name: "Ψαρά", en: "Psara", aka: [], region: "Ανατολικό Αιγαίο", kind: "island" },

  // ---- Πελοπόννησος: Μεσσηνία → Ιόνιο, Λακωνία/νότος → Σαρωνικός ----
  { name: "Καλαμάτα", en: "Kalamata", aka: [], region: "Ιόνιο", kind: "town", popular: 31 },
  { name: "Πύλος", en: "Pylos", aka: ["Pilos", "Navarino", "Ναβαρίνο"], region: "Ιόνιο", kind: "town" },
  { name: "Κορώνη", en: "Koroni", aka: [], region: "Ιόνιο", kind: "town" },
  { name: "Μεθώνη", en: "Methoni", aka: [], region: "Ιόνιο", kind: "town" },
  { name: "Γύθειο", en: "Gythio", aka: ["Gytheio", "Githio"], region: "Σαρωνικός", kind: "town" },
  { name: "Μονεμβασιά", en: "Monemvasia", aka: [], region: "Σαρωνικός", kind: "town" },
  { name: "Λεωνίδιο", en: "Leonidio", aka: [], region: "Σαρωνικός", kind: "town" },
  { name: "Κύθηρα", en: "Kythira", aka: ["Kithira", "Cythera"], region: "Σαρωνικός", kind: "island" },
  { name: "Ελαφόνησος", en: "Elafonisos", aka: [], region: "Σαρωνικός", kind: "island" },

  // ---- Πατραϊκός / Κορινθιακός: δυτική είσοδος → Ιόνιο ----
  { name: "Πάτρα", en: "Patras", aka: ["Patra"], region: "Ιόνιο", kind: "town", popular: 32 },
  { name: "Ναύπακτος", en: "Nafpaktos", aka: ["Lepanto"], region: "Ιόνιο", kind: "town" },
  { name: "Αίγιο", en: "Aigio", aka: ["Egio", "Aegion"], region: "Ιόνιο", kind: "town" },
  { name: "Γαλαξίδι", en: "Galaxidi", aka: [], region: "Ιόνιο", kind: "town" },
  { name: "Ιτέα", en: "Itea", aka: [], region: "Ιόνιο", kind: "town" },
  { name: "Μεσολόγγι", en: "Missolonghi", aka: ["Mesolongi", "Messolonghi"], region: "Ιόνιο", kind: "town" },

  // ---- Εύβοια: νότια → Σαρωνικός, βόρεια → Σποράδες ----
  { name: "Χαλκίδα", en: "Chalkida", aka: ["Halkida", "Chalcis"], region: "Σαρωνικός", kind: "town" },
  { name: "Ερέτρια", en: "Eretria", aka: [], region: "Σαρωνικός", kind: "town" },
  { name: "Κάρυστος", en: "Karystos", aka: ["Karistos"], region: "Σαρωνικός", kind: "town" },
  { name: "Αιδηψός", en: "Aidipsos", aka: ["Edipsos", "Loutra Aidipsou"], region: "Σποράδες", kind: "town" },
  { name: "Κύμη", en: "Kymi", aka: ["Kimi"], region: "Σποράδες", kind: "town" },
];

// ---- Από λίστα σε μέρη --------------------------------------------------

const plain = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

// { Περιοχή: [γραμμές] } από κείμενο με επικεφαλίδες περιοχών.
function parseList(text) {
  const out = {};
  let area = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = Object.keys(AREAS).find((a) => plain(a) === plain(line));
    if (heading) {
      area = heading;
      out[area] = out[area] || [];
    } else if (!area) {
      throw new Error(`gr.ports.js: γραμμή πριν από επικεφαλίδα περιοχής: ${line}`);
    } else out[area].push(line);
  }
  return out;
}

// Ορθογραφικά λάθη της λίστας → σωστό όνομα (ώστε να μην υπάρχει το ίδιο μέρος δύο φορές).
const NAME_FIXES = { "Καρπάθος": "Κάρπαθος", "Παλαίρος": "Πάλαιρος" };
const fix = (n) => NAME_FIXES[n] || n;

// «Νησί – Λιμάνι» ή «Μέρος» ή «Όνομα / Άλλο όνομα».
function parseLine(line) {
  const [parent, port] = line.includes(" – ") ? line.split(" – ").map((x) => x.trim()) : [null, line];
  const [name, ...aka] = (port || parent).split("/").map((x) => x.trim());
  return { parent: port ? fix(parent) : null, name: fix(name), aka };
}

// Παραλλαγές γραφής που δεν βγαίνουν από την προφορά (βλ. placeSearch).
const ALIASES = {
  "Κέρκυρα – Gouvia Marina": { aka: ["Γουβιά", "Gouvia"] },
  "Κέρκυρα – Πόλη": { aka: ["Corfu town", "Κέρκυρα πόλη"] },
  "Ζέα": { aka: ["Zea", "Μαρίνα Ζέας", "Pasalimani"] },
  "Ρόδος – New Marina": { aka: ["Νέα Μαρίνα", "Rhodes marina"] },
  "Άκτιο – Cleopatra Marina": { aka: ["Κλεοπάτρα", "Preveza marina"] },
  "Κως – Κεντρικό Λιμάνι": { aka: ["Κως πόλη", "Kos town"] },
};

function buildPlaces() {
  const places = CURATED.map((p) => ({ ...p }));
  const find = (region, name, child, parent) =>
    places.find((p) => p.region === region && p.name === name && Boolean(p.child) === child && (!child || p.parent === parent));
  const regenerated = new Set();
  const fullList = parseList(FULL);
  // Λιμάνια που στέκονται και μόνα τους στη λίστα (Σύβοτα) δεν ενώνονται με το λιμάνι νησιού.
  const standalone = new Set(
    Object.entries(fullList).flatMap(([region, lines]) => lines.filter((l) => !l.includes(" – ")).map((l) => `${region}|${parseLine(l).name}`))
  );

  for (const [region, lines] of Object.entries(fullList)) {
    for (const line of lines) {
      const { parent, name, aka } = parseLine(line);
      const extra = ALIASES[parent ? `${parent} – ${name}` : name]?.aka || [];
      if (!parent) {
        const existing = find(region, name, false);
        if (existing) existing.aka = [...new Set([...(existing.aka || []), ...aka, ...extra])];
        else places.push({ name, aka: [...aka, ...extra], region, kind: "town" });
        continue;
      }
      let owner = find(region, parent, false);
      if (!owner) {
        owner = { name: parent, aka: [], region, kind: "island" };
        places.push(owner);
      }
      // Τα λιμάνια του νησιού έρχονται από τη λίστα· τα παλιά χειροποίητα φεύγουν.
      if (!regenerated.has(owner)) {
        owner.ports = [];
        regenerated.add(owner);
      }
      if (!owner.ports.includes(name)) owner.ports.push(name);
      // Ήδη γνωστό λιμάνι με αγγλικό όνομα/παραλλαγές (π.χ. Νάουσα): ενώνεται.
      const known = standalone.has(`${region}|${name}`) ? null : find(region, name, false);
      const child = { name, en: known?.en, aka: [...new Set([...(known?.aka || []), ...aka, ...extra])], region, kind: "port", parent, child: true };
      if (known) places.splice(places.indexOf(known), 1);
      places.push(child);
    }
  }

  // Προτεινόμενα: σημαδεύονται με τη σειρά τους. Πρέπει να υπάρχουν στην πλήρη βάση.
  let order = 0;
  for (const [region, lines] of Object.entries(parseList(SUGGESTED))) {
    for (const line of lines) {
      const { parent, name } = parseLine(line);
      const entry = parent ? find(region, name, true, parent) : find(region, name, false);
      if (!entry) throw new Error(`gr.ports.js: το προτεινόμενο «${line}» (${region}) λείπει από την πλήρη βάση`);
      entry.base = ++order;
    }
  }
  return places;
}

export const GREECE = {
  code: "GR",
  name: "Ελλάδα",
  en: "Greece",
  aka: ["Hellas", "Ellada"],
  areas: AREAS,
  places: buildPlaces(),
};

"use client";
import React, { useState, useEffect, useRef } from "react";
import { storage as winStorage } from "../lib/storage";
import { supabase } from "../lib/supabaseClient";

// ---------- Σταθερές ----------
const APP_VERSION = "v3.90";
const COLORS = {
  // Ουδέτεροι σε ΖΕΣΤΗ βάση (γέρνουν ελάχιστα προς το μπεζ, όχι προς το μπλε): το ψυχρό μπλε-γκρι διαβάζεται
  // ως εταιρικό και απόμακρο, ο ζεστός ουδέτερος ως ήρεμος και ανθρώπινος — χωρίς να χάνει σοβαρότητα.
  // ΟΜΩΣ το κείμενο μένει πολύ σκούρο: η ομάδα δουλεύει σε προβλήτα με δυνατό ήλιο, όπου η χαμηλή αντίθεση
  // (που δείχνει «κομψή» σε γραφείο) γίνεται απλώς δυσανάγνωστη. Ζεστασιά στα φόντα, ευκρίνεια στα γράμματα.
  bg: "#F7F6F3",        // φόντο οθόνης — ζεστό, όχι κλινικό λευκό
  card: "#FFFFFF",
  line: "#E6E2DB",      // διαχωριστικά — ζεστό, χαμηλής έντασης
  text: "#1B1917",      // ~15.8:1 σε λευκό — διαβάζεται στον ήλιο
  sub: "#5C554C",       // ~7.4:1 — δευτερεύον αλλά ακόμα ευανάγνωστο έξω
  // Το navy μένει η μοναδική ψυχρή νότα: ναυτικό, σταθερό, αντίβαρο στους ζεστούς ουδέτερους.
  navy: "#12293F",
  navySoft: "#1B3A56",
  teal: "#0C6E77",
  tealDark: "#08525A",
  // Σήματα κατάστασης βαθύτερα από τα προηγούμενα: περνούν τα όρια αντίθεσης ως ΚΕΙΜΕΝΟ, όχι μόνο ως φόντο.
  red: "#B5342A",
  amber: "#A66A08",
  green: "#1A6E33",
  blue: "#33628F",
};

// ---------- Τυπογραφία & βασικά στυλ ----------
// Inter: μία γραμματοσειρά αντί για «ό,τι έχει το κινητό», ώστε η εφαρμογή να μη μοιάζει με τις ρυθμίσεις
// της συσκευής. Φορτώνεται με display=swap και πλήρες fallback — αν το σήμα στην προβλήτα είναι κακό,
// το κείμενο εμφανίζεται αμέσως με τη system γραμματοσειρά και αντικαθίσταται αθόρυβα μόλις κατέβει.
const FONT_STACK = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Κλίμακα: 6 μεγέθη αντί για 15 αυθαίρετα. Το μάτι δεν εντοπίζει συνειδητά τη διαφορά 13 από 13.5,
// αλλά την αντιλαμβάνεται ως ακαταστασία — και αυτό κουράζει.
const T = { caption: 12, small: 13, body: 15, title: 17, heading: 20, display: 28 };
// Πλέγμα 8: κάθε απόσταση πολλαπλάσιο του 4. Ποτέ 11 ή 13.
const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
// Δύο ακτίνες συν pill. Η καμπύλη κίνησης ξεκινά γρήγορα και «προσγειώνεται» απαλά — αυτό διαβάζεται ως
// φιλικό, ενώ η γραμμική κίνηση στον ίδιο χρόνο διαβάζεται ως μηχανική.
const R = { sm: 8, lg: 12, pill: 999 };
const EASE = "160ms cubic-bezier(0.2, 0, 0, 1)";

const SEED_USERS = [
  { id: "u-owner", name: "Εριόν", role: "owner", profile: "Διαχειριστής εφαρμογής", code: "OWN-7301" },
  { id: "u-vasilis", name: "Βασίλης", role: "employee", profile: "", code: "VAS-4821" },
  { id: "u-mitsos", name: "Μήτσος", role: "employee", profile: "", code: "MIT-9354" },
  { id: "u-fanouris", name: "Φανούρης", role: "employee", profile: "", code: "FAN-2768" },
  { id: "u-giannis", name: "Γιάννης", role: "employee", profile: "", code: "GIA-5142" },
  { id: "u-nikol", name: "Νικόλ", role: "employee", profile: "", code: "NIK-8637" },
  { id: "u-danai", name: "Δανάη", role: "employee", profile: "", code: "DAN-3495" },
];
const genCode = (name) => (name.slice(0, 3).toUpperCase().replace(/[^A-ZΑ-Ω]/g, "X")) + "-" + Math.floor(1000 + Math.random() * 9000);

const SEED_BOATS = [
  ["Λεωνίδας", "Bavaria 50"], ["Λεωνίδας II", "Bavaria 46"], ["Λεωνίδας III", "Bavaria 51"],
  ["Fairy", "Cyclades 50.5"], ["Sunflower", "Sun Odyssey 45"], ["Απόλλων", "Bavaria 51"],
  ["Σοφία II", "Bavaria 46"], ["Βερόνικα II", "Bavaria 46"], ["Αλεξάνδρεια", "Ocean Star 58.4"],
  ["Κατερίνα", "Ocean Star 58.4"], ["Αλέξανδρος", "Ocean Star 58.4"], ["Πάρτε II", "Ocean Star 51.2"],
  ["Λίνα", "Bavaria 51"], ["Messenger", "Jeanneau 57"], ["Mystique", "Lagoon 500"],
  ["Mystique II", "Lagoon 500"], ["Avra", "Lagoon 560 S2"], ["Marina", "Leopard 45"], ["Lag IX", "Lagoon 42"],
].map(([name, type], i) => ({ id: "b" + i, name, type, atSea: false, returnDate: null, departureDate: null }));

const SEED_QUICK = ["Αλλαγή λαδιών", "Καθαρισμός σεντίνας", "Καθαρισμός μηχανοστασίου"];
const SEED_CHECKLIST = ["Εξωτερικό πλύσιμο", "Εσωτερικός καθαρισμός", "Έλεγχος τουαλετών", "Έλεγχος εξοπλισμού"];
const SEED_CLOSING_CHECKLIST = ["Φώτα σβηστά", "Πασαρέλα μέσα / κλειδωμένη", "Μπαταρία στην πρίζα / φορτίζει", "Ψυγείο σωστά κλειστό", "Παράθυρα κλειστά", "Πόρτες κλειδωμένες"];

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
let LANG = "el";

// ---------- Κεντρικές ρυθμίσεις βάσης ----------
// Όλες οι τιμές που καθορίζουν συμπεριφορά (ώρες, όρια, διακόπτες) ζουν ΕΔΩ και ρυθμίζονται από την οθόνη
// «⚙️ Ρυθμίσεις» της Διοίκησης. Το DEFAULT_SETTINGS είναι το ασφαλές σημείο επαναφοράς — ό,τι ίσχυε ως τώρα
// σκληροκωδικοποιημένο. Ακολουθεί το ίδιο μοτίβο με το LANG: μεταβλητή σε επίπεδο module, που ενημερώνεται
// μία φορά κατά τη φόρτωση, ώστε να τη «βλέπουν» και οι βοηθητικές συναρτήσεις εκτός React components.
const DEFAULT_SETTINGS = {
  // Α. Ωράρια & αυτοματισμοί
  closingCheckTime: "15:30",      // πότε δημιουργούνται αυτόματα οι έλεγχοι κλεισίματος
  closingExpireHour: 19,          // μετά από αυτή την ώρα, τα ανεκτέλεστα κλεισίματα λήγουν
  departureCutoffTime: "18:00",   // ώρα που ένα σκάφος θεωρείται ότι έφυγε τη μέρα αναχώρησης
  lateCharterGraceHours: 2,       // περιθώριο για ναύλο που καταχωρείται μετά την ώρα αναχώρησης
  workStart: "09:15",             // ωράριο εργασίας — βάση υπολογισμού deadlines
  workEnd: "17:00",
  nonWorkingDays: [0],            // 0=Κυριακή … 6=Σάββατο
  noAutoTaskDays: [0, 6],         // μέρες χωρίς αυτόματες εργασίες χαμηλού φόρτου
  weeklyReportDay: 0,             // μέρα εβδομαδιαίας αναφοράς
  weeklyReportHour: 17,
  // Β. AI κατανομή
  maxTasksPerEmployee: 3,         // ανώτατο όριο αναθέσεων ανά άτομο ανά μέρα
  lowLoadThreshold: 1,            // ≤ τόσες ανοιχτές εργασίες = «χαμηλός φόρτος»
  maxBacklogConvert: 3,           // πόσες εργασίες αναμονής ενεργοποιούνται μαζί
  // Γ. Χρόνοι εμφάνισης
  noteVisibleHours: 8,            // πόσο μένουν ορατά τα εσωτερικά μηνύματα
  closingAlertUntilHour: 11,      // ως ποια ώρα το επόμενο πρωί μένει η ειδοποίηση κλεισίματος
  departuresWindowDays: 7,        // εύρος του πίνακα «Αναχωρήσεις & Επιστροφές»
  boatHistoryDays: 21,            // πόσο πίσω κοιτά το AI το ιστορικό κάθε σκάφους
  // Δ. Διακόπτες αυτοματισμών
  closingCheckMode: "auto",       // "auto" | "manual"
  autoDistribution: true,         // ημερήσια κατανομή AI
  autoLowLoadTasks: true,         // αυτόματες εργασίες όταν πέφτει ο φόρτος
  autoDepartureChecklists: true,  // checklist αναχώρησης
  autoWeeklyReport: true,         // αυτόματη εβδομαδιαία αναφορά
  // Ε. Φωτογραφίες
  photoMaxDim: 1280,
  photoQuality: 0.72,
};
let SET = { ...DEFAULT_SETTINGS };
// Συγχώνευση αποθηκευμένων ρυθμίσεων πάνω στις προεπιλογές — άγνωστα/παλιά κλειδιά αγνοούνται ήσυχα και
// κάθε νέα ρύθμιση που προστίθεται σε μελλοντική έκδοση παίρνει αυτόματα τη σωστή προεπιλογή της.
const mergeSettings = (saved) => {
  const out = { ...DEFAULT_SETTINGS };
  if (saved && typeof saved === "object") {
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (saved[k] !== undefined && saved[k] !== null) out[k] = saved[k];
  }
  return out;
};
// "15:30" -> { h: 15, m: 30 }, με ασφαλές fallback αν η τιμή είναι κατεστραμμένη.
const parseTime = (s, fallback) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
  if (!m) return parseTime(fallback, "00:00");
  const h = Math.min(23, Math.max(0, Number(m[1]))), mi = Math.min(59, Math.max(0, Number(m[2])));
  return { h, m: mi };
};
const TR = {
  "Με επιφυλάξεις": "With reservations", "Περισσότερα": "More", "Λιγότερα": "Less",
  "Προθεσμία": "Deadline", "Ανάθεση": "Assign", "Άρση επείγοντος": "Clear urgent",
  "Βοήθεια": "Help", "Φωτογραφία πριν": "Photo before",
  "Σήμερα": "Today", "Εργασίες": "Tasks", "Νέα": "New", "Διοίκηση": "Admin",
  "Οι εργασίες μου": "My tasks", "Διαθέσιμες εργασίες": "Available tasks",
  "Ολοκληρώθηκε ✔": "Done ✔", "➕ Πρόοδος": "➕ Progress", "Χρειάζεται ειδικός ⚠": "Needs specialist ⚠",
  "Καταχώρηση": "Submit", "Άκυρο": "Cancel", "Έξοδος": "Log out", "Είσοδος": "Sign in",
  "Σκάφος": "Boat", "Γρήγορες εργασίες": "Quick tasks", "Περιγραφή": "Description",
  "Καταχώρηση εργασίας": "Add task", "Βάση / Άλλο (van, εργαλεία…)": "Base / Other (van, tools…)",
  "Βάση / Άλλο": "Base / Other", "Όλα τα σκάφη": "All boats", "Βιβλίο service": "Service book",
  "Νέα εργασία": "New task", "Επείγον": "Urgent", "Σήμερα!": "Today!", "έως": "by",
  "Συνεργείο βάσης": "Base crew", "Προσωπικός κωδικός": "Personal code",
  "Δεν σου έχει ανατεθεί κάτι ονομαστικά. Δες τις διαθέσιμες εργασίες στην καρτέλα «Εργασίες».": "Nothing assigned to you by name. Check available tasks in the “Tasks” tab.",
  "Καμία εργασία εδώ.": "No tasks here.", "Καμία ολοκληρωμένη εργασία ακόμα.": "No completed tasks yet.",
  "π.χ. Το πόμολο στη δεξιά πόρτα της καμπίνας έχει χαλάσει": "e.g. The handle on the right cabin door is broken",
  "Τι έκανες; π.χ. γυάλισα τη δεξιά πλευρά της πλώρης (~1 ώρα)": "What did you do? e.g. polished the starboard bow (~1 hour)",
  "Τι δοκίμασες; Τι ειδικό χρειάζεται;": "What did you try? What specialist is needed?",
  "🔴 ΕΠΕΙΓΟΝ — σοβαρό πρόβλημα": "🔴 URGENT — serious problem",
  "Μαρκάρισμα ως επείγον (σοβαρό πρόβλημα)": "Mark as urgent (serious problem)",
  "Η εργασία καταχωρήθηκε": "Task added", "Ολοκληρώθηκε ✔ ": "Done ✔",
  "Η πρόοδος καταγράφηκε": "Progress logged",
  "Καταγράφηκε: χρειάζεται εξωτερικό συνεργάτη ⚠": "Logged: needs external specialist ⚠",
  "εξωτερικός συνεργάτης": "external specialist",
  "Ο κωδικός μπαίνει μία φορά — η συσκευή σε θυμάται. / Enter once — this device remembers you.": "Enter your code once — this device remembers you.",
  "Ο κωδικός δεν αναγνωρίστηκε. Ζήτησε τον προσωπικό σου κωδικό από τον υπεύθυνο.": "Code not recognized. Ask your manager for your personal code.",
  "Σημείωση manager:": "Manager note:", "Διόρθωση": "Edit", "Φωνητική καταχώρηση με AI": "Voice entry with AI", "Μίλα": "Speak", "Σταμάτημα": "Stop", "Ανάλυση με AI": "Analyze with AI", "Ανάλυση…": "Analyzing…", "Καθάρισμα": "Clear", "Καταχώρηση όλων": "Add all", "Προεπισκόπηση — έλεγξε και διόρθωσε πριν την καταχώρηση": "Preview — check and correct before submitting", "Δεν αναγνωρίστηκαν εργασίες — δοκίμασε πιο συγκεκριμένη διατύπωση.": "No tasks recognized — try being more specific.", "Η ανάλυση απέτυχε — δοκίμασε ξανά.": "Analysis failed — try again.", "Η φωνητική αναγνώριση δεν υποστηρίζεται σε αυτή τη συσκευή/browser — γράψε το κείμενο και πάτα Ανάλυση.": "Speech recognition not supported on this device/browser — type the text and press Analyze.", "Πρόβλημα μικροφώνου — δοκίμασε ξανά ή γράψε το κείμενο.": "Microphone problem — try again or type the text.", "π.χ. Στον Λεωνίδα το παράθυρο είναι σπασμένο, δεν ανάβει το φως στην πλώρη και θέλει αλλαγή η σκότα": "e.g. On Leonidas the window is broken, the bow light is not working and the sheet needs replacement", "Πολλαπλές εργασίες: ΝΑΙ — μία ανά γραμμή": "Multiple tasks: ON — one per line", "Πολλαπλές εργασίες μαζί (μία ανά γραμμή)": "Multiple tasks at once (one per line)", "Μία εργασία ανά γραμμή, π.χ.:\nΠαράθυρο σπασμένο\nΤο φως στην πλώρη δεν ανάβει\nΗ σκότα θέλει αλλαγή": "One task per line, e.g.:\nBroken window\nBow light not working\nSheet needs replacement", "Διαγραφή": "Delete", "Φωτογραφίες (προαιρετικό)": "Photos (optional)", "Προσθήκη φωτογραφίας": "Add photo", "Αγορά": "Purchase", "Λείπει υλικό / χρειάζεται αγορά": "Missing material / needs purchase", "ΑΓΟΡΑ / ΛΕΙΨΗ ΥΛΙΚΟΥ — θα ανατεθεί στον Λεωνίδα": "PURCHASE / MISSING MATERIAL — will be assigned to Leonidas", "Ναι, διαγραφή": "Yes, delete", "Διαγραφή εργασίας; Δεν αναιρείται.": "Delete this task? This cannot be undone.", "πρόοδοι": "progress entries", "Επιστράφηκε": "Returned", "Εντάξει": "OK", "Πρόβλημα": "Problem", "Τι πρόβλημα είδες;": "What's the problem?", "Καταχώρηση προβλήματος": "Log problem",
};
const tr = (s) => (LANG === "en" ? (TR[s] || s) : s);
const fmtDate = (d) => { if (!d) return ""; const x = new Date(d); return x.toLocaleDateString(LANG === "en" ? "en-GB" : "el-GR", { day: "numeric", month: "short" }); };
const fmtTime = (d) => new Date(d).toLocaleTimeString(LANG === "en" ? "en-GB" : "el-GR", { hour: "2-digit", minute: "2-digit" });
const deadlineLabel = (t, dl) => {
  if (!dl) return null;
  if (t.manualDeadline) {
    const isPast = new Date(dl).getTime() < Date.now();
    const sameDay = new Date(dl).toDateString() === new Date().toDateString();
    if (isPast) return tr("Έληξε") + " · " + fmtTime(dl);
    return `${tr("έως")} ${sameDay ? "" : fmtDate(dl) + " "}${fmtTime(dl)}`;
  }
  const du = daysUntil(dl);
  if (du === null) return null;
  return du <= 0 ? tr("Σήμερα!") : (LANG === "en" ? `in ${du} days` : `σε ${du} μέρες`);
};
const localMidnight = (dateStr) => { const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const daysUntil = (d) => { if (!d) return null; return Math.round((localMidnight(d) - localMidnight(todayStr())) / 86400000); };
const dateStrOf = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

// ---------- Ώρα αναχώρησης ναύλου που φεύγει ΣΗΜΕΡΑ ----------
// Ένα σκάφος με ναύλο που ξεκινά σήμερα δεν θεωρείται «εν πλω» αμέσως το πρωί — μέχρι την ώρα αναχώρησης
// συνεχίζει να δείχνει ότι έχει δουλειές στη βάση (κανονικές εργασίες/κατανομή), όπως κάθε σκάφος στο λιμάνι.
// Κανόνας:
// - Προεπιλογή: αναχώρηση στις 18:00 το απόγευμα της ίδιας μέρας.
// - Αν ο ναύλος καταχωρηθεί ο ίδιος ΜΕΤΑ τις 18:00 της ίδιας μέρας αναχώρησης (καταχώρηση της τελευταίας
//   στιγμής, π.χ. στις 19:00 για αναχώρηση «σήμερα»), δίνεται περιθώριο 2 ωρών από την ώρα καταχώρησης
//   αντί για το σταθερό 18:00 — ώστε να προλαβαίνει να φανεί ότι υπάρχουν ακόμα δουλειές στο σκάφος.
const departureCutoffInstant = (charter) => {
  const cut = parseTime(SET.departureCutoffTime, "18:00");
  const defaultCutoff = localMidnight(charter.from);
  defaultCutoff.setHours(cut.h, cut.m, 0, 0);
  if (charter.createdAt) {
    const created = new Date(charter.createdAt);
    if (dateStrOf(created) === charter.from && created.getTime() > defaultCutoff.getTime()) {
      return new Date(created.getTime() + Math.max(0, Number(SET.lateCharterGraceHours) || 0) * 3600 * 1000);
    }
  }
  return defaultCutoff;
};
const departureCutoffPassed = (charter) => Date.now() >= departureCutoffInstant(charter).getTime();

// Ορατότητα εσωτερικών μηνυμάτων. Τα κανονικά μηνύματα (ανθρώπων) μένουν ορατά 8 ώρες από την αποστολή.
// Τα αυτόματα μηνύματα «κλείσιμο σκάφους» (kind="closing-alert") έχουν δικό τους κανόνα: μένουν ορατά μέχρι
// τις 11:00 το επόμενο πρωί από την αποστολή τους — αρκετός χρόνος να τα δει κανείς το βράδυ, αλλά χωρίς να
// γίνονται «θόρυβος» στην πρώτη εικόνα των εργασιών της επόμενης μέρας.
const isNoteVisible = (n) => {
  if (n.kind === "closing-alert") {
    const sent = new Date(n.at);
    const cutoff = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate() + 1, Number(SET.closingAlertUntilHour) || 11, 0, 0, 0);
    return Date.now() < cutoff.getTime();
  }
  return Date.now() - new Date(n.at).getTime() < (Number(SET.noteVisibleHours) || 8) * 3600 * 1000;
};

// Λήψη CSV από τον browser — rows: array of arrays, το πρώτο row είναι πάντα η επικεφαλίδα.
// \uFEFF (BOM) μπροστά ώστε το Excel να διαβάζει σωστά τους ελληνικούς χαρακτήρες.
const downloadCsv = (filename, rows) => {
  const esc = (v) => { const s = String(v ?? ""); const needsQuotes = s.includes(",") || s.includes('"') || s.includes("\n") || s.includes(";"); return needsQuotes ? `"${s.split('"').join('""')}"` : s; };
  const csv = "\uFEFF" + rows.map(r => r.map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
};

// ---------- Ωράριο εργασίας για deadlines (09:15–17:00, Κυριακή μη εργάσιμη) ----------
const workDayStart = (d) => { const t = parseTime(SET.workStart, "09:15"); const x = new Date(d); x.setHours(t.h, t.m, 0, 0); return x; };
const workDayEnd = (d) => { const t = parseTime(SET.workEnd, "17:00"); const x = new Date(d); x.setHours(t.h, t.m, 0, 0); return x; };
const isNonWorkingDay = (d) => (Array.isArray(SET.nonWorkingDays) ? SET.nonWorkingDays : [0]).includes(d.getDay());
// Βρίσκει την πρώτη έγκυρη στιγμή εργασίας από τη δοσμένη στιγμή: αν είναι Κυριακή, πριν τις 09:15
// ή μετά τις 17:00, μεταφέρεται στις 09:15 της επόμενης εργάσιμης μέρας. Αλλιώς μένει όπως είναι.
const nextWorkMoment = (ms) => {
  let d = new Date(ms);
  for (let i = 0; i < 14; i++) {
    if (!isNonWorkingDay(d)) {
      const start = workDayStart(d), end = workDayEnd(d);
      if (d.getTime() < start.getTime()) return start;
      if (d.getTime() <= end.getTime()) return d;
    }
    d = workDayStart(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  }
  return d;
};
// Προσθέτει λεπτά δουλειάς ξεκινώντας από την πρώτη έγκυρη εργάσιμη στιγμή, με πλαφόν στις 17:00
// της ίδιας μέρας — το deadline δεν μπορεί ποτέ να προσπεράσει τις 17:00.
const addWorkMinutes = (baseMs, minutes) => {
  const start = nextWorkMoment(baseMs);
  const end = workDayEnd(start);
  const target = new Date(start.getTime() + minutes * 60000);
  return (target.getTime() > end.getTime() ? end : target).toISOString();
};

// ---------- Αποθήκευση ----------
async function load(key, fallback) {
  try { const r = await winStorage.get(key, true); return r ? JSON.parse(r.value) : fallback; }
  catch { return fallback; }
}
async function save(key, val) {
  try { await winStorage.set(key, JSON.stringify(val), true); } catch (e) { console.error("save", key, e); }
}

// Ασφαλής κανονικοποίηση: ό,τι corrupted/λάθος-σχήμα δεδομένο βρεθεί (object αντί για array, μη-string στοιχεία κλπ)
// μετατρέπεται ήσυχα στο ασφαλές fallback αντί να ρίξει crash το React render. Ποτέ δεν πετάει exception προς τα έξω.
// null/undefined περνάνε ΑΝΕΓΓΙΧΤΑ ώστε να ενεργοποιείται κανονικά η υπάρχουσα λογική seed (if (!x) {...}) — μόνο λάθος-σχήμα δεδομένα διορθώνονται εδώ, όχι απλή απουσία δεδομένων.
function asArray(x, fallback = []) {
  if (x === null || x === undefined) return x;
  return Array.isArray(x) ? x : fallback;
}
function asStringArray(x, fallback = []) {
  if (x === null || x === undefined) return x;
  if (!Array.isArray(x)) return fallback;
  return x.filter(it => typeof it === "string" && it.trim().length > 0);
}

// ---------- Δίχτυ ασφαλείας ----------
// Πιάνει σφάλματα μέσα στο κομμάτι που περιβάλλει, χωρίς να ρίξει όλη την εφαρμογή. Καταγράφει το σφάλμα μόνιμα
// (app-errorlog) με ακρίβεια ΠΟΥ έγινε, ώστε να μην χρειάζεται τυφλή διάγνωση αργότερα — απλά κοιτάμε τη λίστα.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) {
    const entry = {
      id: "err" + Date.now(), at: new Date().toISOString(), section: this.props.label || "άγνωστο",
      message: (error && error.message) || String(error),
      stack: ((error && error.stack) || "").split("\n").slice(0, 5).join("\n"),
      version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "",
    };
    load("app-errorlog", []).then(list => {
      const next = [entry, ...(Array.isArray(list) ? list : [])].slice(0, 50);
      save("app-errorlog", next);
    }).catch(() => {});
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "#FBEBE6", border: "1.5px solid #C0392B", borderRadius: 12, padding: 16, margin: "8px 0" }}>
          <div style={{ fontWeight: 700, color: "#8A2A1C", marginBottom: 4 }}>⚠️ Πρόβλημα σε: {this.props.label || "άγνωστο σημείο"}</div>
          <div style={{ fontSize: 13, color: "#8A2A1C", marginBottom: 8, whiteSpace: "pre-wrap" }}>{(this.state.error && this.state.error.message) || String(this.state.error)}</div>
          <div style={{ fontSize: 12, color: "#8A2A1C", marginBottom: 8 }}>Τα υπόλοιπα κομμάτια της εφαρμογής δουλεύουν κανονικά. Το σφάλμα καταγράφηκε — θα το δούμε στο Admin → Σφάλματα.</div>
          <button onClick={() => this.setState({ error: null })} style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#B5342A", color: "#fff", fontWeight: 700, fontSize: 13 }}>Δοκίμασε ξανά</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------- AI ----------
async function askClaude(prompt, maxTokens = 1000) {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, max_tokens: maxTokens }),
  });
  const data = await res.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

// ---------- Φωτογραφίες ----------
function compressImage(file, maxDim = (Number(SET.photoMaxDim) || 1280), quality = (Number(SET.photoQuality) || 0.72)) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => { img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
      else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("compress failed")), "image/jpeg", quality);
    }; img.onerror = reject; img.src = e.target.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadTaskPhotos(files, taskId) {
  if (!supabase || !files?.length) return [];
  const urls = [];
  for (const file of Array.from(files)) {
    try {
      const blob = await compressImage(file);
      const path = `${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await supabase.storage.from("task-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) continue;
      const { data } = supabase.storage.from("task-photos").getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    } catch {}
  }
  return urls;
}

// ---------- Κύρια εφαρμογή ----------
function AppInner() {
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState([]);
  const [boats, setBoats] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [quick, setQuick] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [closingChecklist, setClosingChecklist] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [absences, setAbsences] = useState([]);
  const [notes, setNotes] = useState([]);
  const [boatNotes, setBoatNotes] = useState([]);
  const [aiMemories, setAiMemories] = useState([]);
  const [me, setMe] = useState(null);
  const [viewAs, setViewAs] = useState(null);
  const [tab, setTab] = useState("today");
  const [adminSection, setAdminSection] = useState("overview");
  const [toast, setToast] = useState(null);
  const [tasksBoatFilter, setTasksBoatFilter] = useState("");
  const [cameFromOverview, setCameFromOverview] = useState(false);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  // Πλοήγηση από «Επισκόπηση» → «Εργασίες» με το σκάφος ήδη φιλτραρισμένο — σημειώνουμε ότι ήρθαμε από εκεί,
  // ώστε το κουμπί «πίσω» να μπορεί να μας γυρίσει ακριβώς στην Επισκόπηση, όχι στο γενικό «Σήμερα».
  const goToBoatTasks = (boatId) => { setTasksBoatFilter(boatId || ""); setCameFromOverview(true); setTab("tasks"); };
  // Όταν ο χρήστης πάει στις Εργασίες από το κάτω μενού, καθαρίζουμε τυχόν προηγούμενο φίλτρο σκάφους.
  // Όταν φεύγει από τη Διοίκηση, η υπο-ενότητά της επαναφέρεται πάντα στην «Επισκόπηση» — έτσι το «πίσω» είναι
  // πάντα προβλέψιμο (σταθερή ιεραρχία), όχι εξαρτημένο από το πώς έφτασε ο χρήστης εκεί (ιστορικό πλοήγησης).
  const selectTab = (id) => { if (id === "tasks") setTasksBoatFilter(""); if (id !== "admin") setAdminSection("overview"); setCameFromOverview(false); setTab(id); };
  // Κουμπί «‹ Πίσω»: πηγαίνει πάντα ένα σταθερό, προκαθορισμένο επίπεδο προς τα πίσω — ποτέ με βάση το browser
  // history — μέχρι να φτάσει στην πρώτη σελίδα («☀ Σήμερα»). Ιεραρχία: (αν ήρθαμε από Επισκόπηση) Εργασίες →
  // Επισκόπηση· αλλιώς υπο-ενότητα Διοίκησης → Επισκόπηση → Σήμερα → (αν είναι ενεργή η «Προβολή ως») έξοδος.
  const canGoBack = tab !== "today" || !!viewAs;
  const goBack = () => {
    if (tab === "tasks" && cameFromOverview) { setCameFromOverview(false); setTab("admin"); setAdminSection("overview"); return; }
    if (tab === "admin" && adminSection !== "overview") { setAdminSection("overview"); return; }
    if (tab !== "today") { setTab("today"); return; }
    if (viewAs) { setViewAs(null); return; }
  };

  // Καταχώρηση service worker — προϋπόθεση για εγκατάσταση στην αρχική οθόνη και (σε επόμενο βήμα) ειδοποιήσεις.
  // Ήσυχη αποτυχία αν δεν υποστηρίζεται (π.χ. παλιό browser) — δεν επηρεάζει καθόλου την υπόλοιπη εφαρμογή.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Φόρτωση
  useEffect(() => {
    (async () => {
      let [u, b, t, q, c, cc, ab, nt, bn, am, st] = await Promise.all([
        load("app-users", null), load("app-boats", null), load("app-tasks", null),
        load("app-quicktasks", null), load("app-checklist", null), load("app-closingchecklist", null), load("app-absences", null), load("app-notes", null), load("app-boatnotes", null), load("app-aimemories", null), load("app-settings", null),
      ]);
      // Ασφάλεια: αν κάποιο key έχει corrupted/λάθος-σχήμα δεδομένα (π.χ. object αντί για array, μη-string στοιχεία),
      // κανονικοποιείται ήσυχα εδώ πριν αγγίξει οποιοδήποτε .map/.filter/.some παρακάτω — never crash, self-heal.
      // Το null/undefined περνάει ανέγγιχτο ώστε να ενεργοποιηθεί η κανονική λογική seed (if (!x) {...}) παρακάτω.
      u = asArray(u); b = asArray(b); t = asArray(t);
      q = asStringArray(q); c = asStringArray(c); cc = asStringArray(cc);
      ab = asArray(ab); nt = asArray(nt); bn = asArray(bn); am = asArray(am);
      if (!u) { u = SEED_USERS; await save("app-users", u); }
      // Μετάβαση: προσθήκη προσωπικών κωδικών σε παλιούς χρήστες
      if (u.some(x => !x.code)) { u = u.map(x => x.code ? x : { ...x, code: genCode(x.name) }); await save("app-users", u); }
      // Μετάβαση v3: πλήρη προφίλ ομάδας (συμπληρώνονται μία φορά — μετά επεξεργάσιμα ελεύθερα)
      const PROFILES = {
        "Βασίλης": "Βασίλης (22): Πρόθυμος και συνεργάσιμος, ακολουθεί οδηγίες. Χωρίς εξειδίκευση — σε φάση εκμάθησης. Δυνατά σημεία: χειρωνακτικές και σωματικά απαιτητικές εργασίες (βιδώματα, μοντάρισμα, μεταφορές, βαριές δουλειές) — τις προτιμά και αποδίδει καλύτερα. Καθαρισμούς αναλαμβάνει κανονικά. Ιδανική ανάθεση: απλές, σαφώς ορισμένες εργασίες με συγκεκριμένες οδηγίες. Να αποφεύγονται: σύνθετες τεχνικές διαγνώσεις, εργασίες που απαιτούν αυτόνομο σχεδιασμό. Ποιότητα: χρειάζεται τακτικό έλεγχο ολοκληρώσεων. Συμπράξεις: ΜΠΑΛΑΝΤΕΡ — συνδυάζεται άνετα με οποιονδήποτε ως δεύτερο χέρι· πρώτη επιλογή όταν χρειάζεται βοηθός.",
        "Μήτσος": "Μήτσος (~25-27): Νέος στην εταιρεία με άριστα δείγματα. Εργατικός, αξιόπιστος, αυτόνομος — ολοκληρώνει σωστά, διπλοτσεκάρει, κρατά σημειώσεις. Εμπειρία μηχανικού αυτοκινήτων: δυνατός σε κινητήρες και μηχανολογικά. Ιδανική ανάθεση: μηχανολογικές/τεχνικές εργασίες κάθε δυσκολίας, εργασίες αυτονομίας και κρίσης, οργάνωση χώρων/εργαλείων/ανταλλακτικών. Προτεραιότητα ανάπτυξης: εργασίες που παραδοσιακά πάνε σε εξωτερικούς μηχανικούς — δοκιμάζει πρώτος πριν κληθεί εξωτερικός. Μπορεί να καθοδηγεί νεότερους/ξενόγλωσσους. Χαμηλή ανάγκη ελέγχου. Εργάζεται άνετα μόνος· σύμπραξη με Γιάννη επιτρεπτή ΜΟΝΟ ως ισότιμη (όχι σχέση επικεφαλής-βοηθού). Μελλοντικά: κεντρικό τεχνικό πρόσωπο βάσης.",
        "Γιάννης": "Γιάννης (~30+, 1+ έτος): Ευρεία τεχνική εμπειρία — χρήσιμος σε όλα τα τεχνικά: μηχανικά, ηλεκτρολογικά (ως έναν βαθμό, πρώτο σκαλί πριν Φανούρη/Αλέξανδρο), μηχανισμούς (bow thrusters, πλατφόρμες). Κανόνας: όταν υπάρχει τεχνική πίεση (αναχωρήσεις, σοβαρά ζητήματα) → προτεραιότητα σε τεχνικές εργασίες, οι καθαριότητες σε άλλους. Χωρίς τεχνική πίεση → συμμετέχει κανονικά και ισότιμα σε καθαρισμούς/τακτοποιήσεις/αγγαρείες — καμία μόνιμη εξαίρεση. Προσοχή: αυτοαναφορές αναξιόπιστες («δεν υπάρχει δουλειά» ενώ υπάρχουν διαθέσιμες)· τακτικός ποιοτικός έλεγχος με έμφαση σε πληρότητα και επιστροφή εργαλείων στη θέση τους. Δεν καθοδηγεί/συντονίζει άλλους. Συμπράξεις: με Βασίλη (πρώτη επιλογή) ή Μήτσο (ισότιμα). Όχι με Martin ή Δανάη.",
        "Δανάη": "Δανάη (νέα): Απόφοιτος ΑΣΚΤ (γλυπτική) — υψηλή κατασκευαστική ικανότητα: ηλεκτροκόλληση, κοπές, κατασκευές, ξυλουργικά, φινιρίσματα. Δίπλωμα skipper, προοπτική προς θάλασσα. Αξιόπιστη, πρόθυμη, επικοινωνιακή — ως νέα χρειάζεται καθοδήγηση και σαφείς οδηγίες. Ιδανική ανάθεση: (α) κατασκευαστικές εργασίες ακριβείας· (β) αισθητική αναβάθμιση σκαφών — γυαλίσματα, βαψίματα, στοκαρίσματα, ανακαινίσεις (προτεραιότητα σε περιόδους χαμηλού φόρτου — στρατηγικός λόγος ένταξής της). Καλοκαίρι: κανονική κάλυψη αναγκών βάσης. Συμπράξεις: καλή συνεργασία με Φανούρη, Μήτσο, Βασίλη, Martin· όχι με Γιάννη. Με Martin: λογική επιλογή για εργασίες αισθητικής φύσεως. Μέλος σχήματος έκτακτης εσωτερικής προετοιμασίας (με Νικόλ/Martin).",
        "Martin": "Martin (new): English-speaking (Czech — app language EN). Artist (painting, preparing for Fine Arts Academy) with high practical skill and inventiveness — past experience with boats and engines; can solve complex problems incl. some electrical. Assign tasks normally and fully. Main areas: (a) routine boat preparation — washing, cleaning, oils, closings; (b) artistic/aesthetic work — varnish removal/application, polishing, finishing, restoration (natural interest, high performance); (c) clearly defined technical tasks. Performance condition: task description must be fully clear and specific (what, where, expected result) — vague tasks block him. Motivation factor: excels on tasks that interest him; performance drops on indifferent ones. Completeness: knows procedures perfectly but often forgets steps when alone — his completions need regular completeness checks. Especially suited: long-duration tasks with gradual progress (boat renewals, varnish projects — «Progress» logging over days). Pairings: pleasant cooperation with Danai (shared artistic background) — good choice for aesthetic work, not an exclusive duo. NEVER under Giannis' coordination. Avoid multi-person tasks with many voices. Member of urgent interior-prep team (with Nikol/Danai).",
        "Φανούρης": "Φανούρης (Base Manager): Υψηλή αντιληπτική ικανότητα, πλήρης εικόνα βάσης — υπόβαθρο εμβιομηχανικής/μηχανικής. Απόλυτη αξιοπιστία: ό,τι δηλώνει ολοκληρωμένο, είναι. ΔΕΝ λαμβάνει αυτόματες αναθέσεις — επιλέγει μόνος. Φυσικό πεδίο: εργασίες υψηλής λεπτομέρειας και τεχνικής σκέψης — μηχανισμοί, πόμολα/κλειδαριές/παράθυρα, σχεδιασμός & 3D εκτύπωση εξαρτημάτων. ΚΡΙΣΙΜΕΣ ΛΕΠΤΟΔΟΥΛΕΙΕΣ (όπου πρόχειρη εκτέλεση = ζημιά, π.χ. στεγανοποίηση/λάστιχα παραθύρων): μαρκάρονται απευθείας ως εργασία Φανούρη — ΔΕΝ κατανέμονται σε άλλους. Ηλεκτρολογικά: ισχυρή αντίληψη — κλιμάκωση: Γιάννης → Φανούρης → Αλέξανδρος → εξωτερικός. Ωράριο μη συγχρονισμένο (μπορεί μεσημέρι-νύχτα) — η πρωινή κατανομή δεν τον προσμετρά. Αναθέτει, δίνει οδηγίες, σημείο τηλεφωνικής αναφοράς.",
        "Νικόλ": "Νικόλ: Σταθεροί δικοί της τομείς — ΕΚΤΟΣ αυτόματης κατανομής, λειτουργεί με δικό της πρόγραμμα. Πεδία: (α) INVENTORY LIST σκαφών προ αναχώρησης — πλήρης έλεγχος εξοπλισμού (σωσίβια, γκάζι, εργαλεία, τρόμπες κ.λπ.) — στο checklist αναχώρησης προ-ανατίθεται αυτόματα σε αυτήν· (β) εσωτερικοί καθαρισμοί/προετοιμασία σκαφών (όχι εξωτερικά πλυσίματα) — Σάββατα μαζί με εξωτερικές καθαρίστριες· (γ) επίβλεψη γραφείου/αποθήκης ανταλλακτικών — δίαυλος τροφοδοσίας βάσης με υλικά. Έκτακτες άμεσες προετοιμασίες (π.χ. ημερήσια εκδρομή): πάντα βασικό άτομο εσωτερικής ετοιμασίας, με ενίσχυση Δανάη ή/και Martin. Χειροκίνητη ανάθεση: μόνο εντός των πεδίων της.",
        "Λεωνίδας": "Λεωνίδας (~19-20, γιος ιδιοκτήτη): Ικανός, ευφυής — προετοιμάζεται για μελλοντική διεύθυνση βάσης. Χωρίς ωράριο/πρόγραμμα — παρών, βοηθά, μαθαίνει. ΕΚΤΟΣ AI κατανομής και εργασιών ρουτίνας — δεν του γεμίζει κανείς τον χρόνο. Χειροκίνητη ανάθεση όταν προκύπτει: (α) προμήθειες/αγορές — πρώτο άτομο για εξωτερικές διαδρομές αγοράς υλικών/ανταλλακτικών· (β) διαδρομές γραφείου/μεταφορές· (γ) check-out σκαφών — συμμετέχει συχνά· (δ) σημειακή βοήθεια. Δεν λογίζεται στα στατιστικά φόρτου.",
        "Αφροδίτη": "Αφροδίτη (γραμματεία): Δεξί χέρι της επιχείρησης — οικονομικά, επίβλεψη, υψηλός λόγος. Αναθέτει εργασίες, δεν λαμβάνει. Πρόσβαση manager για εποπτεία και ανάθεση.",
        "Αλέξανδρος": "Αλέξανδρος (ιδιοκτήτης): Πλήρης γνώση όλων των εργασιών — καμία δουλειά δεν τον σταματά (π.χ. δεξαμενές λυμάτων). Ισχυρά ηλεκτρολογικά. Κυρίως γραφείο, παρών σε δύσκολα — βρίσκει λύσεις όπου κολλάνε οι υπάλληλοι. ΚΑΝΟΝΑΣ ΚΛΙΜΑΚΩΣΗΣ: πριν οποιονδήποτε εξωτερικό συνεργάτη, εξαντλείται η φάση Αλέξανδρου (ιδίως ηλεκτρολογικά). Χωρίς αυτόματες αναθέσεις — εμπλέκεται με πρωτοβουλία/συνεννόηση.",
        "Νίκος": "Νίκος (συνιδιοκτήτης): Εξειδίκευση: επισκευές πλαστικών/πολυεστέρα (και για τρίτους), πανιά (μούδες, επισκευές), κατασκευαστικές λεπτομέρειες. Έμπειρος καπετάνιος. Ρόλος: τεχνικός γνωμοδότης — δεν του ανατίθενται εργασίες· σε ζητήματα πολυεστέρα/πανιών/κατασκευών, οι αναθέσεις σε άλλους φέρουν οδηγία «συμβουλέψου τον κ. Νίκο για τον τρόπο». Τελικός λόγος σε κατασκευαστικά αδιέξοδα.",
      };
      // Μετάβαση v2: ρόλοι ομάδας
      if (!u.find(x => x.id === "u-afroditi")) {
        u = u.map(x => {
          if (x.id === "u-fanouris") return { ...x, role: "manager" };
          if (x.id === "u-nikol") return { ...x, noAutoAssign: true };
          return x;
        });
        u = [...u,
          { id: "u-afroditi", name: "Αφροδίτη", role: "manager", profile: "", code: "AFR-6208" },
          { id: "u-alexandros", name: "Αλέξανδρος", role: "manager", profile: "", code: "ALX-1573" },
          { id: "u-nikos", name: "Νίκος", role: "manager", profile: "", code: "NKS-7946" },
        ];
        await save("app-users", u);
      }
      // Μετάβαση v3 (μία φορά): πλήρη προφίλ ομάδας + ρυθμίσεις Λεωνίδα/Martin
      const v3done = await load("app-profiles-v3", false);
      if (!v3done) {
        u = u.map(x => {
          let nx = { ...x };
          if (PROFILES[x.name]) nx.profile = PROFILES[x.name];
          if (x.name === "Λεωνίδας") nx.noAutoAssign = true;
          if (x.name === "Martin") nx.lang = "en";
          return nx;
        });
        await save("app-users", u);
        await save("app-profiles-v3", true);
      }
      if (!b) { b = SEED_BOATS; await save("app-boats", b); }
      if (!t) { t = []; await save("app-tasks", t); }
      if (!q) { q = SEED_QUICK; await save("app-quicktasks", q); }
      if (!c) { c = SEED_CHECKLIST; await save("app-checklist", c); }
      if (!cc) { cc = SEED_CLOSING_CHECKLIST; await save("app-closingchecklist", cc); }
      // Μετάβαση v5 (μία φορά): ενημέρωση προφίλ Φανούρη — λαμβάνει πλέον στοχευμένες αναθέσεις
      const v5done = await load("app-fanouris-v5", false);
      if (!v5done) {
        u = u.map(x => x.name === "Φανούρης" ? { ...x, profile: PROFILES["Φανούρης"]
          .replace("ΔΕΝ λαμβάνει αυτόματες αναθέσεις — επιλέγει μόνος.", "Λαμβάνει αυτόματες αναθέσεις ΜΟΝΟ για εργασίες υψηλής προσοχής/υπευθυνότητας, και λίγες (1-2/ημέρα) — επιλέγει και μόνος του επιπλέον. Hatch/παράθυρα/πόρτες/λεπτοδουλειές: αυτόματα σε αυτόν.")
          .replace("Ωράριο μη συγχρονισμένο (μπορεί μεσημέρι-νύχτα) — η πρωινή κατανομή δεν τον προσμετρά.", "Ωράριο μη συγχρονισμένο (μπορεί μεσημέρι-νύχτα).") } : x);
        await save("app-users", u);
        await save("app-fanouris-v5", true);
      }
      // Μετάβαση v6 (μία φορά): ύφος χιούμορ ημερήσιου μηνύματος ανά άτομο
      const v6done = await load("app-humor-v6", false);
      if (!v6done) {
        const HUMOR = {
          "Βασίλης": "Τον φωνάζουμε Billy. Heavy roast με αγάπη: πειράγματα για το τι θα σπάσει σήμερα, τις αγγαρείες, την «τακτοποίηση» εργαλείων. ΜΟΝΙΜΟ running joke: ο Billy λέει καλημέρα στον Φανούρη και ο Φανούρης ΔΕΝ απαντάει ποτέ — ο Billy πιστεύει ότι ο Φανούρης τον μισεί. Παίξε με αυτό συχνά. Θρασύ-φιλικό, σαν κολλητοί.",
          "Γιάννης": "Πείραγμα με το ότι όλο λέει πως θα φύγει/παραιτηθεί και είναι πάντα εδώ: «πάλι εδώ; δεν παραιτήθηκες;», «μέρα Χ από την ανακοίνωση 'φεύγω'». Και αναφορές στα αγαπημένα του bow thrusters/τεχνικά. Συναδελφικό, όχι κακό.",
          "Μήτσος": "Σεβασμός με χαβαλέ: ο αξιόπιστος μηχανικός που όλοι ζητάνε, οι κινητήρες τον εμπιστεύονται. Κολακευτικό αλλά με πλάκα.",
          "Φανούρης": "Στεγνό, έξυπνο, minimal χιούμορ στα μέτρα του: τα deadline τον φοβούνται, τα λάστιχα ευθυγραμμίζονται μόνα τους. Καμία υπερβολή, κοφτό.",
          "Δανάη": "Καλλιτεχνικό, ζεστό: τα σκάφη ως γλυπτά που την περιμένουν, αναφορές σε τέχνη/δημιουργία. Ευγενικό με χαμόγελο.",
          "Martin": "In English. Light, friendly, artistic: the boats await his artistic touch, gentle humor. Warm and simple.",
          "Νικόλ": "Ευγενικό και ζεστό: χωρίς εκείνη κανένα σκάφος δεν φεύγει σωστά, η ψυχή της οργάνωσης. Απαλό χιούμορ.",
        };
        u = u.map(x => HUMOR[x.name] ? { ...x, humor: HUMOR[x.name] } : x);
        await save("app-users", u);
        await save("app-humor-v6", true);
      }
      // Μετάβαση v9 (μία φορά): η Αφροδίτη γίνεται Base Manager (υπεύθυνη ναύλων)
      const v9done = await load("app-roles-v9", false);
      if (!v9done) {
        u = u.map(x => (x.name || "").toLowerCase().replace(/ί/g, "ι").trim() === "αφροδιτη" ? { ...x, role: "manager" } : x);
        await save("app-users", u);
        await save("app-roles-v9", true);
      }
      // Μετάβαση v10 (μία φορά): ο "Owner" γίνεται "Εριόν"
      const v10done = await load("app-owner-rename-v10", false);
      if (!v10done) {
        u = u.map(x => x.role === "owner" && x.name === "Owner" ? { ...x, name: "Εριόν" } : x);
        await save("app-users", u);
        await save("app-owner-rename-v10", true);
      }
      // Μετάβαση v4 (μία φορά): εξαίρεση από στατιστικά/αξιολόγηση
      const v4done = await load("app-nostats-v4", false);
      if (!v4done) {
        const NOSTATS = ["Νικόλ", "Λεωνίδας", "Αλέξανδρος", "Νίκος", "Αφροδίτη"];
        u = u.map(x => NOSTATS.includes(x.name) ? { ...x, noStats: true } : x);
        await save("app-users", u);
        await save("app-nostats-v4", true);
      }
      // Μετάβαση v7: εύρωστη αντιστοίχιση ονομάτων για χειροκίνητα προστιθέμενους χρήστες (Martin/Λεωνίδας κ.λπ.)
      {
        const norm = (n) => (n || "").toLowerCase().trim()
          .replace(/ά/g, "α").replace(/έ/g, "ε").replace(/ή/g, "η").replace(/ί/g, "ι").replace(/ό/g, "ο").replace(/ύ/g, "υ").replace(/ώ/g, "ω");
        const ALIAS = { "martin": "Martin", "μαρτιν": "Martin", "λεωνιδας": "Λεωνίδας", "leonidas": "Λεωνίδας" };
        const HUM = { "Martin": "In English. Light, friendly, artistic: the boats await his artistic touch, gentle humor. Warm and simple." };
        let ch = false;
        u = u.map(x => {
          const canon = ALIAS[norm(x.name)];
          if (!canon) return x;
          let nx = { ...x };
          if (PROFILES[canon] && !(nx.profile || "").trim()) { nx.profile = PROFILES[canon]; ch = true; }
          if (canon === "Martin") {
            if (nx.lang !== "en") { nx.lang = "en"; ch = true; }
            if (!(nx.humor || "").trim() && HUM["Martin"]) { nx.humor = HUM["Martin"]; ch = true; }
          }
          if (canon === "Λεωνίδας") {
            if (!nx.noAutoAssign) { nx.noAutoAssign = true; ch = true; }
            if (!nx.noStats) { nx.noStats = true; ch = true; }
          }
          return nx;
        });
        if (!u.some(x => ALIAS[norm(x.name)] === "Martin")) {
          u = [...u, { id: "u-martin", name: "Martin", role: "employee", lang: "en", code: "MAR-4207", profile: PROFILES["Martin"], humor: HUM["Martin"] }];
          ch = true;
        }
        if (!u.some(x => ALIAS[norm(x.name)] === "Λεωνίδας")) {
          u = [...u, { id: "u-leonidas", name: "Λεωνίδας", role: "employee", code: "LEO-8153", profile: PROFILES["Λεωνίδας"], noAutoAssign: true, noStats: true }];
          ch = true;
        }
        if (ch) await save("app-users", u);
      }
      // Μετάβαση v8 (μία φορά): βαθμίδα «Στέλεχος» για Αφροδίτη, Νικόλ, Λεωνίδα · Νίκος/Αλέξανδρος managers
      const v8done = await load("app-roles-v8", false);
      if (!v8done) {
        const norm8 = (n) => (n || "").toLowerCase().replace(/ί/g, "ι").replace(/ό/g, "ο").trim();
        u = u.map(x => {
          const n = norm8(x.name);
          if (["αφροδιτη", "νικολ", "λεωνιδας", "leonidas", "afroditi", "nikol"].includes(n))
            return { ...x, role: "associate", noAutoAssign: true, noStats: true };
          return x;
        });
        await save("app-users", u);
        await save("app-roles-v8", true);
      }
      // Αυτόματη μετάβαση: αναχώρηση που έφτασε -> εν πλω. Επιστροφή που έφτασε -> στη βάση.
      let changed = false;
      b = b.map(x => {
        if (x.atSea && x.returnDate && x.returnDate <= todayStr()) { changed = true; return { ...x, atSea: false, returnDate: null }; }
        if (!x.atSea && x.departureDate && x.departureDate <= todayStr() && x.returnDate) { changed = true; return { ...x, atSea: true, departureDate: null }; }
        return x;
      });
      if (changed) await save("app-boats", b);
      if (!ab) { ab = []; await save("app-absences", ab); }
      if (!nt) { nt = []; await save("app-notes", nt); }
      if (!bn) { bn = []; await save("app-boatnotes", bn); }
      if (!am) { am = []; await save("app-aimemories", am); }
      setUsers(u); setBoats(b); setTasks(t); setQuick(q); setChecklist(c); setClosingChecklist(cc); setAbsences(ab); setNotes(nt); setBoatNotes(bn); setAiMemories(am);
      const merged = mergeSettings(st);
      SET = merged; setSettings(merged);
      setReady(true);
    })();
  }, []);

  const persistTasks = async (next) => { setTasks(next); await save("app-tasks", next); };
  const patchTask = (taskId, patch) => {
    setTasks(prev => {
      const next = prev.map(x => x.id === taskId ? { ...x, ...patch } : x);
      save("app-tasks", next);
      return next;
    });
  };
  const persistBoats = async (next) => { setBoats(next); await save("app-boats", next); };
  const persistUsers = async (next) => { setUsers(next); await save("app-users", next); };
  const persistQuick = async (next) => { setQuick(next); await save("app-quicktasks", next); };
  const persistChecklist = async (next) => { setChecklist(next); await save("app-checklist", next); };
  const persistClosingChecklist = async (next) => { setClosingChecklist(next); await save("app-closingchecklist", next); };
  const persistAbsences = async (next) => { setAbsences(next); await save("app-absences", next); };
  const persistNotes = async (next) => { setNotes(next); await save("app-notes", next); };

  // Εβδομαδιαίος κύκλος βάσης: Δευτέρα ξεκινά η εβδομάδα, Κυριακή δεν είναι εργάσιμη, Παρασκευή επιστρέφουν ναύλα και Σάββατο φεύγουν νέα — άρα Σάββατο προτεραιότητα στο κλείσιμο υπαρχουσών εργασιών, όχι σε άσχετες καινούργιες.
  const weekdayNote = () => {
    const day = new Date().getDay(); // 0=Κυρ, 6=Σάβ
    const names = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];
    let note = `Σήμερα είναι ${names[day]}. Η εβδομάδα της βάσης ξεκινάει Δευτέρα και τελειώνει Σάββατο· η Κυριακή δεν είναι εργάσιμη μέρα.`;
    if (day === 6) note += " ΣΗΜΑΝΤΙΚΟ: Σάββατο — τα σκάφη που επέστρεψαν Παρασκευή φεύγουν με νέο ναύλο σήμερα. ΠΡΟΤΕΡΑΙΟΤΗΤΑ στο κλείσιμο υπαρχουσών ανοιχτών εργασιών (ειδικά ό,τι σχετίζεται με ετοιμασία/καθαρισμό σκαφών για αναχώρηση) — ΟΧΙ σε άσχετες νέες εργασίες. Εξαίρεση: μεγάλες εργασίες με σταδιακή πρόοδο μπορούν σκόπιμα να μείνουν ανοιχτές.";
    return note;
  };

  // Νυχτερινή κατανομή AI: τρέχει στο πρώτο άνοιγμα κάθε νέας μέρας
  useEffect(() => {
    if (!ready || !me) return;
    (async () => {
      if (isNonWorkingDay(new Date())) return; // μη εργάσιμη μέρα — καμία κατανομή
      const meta = await load("app-meta", {});
      if (meta.lastDistribution === todayStr()) return;
      await save("app-meta", { ...meta, lastDistribution: todayStr() });
      // Κάθε κρίκος της αλυσίδας έχει δικό του διακόπτη — αν είναι κλειστός, απλώς προσπερνιέται.
      let freshTasks = tasks;
      if (settings.autoDistribution) freshTasks = await runDistribution(false);
      if (settings.autoDepartureChecklists) freshTasks = await activateDepartureChecklists(freshTasks);
      if (settings.autoLowLoadTasks) await generateAutoTasks(freshTasks);
    })();
  }, [ready, me]);

  const isAbsentOn = (userId, dateStr) => absences.some(a => a.userId === userId && a.from <= dateStr && dateStr <= a.to);

  const generateClosingChecks = async (tasksOverride) => {
    const src = tasksOverride || tasks;
    const today = todayStr();
    const inPort = boats.filter(b => !isBoatAway(b));
    if (!inPort.length) return;
    const alreadyBoatIds = new Set(src.filter(t => t.closingCheck && t.closingDate === today).map(t => t.boatId));
    const need = inPort.filter(b => !alreadyBoatIds.has(b.id));
    if (!need.length) return;
    const employees = users.filter(u => u.role === "employee" && !u.noAutoAssign && !isAbsentOn(u.id, today));
    if (!employees.length) return;
    const loadPer = Object.fromEntries(employees.map(e => [e.id, src.filter(x => x.assignedTo === e.id && x.status === "open").length]));
    const sorted = [...employees].sort((a, b) => loadPer[a.id] - loadPer[b.id]);
    const newTasks = need.map((b, i) => {
      const emp = sorted[i % sorted.length];
      return {
        id: "t" + Date.now() + "-cc" + i, status: "open", createdBy: "system", createdAt: new Date().toISOString(),
        progress: [], returns: 0, boatId: b.id, desc: `Κλείσιμο σκάφους ${b.name}`,
        assignedTo: emp.id, assignedBy: "auto-closing",
        closingCheck: true, closingDate: today,
        reminderList: closingChecklist,
      };
    });
    // Λειτουργική ενημέρωση + δεύτερος έλεγχος διπλοτύπων ΜΕΣΑ στην ενημέρωση: τρέχει παράλληλα με άλλες
    // αυτόματες ροές στο άνοιγμα — έτσι ούτε σβήνει τις αλλαγές τους, ούτε δημιουργεί διπλό κλείσιμο για ίδιο σκάφος.
    setTasks(cur => {
      const curBoatIds = new Set(cur.filter(t => t.closingCheck && t.closingDate === today).map(t => t.boatId));
      const fresh = newTasks.filter(t => !curBoatIds.has(t.boatId));
      if (!fresh.length) return cur;
      const nx = [...fresh, ...cur];
      save("app-tasks", nx);
      return nx;
    });
  };

  // Στις 19:00, ό,τι «Κλείσιμο σκάφους» δεν έχει ολοκληρωθεί ακόμα δεν πρέπει να μείνει κρεμασμένο μέχρι το πρωί —
  // ως το πρωί τα σκάφη έχουν ήδη ανοίξει κανονικά από τους υπαλλήλους, οπότε δεν έχει νόημα να εμφανίζεται πια.
  // Η εργασία «κλείνει» (παύει να είναι ανοιχτή), στέλνεται ενιαίο μήνυμα στους Base Managers ώστε να τηλεφωνήσουν
  // στον υπεύθυνο το ίδιο βράδυ, και καταγράφεται μόνιμη σημείωση στη μνήμη του AI για τον καθένα.
  const expireMissedClosings = async () => {
    const today = todayStr();
    const isPastEvening = new Date().getHours() >= (Number(SET.closingExpireHour) || 19);
    // Χθεσινά (ή παλαιότερα) ανοιχτά κλεισίματα λήγουν πάντα, ανεξαρτήτως ώρας — δεν έχει νόημα να περιμένουν
    // ως τις 19:00 της τρέχουσας μέρας. Το σημερινό κλείσιμο λήγει μόνο μετά τις 19:00, όπως πριν.
    const missed = tasks.filter(t => t.closingCheck && t.status === "open" && (t.closingDate < today || (t.closingDate === today && isPastEvening)));
    if (!missed.length) return;
    const boatName = (id) => boats.find(b => b.id === id)?.name || "σκάφος";
    const empName = (id) => users.find(u => u.id === id)?.name || "άγνωστος υπάλληλος";
    const managerIds = users.filter(u => u.role === "manager").map(u => u.id);
    if (managerIds.length) {
      const summary = missed.map(t => `${boatName(t.boatId)} (${empName(t.assignedTo)})`).join(" · ");
      await sendNote(managerIds, `⚠ Δεν έκλεισαν μέχρι τις ${String(Number(SET.closingExpireHour) || 19).padStart(2, "0")}:00 — χρειάζεται τηλεφώνημα: ${summary}`, "system", "closing-alert");
    }
    for (const t of missed) {
      await addAiMemory(`Ο/Η ${empName(t.assignedTo)} δεν ολοκλήρωσε το κλείσιμο του σκάφους ${boatName(t.boatId)} μέχρι τις ${String(Number(SET.closingExpireHour) || 19).padStart(2, "0")}:00 (${fmtDate(t.closingDate)}).`, "system");
    }
    const missedIds = new Set(missed.map(t => t.id));
    // Λειτουργική ενημέρωση: αυτή η συνάρτηση τρέχει στο άνοιγμα ΠΑΡΑΛΛΗΛΑ με την ημερήσια κατανομή/checklists —
    // με πλήρη αντικατάσταση της λίστας από το closure, όποια από τις δύο έγραφε τελευταία έσβηνε τις αλλαγές της άλλης.
    setTasks(cur => { const nx = cur.map(x => missedIds.has(x.id) ? { ...x, status: "expired", expiredAt: new Date().toISOString() } : x); save("app-tasks", nx); return nx; });
  };

  // Ελέγχοι κλεισίματος: εμφανίζονται αυτόματα μετά τις 15:30, μία φορά τη μέρα, στο πρώτο άνοιγμα της εφαρμογής μετά την ώρα αυτή —
  // ΜΟΝΟ όσο η λειτουργία είναι σε "auto". Σε "manual", ο έλεγχος γίνεται αποκλειστικά με το χειροκίνητο κουμπί στην Επισκόπηση.
  useEffect(() => {
    if (!ready || !me || settings.closingCheckMode === "manual") return;
    (async () => {
      const now = new Date();
      const t = parseTime(settings.closingCheckTime, "15:30");
      if (now.getHours() < t.h || (now.getHours() === t.h && now.getMinutes() < t.m)) return;
      const meta = await load("app-meta", {});
      if (meta.lastClosingCheck === todayStr()) return;
      await save("app-meta", { ...meta, lastClosingCheck: todayStr() });
      await generateClosingChecks();
    })();
  }, [ready, me, settings.closingCheckMode, settings.closingCheckTime]);

  // Ενημέρωση ρυθμίσεων: γράφει ταυτόχρονα στο React state (για το UI) και στο module-level SET (για τις
  // βοηθητικές συναρτήσεις εκτός components) — αλλιώς οι δύο θα ξέφευγαν μεταξύ τους μέχρι το επόμενο άνοιγμα.
  const updateSettings = async (patch) => {
    const next = mergeSettings({ ...settings, ...patch });
    SET = next; setSettings(next);
    await save("app-settings", next);
  };
  const resetSettings = async () => {
    SET = { ...DEFAULT_SETTINGS }; setSettings({ ...DEFAULT_SETTINGS });
    await save("app-settings", { ...DEFAULT_SETTINGS });
    showToast("Οι ρυθμίσεις επανήλθαν στις προεπιλογές");
  };

  // Λήξη ανοιχτών ελέγχων κλεισίματος: τρέχει σε κάθε άνοιγμα της εφαρμογής (η ίδια η συνάρτηση αποφασίζει τι
  // πρέπει να λήξει — χθεσινά πάντα, σημερινά μόνο μετά τις 19:00 — οπότε είναι ασφαλές να τρέχει επανειλημμένα).
  useEffect(() => {
    if (!ready || !me) return;
    expireMissedClosings();
  }, [ready, me]);

  async function runDistribution(manual) {
    const today = todayStr();
    const employees = users.filter(u => ((u.role === "employee" && !u.noAutoAssign) || u.name === "Φανούρης") && !isAbsentOn(u.id, today));
    const free = tasks.filter(t => t.status === "open" && !t.assignedTo);
    if (!employees.length || !free.length) { if (manual) showToast("Δεν υπάρχουν ελεύθερες εργασίες για κατανομή"); return tasks; }
    try {
      let rules = await load("app-dist-rules", [
        "Ο Γιάννης ΔΕΝ αναλαμβάνει ΠΟΤΕ εργασίες στο σκάφος Sunflower — μην του ανατεθεί καμία εργασία αυτού του σκάφους.",
        "Εργασίες του σκάφους Sunflower: ανατίθενται κατά προτεραιότητα στον Martin.",
      ]);
      const FAN_RULES = [
        "Ο Φανούρης ΛΑΜΒΑΝΕΙ αναθέσεις, αλλά ΜΟΝΟ εργασίες που απαιτούν υψηλή προσοχή, ακρίβεια και υπευθυνότητα — και ΛΙΓΕΣ (το πολύ 1-2 την ημέρα), γιατί επιλέγει και μόνος του επιπλέον.",
        "Εργασίες σχετικές με hatch, παράθυρα, πόρτες, πόμολα, κλειδαριές, στεγανοποιήσεις και γενικά λεπτοδουλειές: ανατίθενται ΑΥΤΟΜΑΤΑ στον Φανούρη.",
      ];
      for (const fr of FAN_RULES) { if (!rules.some(r => r.includes(fr.slice(0, 30)))) rules = [...rules, fr]; }
      rules = rules.filter(r => !r.includes("πεδίο Φανούρη — δεν λαμβάνει αυτόματες αναθέσεις"));
      await save("app-dist-rules", rules);
      const boatName = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
      const loadPer = Object.fromEntries(employees.map(e => [e.id, tasks.filter(t => t.assignedTo === e.id && t.status === "open").length]));
      const prompt = `Είσαι σύστημα κατανομής εργασιών σε βάση σκαφών. Μοίρασε ΜΕΧΡΙ ${Number(SET.maxTasksPerEmployee) || 3} εργασίες ανά υπάλληλο για σήμερα από τις ελεύθερες, με βάση προφίλ, είδος εργασίας και δίκαιο φόρτο. Δεν χρειάζεται να ανατεθούν όλες.
${weekdayNote()}
ΑΠΑΡΑΒΑΤΟΙ ΕΙΔΙΚΟΙ ΚΑΝΟΝΕΣ:
${rules.map(r => "- " + r).join("\n")}
Υπάλληλοι: ${employees.map(e => `${e.id}: ${e.name} (τρέχων φόρτος: ${loadPer[e.id]}, προφίλ: ${e.profile || "χωρίς προφίλ"})`).join("; ")}
Ελεύθερες εργασίες: ${free.map(t => `${t.id}: "${t.desc}" [σκάφος: ${boatName(t.boatId)}${t.urgent ? ", ΕΠΕΙΓΟΝ" : ""}]`).join("; ")}
Απάντησε ΜΟΝΟ με JSON, χωρίς markdown: {"assignments":[{"taskId":"...","userId":"..."}]}`;
      const raw = await askClaude(prompt, 800);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (!parsed.assignments?.length) return tasks;
      const valid = parsed.assignments.filter(a => free.some(t => t.id === a.taskId) && employees.some(e => e.id === a.userId));
      if (!valid.length) return tasks;
      // Λειτουργική ενημέρωση: εφαρμόζει τις αναθέσεις μόνο σε εργασίες που είναι ΑΚΟΜΑ ανοιχτές και ελεύθερες
      // τη στιγμή της εγγραφής — δεν πατάει πάνω σε ό,τι άλλαξε παράλληλα (π.χ. λήξη κλεισιμάτων, χειροκίνητη ανάθεση).
      const byTaskId = Object.fromEntries(valid.map(v => [v.taskId, v.userId]));
      setTasks(cur => {
        const nx = cur.map(t => (byTaskId[t.id] && t.status === "open" && !t.assignedTo) ? { ...t, assignedTo: byTaskId[t.id], assignedBy: "AI" } : t);
        save("app-tasks", nx);
        return nx;
      });
      // Για την αλυσίδα (checklists/auto-tasks) επιστρέφεται η ίδια εικόνα υπολογισμένη από τα τρέχοντα δεδομένα —
      // χρησιμοποιείται μόνο για εκτίμηση φόρτου/διπλοτύπων, όπου μικρή απόκλιση δεν βλάπτει.
      const next = tasks.map(t => {
        const a = valid.find(v => v.taskId === t.id);
        return a ? { ...t, assignedTo: a.userId, assignedBy: "AI" } : t;
      });
      showToast(`Η κατανομή ημέρας έγινε: ${valid.length} αναθέσεις`);
      return next;
    } catch (e) { console.error(e); if (manual) showToast("Η κατανομή απέτυχε — δοκίμασε ξανά"); return tasks; }
  }

  const AUTO_TASK_TYPES = [
    "Τακτοποίηση βαν: όλα τα εργαλεία στη θέση τους, το λευκό κουτί με τις βίδες/ανταλλακτικά οργανωμένο, ό,τι έχει περισσέψει να επιστρέφει στο γραφείο. Πρωί, τουλάχιστον 1 ώρα, ΥΠΟΧΡΕΩΤΙΚΟ τουλάχιστον 1 φορά/εβδομάδα. Tone: αυστηρό αλλά με χιούμορ, ρητή αναφορά ότι είναι οδηγία του Εριόν.",
    "Τακτοποίηση αποθήκης/γραφείου: 1-2 άτομα πηγαίνουν στο γραφείο να οργανώσουν τον χώρο αποθήκευσης εργαλείων. ΠΡΕΠΕΙ να συμμετέχει τουλάχιστον ένας από Μήτσος/Φανούρης/Δανάη μαζί με άλλον.",
    "Πλύσιμο σκάφους που έχει καθίσει πολύ στο λιμάνι χωρίς ναύλο.",
    "Βαθύ καθάρισμα κρυφού σημείου σε συγκεκριμένο σκάφος (κάτω από ντουλάπια κουζίνας, μέσα σε σεντίνες, κάτω από μηχανοστάσιο, πίσω από κρεβάτια/καθίσματα) — 'δείξε τη δουλειά σου' τύπος, τουλάχιστον 1-2 ώρες, όχι πρόχειρα.",
    "Γυάλισμα/επιδιόρθωση λεπτομέρειας σε συγκεκριμένο σκάφος (ξύλο, βερνίκι, μεταλλικά στοιχεία, μούχλα σε λάστιχα/ταβάνι με χλωρίνη) — 'δείξε τη δουλειά σου' τύπος, λεπτή δουλειά με προσοχή, τουλάχιστον 1-2 ώρες.",
    "Περιποίηση μηχανισμών (Vigirello, γρανάζια): άνοιγμα, καθάρισμα με βενζίνη, γρασάρισμα, επανατοποθέτηση.",
    "Αποθηκευτικοί χώροι σκάφους (μπαλαούρα): άδειασμα, βαθύ καθάρισμα, έλεγχος φθορών, οργανωμένη επανατοποθέτηση.",
    "Περιποίηση εργαλείων βαν: WD-40 σε σκουριασμένα/κολλημένα εργαλεία λόγω αλμύρας.",
    "Λεύκανση/γυάλισμα μπαλονιών συγκεκριμένου σκάφους — να ασπρίσουν πραγματικά, όχι μόνο πλύσιμο με νερό (ειδικό γυαλιστικό, ρώτα Φανούρη/Αλέξανδρο αν χρειάζεται) — 'δείξε τη δουλειά σου' τύπος.",
    "ΕΝΤΟΠΙΣΕ ΤΟΥΛΑΧΙΣΤΟΝ 3 ΕΡΓΑΣΙΕΣ: πήγαινε σε συγκεκριμένο σκάφος (ή 2) στο λιμάνι και εντόπισε τουλάχιστον 3 σημεία/προβλήματα που θέλουν φτιάξιμο — πολύ συχνός τύπος, ανάθεσε σε όλους αρκετά τακτικά.",
  ];

  async function generateAutoTasks(tasksOverride) {
    const src = tasksOverride || tasks;
    const today = todayStr();
    const dow = new Date().getDay(); // 0=Κυρ, 6=Σάβ
    // Μέρες χωρίς νέες αυτόματες εργασίες (προεπιλογή: Κυριακή μη εργάσιμη· Σάββατο προτεραιότητα στο κλείσιμο υπαρχουσών).
    if ((Array.isArray(SET.noAutoTaskDays) ? SET.noAutoTaskDays : [0, 6]).includes(dow)) return;
    const employees = users.filter(u => u.role === "employee" && !u.noAutoAssign && !isAbsentOn(u.id, today));
    if (!employees.length) return;
    // Ρυθμός ουράς: αν υπάρχουν ήδη αρκετές ελεύθερες εργασίες σε αναμονή, μην προσθέσεις άλλες.
    const freeNow = src.filter(t => t.status === "open" && !t.assignedTo).length;
    const doneLast7d = src.filter(t => t.status === "done" && t.completedAt && (Date.now() - new Date(t.completedAt).getTime()) <= 7 * 24 * 60 * 60 * 1000).length;
    const avgDailyPace = Math.max(1, Math.round(doneLast7d / 7));
    if (freeNow >= avgDailyPace * 2) return; // η ουρά είναι ήδη αρκετά γεμάτη σε σχέση με τον ρυθμό ολοκλήρωσης
    // Ποιοι έχουν χαμηλό φόρτο σήμερα (0-1 ανοιχτές αναθέσεις);
    const loadPer = Object.fromEntries(employees.map(e => [e.id, src.filter(t => t.assignedTo === e.id && t.status === "open").length]));
    const lowLoad = employees.filter(e => loadPer[e.id] <= (Number(SET.lowLoadThreshold) ?? 1));
    if (!lowLoad.length) return;
    // Έλεγχος υποχρεωτικού βαν τουλάχιστον 1x/εβδομάδα
    const vanLast7d = src.some(t => t.autoType === "van" && t.createdAt && (Date.now() - new Date(t.createdAt).getTime()) <= 7 * 24 * 60 * 60 * 1000);
    // Πρώτα εξάντλησε εργασίες σε αναμονή (backlog) πριν επινοήσεις νέες — αυτές είχαν ήδη οριστεί από τον χρήστη για «όταν υπάρχει κενό».
    const backlog = src.filter(t => t.status === "backlog");
    const eligibleBacklog = backlog.filter(t => !t.scheduledFor || t.scheduledFor <= today);
    if (eligibleBacklog.length) {
      const toConvert = eligibleBacklog.slice(0, Math.min(lowLoad.length, Number(SET.maxBacklogConvert) || 3));
      const converted = toConvert.map((t, i) => {
        const preferred = t.preferredAssignee && lowLoad.some(e => e.id === t.preferredAssignee) ? t.preferredAssignee : lowLoad[i % lowLoad.length].id;
        return { ...t, status: "open", assignedTo: preferred, assignedBy: "AI-backlog", convertedAt: new Date().toISOString() };
      });
      // Λειτουργική ενημέρωση: μετατρέπει τα συγκεκριμένα backlog σε ανοιχτά χωρίς να πατά παράλληλες αλλαγές.
      const convById = Object.fromEntries(converted.map(c => [c.id, c]));
      setTasks(cur => {
        const nx = cur.map(x => (convById[x.id] && x.status === "backlog") ? convById[x.id] : x);
        save("app-tasks", nx);
        return nx;
      });
      return;
    }
    try {
      const inPort = boats.filter(b => !isBoatAway(b));
      // Πρόσφατο ιστορικό ανά σκάφος για να αποφευχθεί επανάληψη ίδιου σημείου
      const recentByBoat = Object.fromEntries(inPort.map(b => [b.id,
        src.filter(t => t.boatId === b.id && t.completedAt && (Date.now() - new Date(t.completedAt).getTime()) <= (Number(SET.boatHistoryDays) || 21) * 24 * 60 * 60 * 1000)
          .map(t => t.desc).slice(0, 8)
      ]));
      const prompt = `Είσαι σύστημα δημιουργίας εργασιών χαμηλού φόρτου για βάση σκαφών. ΣΗΜΕΡΑ υπάρχουν λίγες ελεύθερες εργασίες σε αναμονή, οπότε δημιούργησε 1-${Math.min(lowLoad.length, Number(SET.maxBacklogConvert) || 3)} ΝΕΕΣ, ΣΤΟΧΟΠΟΙΗΜΕΝΕΣ εργασίες, μία ανά υπάλληλο με χαμηλό φόρτο.
ΚΑΝΟΝΕΣ:
- Διάλεξε ΜΟΝΟ από τους παρακάτω εγκεκριμένους τύπους — ΜΗΝ επινοήσεις άλλο είδος εργασίας.
- Κάθε εργασία πρέπει να αναφέρει ΣΥΓΚΕΚΡΙΜΕΝΟ σκάφος (από τη λίστα «σκάφη στο λιμάνι») και ΣΥΓΚΕΚΡΙΜΕΝΟ σημείο/αντικείμενο, όχι γενικόλογη περιγραφή.
- Δες το πρόσφατο ιστορικό ανά σκάφος και ΑΠΕΦΥΓΕ να ξαναστείλεις κάποιον στο ίδιο ακριβώς σημείο που καθαρίστηκε πρόσφατα — προτίμησε άλλο τμήμα του σκάφους (πλώρη/σαλόνι/πίσω καμπίνες/εξωτερικός χώρος, εναλλάξ).
- Ανάφερε ρητά ελάχιστο χρόνο ενασχόλησης όπου αναγράφεται (π.χ. "τουλάχιστον 1 ώρα — όχι πρόχειρα"), ΟΧΙ σαν deadline.
- ${vanLast7d ? "Η τακτοποίηση βαν έχει ήδη γίνει αυτή την εβδομάδα — μην την ξαναβάλεις εκτός αν κρίνεις ότι όντως χρειάζεται." : "Η τακτοποίηση βαν ΔΕΝ έχει γίνει αυτή την εβδομάδα ακόμα — αν έχεις διαθέσιμο άτομο, δώσε ΠΡΟΤΕΡΑΙΟΤΗΤΑ σε αυτήν."}
- Αν εντοπίζεις μοτίβο επαναλαμβανόμενου προβλήματος σε κάποιο σκάφος μέσα στο ιστορικό, προτίμησε προληπτικό έλεγχο εκεί.
Υπάλληλοι με χαμηλό φόρτο: ${lowLoad.map(e => `${e.id}: ${e.name}`).join("; ")}
Σκάφη στο λιμάνι: ${inPort.map(b => `${b.id}: ${b.name}`).join("; ")}
Πρόσφατο ιστορικό ανά σκάφος (τελευταίες ${Number(SET.boatHistoryDays) || 21} μέρες): ${JSON.stringify(recentByBoat)}
Εγκεκριμένοι τύποι εργασιών:
${AUTO_TASK_TYPES.map((t, i) => `${i}: ${t}`).join("\n")}
Απάντησε ΜΟΝΟ με JSON, χωρίς markdown: {"tasks":[{"userId":"...","boatId":"...","typeIndex":0,"desc":"πλήρης περιγραφή στα ελληνικά, στοχοποιημένη","intensive":true/false,"findMode":true/false}]}
Βάλε intensive:true για τύπους «δείξε τη δουλειά σου» (καθάρισμα/γυάλισμα/λεύκανση). Βάλε findMode:true ΜΟΝΟ για τον τύπο «ΕΝΤΟΠΙΣΕ ΤΟΥΛΑΧΙΣΤΟΝ 3».`;
      const raw = await askClaude(prompt, 1200);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (!parsed.tasks?.length) return;
      const valid = parsed.tasks.filter(x => lowLoad.some(e => e.id === x.userId) && x.desc?.trim());
      if (!valid.length) return;
      const newTasks = valid.map(x => ({
        id: "t" + Date.now() + "-a" + Math.random().toString(36).slice(2, 6),
        status: "open", createdBy: "AI", createdAt: new Date().toISOString(),
        progress: [], returns: 0, photos: [],
        boatId: inPort.some(b => b.id === x.boatId) ? x.boatId : null, desc: x.desc.trim(),
        assignedTo: x.userId, assignedBy: "AI",
        autoGenerated: true, autoType: AUTO_TASK_TYPES[x.typeIndex]?.startsWith("Τακτοποίηση βαν") ? "van" : undefined,
        intensive: !!x.intensive,
        ...(x.findMode ? { findMode: true, findMin: 3, findings: [] } : {}),
      }));
      // Λειτουργική ενημέρωση: προσθέτει τις νέες εργασίες χωρίς να αντικαθιστά ολόκληρη τη λίστα από παλιό closure.
      setTasks(cur => { const nx = [...newTasks, ...cur]; save("app-tasks", nx); return nx; });
    } catch (e) { console.error("generateAutoTasks failed", e); }
  }

  // Αυτόματη είσοδος: από link#ΚΩΔΙΚΟΣ ή από αποθηκευμένο κωδικό συσκευής
  useEffect(() => {
    if (!ready || me) return;
    (async () => {
      const hashCode = (window.location.hash || "").replace("#", "").trim().toUpperCase();
      let code = hashCode;
      if (!code) {
        try { const r = await winStorage.get("my-code", false); code = r ? r.value : ""; } catch { code = ""; }
      }
      if (!code) return;
      const u = users.find(x => (x.code || "").toUpperCase() === code.toUpperCase());
      if (u) {
        setMe(u); setTab("today");
        try { await winStorage.set("my-code", u.code, false); } catch {}
      }
    })();
  }, [ready]);

  const logout = async () => {
    try { await winStorage.delete("my-code", false); } catch {}
    setMe(null); setViewAs(null); setTab("today"); setAdminSection("overview");
  };

  if (!ready) return <Center><div style={{ color: COLORS.sub }}>Φόρτωση…</div></Center>;
  if (!me) return <Login users={users} onPick={async (u) => {
    setMe(u); setTab("today");
    try { await winStorage.set("my-code", u.code, false); } catch {}
  }} />;

  const acting = viewAs || me;
  // Τα δικαιώματα (τι κουμπιά βλέπεις) βασίζονται πάντα στον πραγματικό συνδεδεμένο χρήστη, όχι στο άτομο
  // που τυχόν προβάλλεται μέσω «Προβολή ως» — έτσι ο manager διατηρεί πλήρη έλεγχο (ανάθεση/διαγραφή/deadline/
  // επείγον) πάνω σε ΚΑΘΕ εργασία που βλέπει, είτε καταχωρήθηκε χειροκίνητα είτε μπήκε αυτόματα από το AI.
  const isMgr = me.role === "manager" || me.role === "owner";
  const canAssign = isMgr || me.role === "associate";
  LANG = acting.lang === "en" ? "en" : "el";

  // ---------- Ενέργειες εργασιών ----------
  const addParsed = async (items) => {
    const now = Date.now();
    const fresh = items.map((it, i) => {
      const leo = it.purchase ? findLeonidas() : null;
      return {
        id: "t" + now + "-" + i, status: "open", createdBy: acting.id, createdAt: new Date(now + i).toISOString(),
        progress: [], returns: 0, assignedTo: leo ? leo.id : null, boatId: it.boatId || null, desc: it.desc, urgent: !!it.urgent, purchase: !!it.purchase, viaVoice: true,
        ...(leo ? { assignedBy: "auto-purchase" } : {}),
      };
    });
    await persistTasks([...fresh, ...tasks]);
    showToast(`Καταχωρήθηκαν ${fresh.length} εργασίες`);
    setCameFromOverview(false); setTab("tasks");
  };
  const addTasks = async (base, descs) => {
    const now = Date.now();
    const leo = (base.purchase && !base.backlog) ? findLeonidas() : null;
    const finalDescs = acting.lang === "en"
      ? await Promise.all(descs.map(async d => ({ el: await translateToGreek(d), en: d })))
      : descs.map(d => ({ el: d }));
    const fresh = finalDescs.map((d, i) => ({
      id: "t" + now + "-" + i, status: base.backlog ? "backlog" : "open", createdBy: acting.id, createdAt: new Date(now + i).toISOString(),
      progress: [], returns: 0, assignedTo: base.backlog ? null : (leo ? leo.id : (base.assignedTo || null)), boatId: base.boatId || null, desc: d.el, ...(d.en ? { descEn: d.en } : {}), urgent: !!base.urgent, purchase: !!base.purchase,
      ...(leo ? { assignedBy: "auto-purchase" } : {}),
    }));
    await persistTasks([...fresh, ...tasks]);
    showToast(base.backlog ? `Μπήκε σε αναμονή: ${fresh.length} εργασία/ίες` : `Καταχωρήθηκαν ${fresh.length} εργασίες`);
    setCameFromOverview(false); setTab("tasks");
  };
  const findLeonidas = () => users.find(x => ["λεωνιδας", "leonidas"].includes((x.name || "").toLowerCase().replace(/ί/g, "ι").trim()));
  const addTask = async (task, photoFiles) => {
    const leo = task.purchase ? findLeonidas() : null;
    const id = "t" + Date.now();
    let desc = task.desc, descEn;
    if (acting.lang === "en" && desc?.trim()) { descEn = desc.trim(); desc = await translateToGreek(desc); }
    const t = {
      id, status: "open", createdBy: acting.id, createdAt: new Date().toISOString(),
      progress: [], returns: 0, assignedTo: null, photos: [], ...task, desc, ...(descEn ? { descEn } : {}),
      ...(leo ? { assignedTo: leo.id, assignedBy: "auto-purchase" } : {}),
    };
    await persistTasks([t, ...tasks]);
    showToast("Η εργασία καταχωρήθηκε");
    setCameFromOverview(false); setTab("tasks");
    if (photoFiles?.length) {
      const urls = await uploadTaskPhotos(photoFiles, id);
      if (urls.length) setTasks(cur => { const nx = cur.map(x => x.id === id ? { ...x, photos: [...(x.photos || []), ...urls] } : x); save("app-tasks", nx); return nx; });
    }
  };
  const logFinding = async (findTask, desc) => {
    if (!desc?.trim()) return;
    const newId = "t" + Date.now() + "-f";
    let finalDesc = desc.trim(), descEn;
    if (acting.lang === "en") { descEn = finalDesc; finalDesc = await translateToGreek(finalDesc); }
    const newTask = {
      id: newId, status: "open", createdBy: acting.id, createdAt: new Date().toISOString(),
      progress: [], returns: 0, assignedTo: null, photos: [], boatId: findTask.boatId, desc: finalDesc, ...(descEn ? { descEn } : {}), foundVia: findTask.id,
    };
    const findings = [...(findTask.findings || []), { taskId: newId, desc: finalDesc, at: new Date().toISOString() }];
    await persistTasks([newTask, ...tasks.map(x => x.id === findTask.id ? { ...x, findings } : x)]);
    showToast(`Καταχωρήθηκε (${findings.length}/${findTask.findMin || 3})`);
  };
  // Το βιβλίο service κρατιέται ΑΚΡΙΒΩΣ όπως το βιβλίο service ενός αυτοκινήτου: δεν καταγράφεται ό,τι συμβαίνει,
  // μόνο ουσιαστικές επεμβάσεις συντήρησης/επισκευής που αξίζει να θυμάται κανείς στο μέλλον. Η απόφαση βασίζεται
  // ΑΠΟΚΛΕΙΣΤΙΚΑ σε τι ΠΡΑΓΜΑΤΙΚΑ έγινε (η λύση), όχι στο αρχικό πρόβλημα — το ίδιο πρόβλημα μπορεί να λυθεί με μια
  // ασήμαντη ενέργεια (δεν μπαίνει) ή με ουσιαστική επέμβαση (μπαίνει), οπότε μόνο η λύση κρίνει.
  const classifyServiceRelevance = async (t, resolutionText) => {
    const resolution = (resolutionText || "").trim();
    if (!resolution) return; // χωρίς περιγραφή του τι έγινε δεν κρίνεται ουσιαστικά — μένει εκτός service book
    try {
      const prompt = `Είσαι βοηθός βάσης σκαφών και κρατάς το βιβλίο service ενός σκάφους ακριβώς όπως το βιβλίο service ενός αυτοκινήτου: δεν καταγράφεται ό,τι συμβαίνει, μόνο πραγματικές, ουσιαστικές επεμβάσεις συντήρησης/επισκευής με αξία να θυμάται κανείς στο μέλλον, σαν ιστορικό με ημερομηνία.
Η απόφαση βασίζεται ΑΠΟΚΛΕΙΣΤΙΚΑ σε τι ΠΡΑΓΜΑΤΙΚΑ έγινε (η λύση/επέμβαση) — όχι στο αρχικό πρόβλημα. Το κριτήριο είναι πόσο ουσιαστική/σημαντική ήταν η ίδια η επέμβαση, όχι αν έγινε κάποια συγκεκριμένη ενέργεια όπως «άνοιγμα» ή «αλλαγή» — μια μικρή επέμβαση σε κάτι μικρό/απλό δεν είναι service, εκτός αν έχει πραγματικό νόημα και αξία.
Ενδεικτικά παραδείγματα βαθμονόμησης (ΟΧΙ σταθεροί κανόνες, μόνο για να καταλάβεις το επίπεδο):
- Ξεβούλωμα τουαλέτας → ΟΧΙ service (απλή, περαστική ενέργεια).
- Αλλαγή μοτέρ τουαλέτας → ΝΑΙ service (ουσιαστική επισκευή/ανταλλακτικό).
- Σφίξιμο/προσθήκη 1-2 βιδών σε εργάτη άγκυρας → ΟΧΙ service (ασήμαντο, ακόμα κι αν χρειάστηκε να ανοιχτεί κάτι).
- Άνοιγμα εργάτη άγκυρας, γρασάρισμα εσωτερικά, επανασυναρμολόγηση → ΝΑΙ service (ουσιαστική συντήρηση με αξία στο μέλλον).
- Έλεγχος που απλά επιβεβαίωσε ότι κάτι δουλεύει κανονικά, χωρίς καμία επέμβαση → ΟΧΙ service.
ΑΡΧΙΚΟ ΠΡΟΒΛΗΜΑ (μόνο για πλαίσιο — ΔΕΝ καθορίζει την απόφαση): "${t.desc}"
ΤΙ ΕΓΙΝΕ ΠΡΑΓΜΑΤΙΚΑ (αυτό καθορίζει την απόφαση): "${resolution}"
Απάντησε ΜΟΝΟ με "yes" ή "no", τίποτα άλλο.`;
      const raw = await askClaude(prompt, 10);
      patchTask(t.id, { serviceRelevant: /yes/i.test(raw) });
    } catch { /* ταξινόμηση απέτυχε — η εργασία απλά δεν εμφανίζεται στο βιβλίο service, δεν χάνεται τίποτα */ }
  };
  const completeTask = async (t, attributedTo, afterPhotoFiles, confidence, note) => {
    const finalBy = attributedTo || acting.id;
    let afterUrls = [];
    if (afterPhotoFiles?.length) {
      try { afterUrls = await uploadTaskPhotos(afterPhotoFiles, t.id); } catch {}
    }
    let cleanNote = (note || "").trim();
    let cleanNoteEn;
    if (acting.lang === "en" && cleanNote) { cleanNoteEn = cleanNote; cleanNote = await translateToGreek(cleanNote); }
    // Λειτουργική ενημέρωση (setTasks(cur => ...)) αντί για ανάγνωση του tasks από το closure — απαραίτητο για
    // την «Ολοκλήρωση με φωνή» που μπορεί να ολοκληρώσει 2+ εργασίες μαζί: με το παλιό persistTasks(tasks.map(...))
    // κάθε κλήση διάβαζε την ίδια παλιά λίστα και έσβηνε την προηγούμενη ολοκλήρωση (ίδιο bug με τη μαζική διαγραφή).
    setTasks(cur => {
      const nx = cur.map(x => x.id === t.id ? {
        ...x, status: "done", completedBy: finalBy, completedByActor: acting.id, completedAt: new Date().toISOString(),
        ...(confidence ? { completionConfidence: confidence } : {}),
        ...(afterUrls.length ? { photosAfter: [...(x.photosAfter || []), ...afterUrls] } : {}),
        ...(cleanNote ? { completionNote: cleanNote } : {}),
        ...(cleanNoteEn ? { completionNoteEn: cleanNoteEn } : {}),
      } : x);
      save("app-tasks", nx);
      return nx;
    });
    showToast("Ολοκληρώθηκε ✔");
    classifyServiceRelevance(t, cleanNote);
    // Η επιλογή «τέλεια / με επιφυλάξεις» τροφοδοτεί αυτόματα το ίδιο χρονολόγιο παρατηρήσεων που βλέπει το AI
    // στο προφίλ του σκάφους — χωρίς να χρειάζεται κανείς να το ξαναγράψει χειροκίνητα.
    if (confidence && t.boatId) {
      const text = confidence === "good"
        ? `🟢 "${t.desc}" — ολοκληρώθηκε, δούλευε τέλεια κατά τον έλεγχο`
        : `🟡 "${t.desc}" — ολοκληρώθηκε, αλλά με επιφυλάξεις για την ποιότητα/διάρκεια`;
      addBoatNote(t.boatId, text);
    }
    // Το υποχρεωτικό «τι είχε/τι έκανες» κάθε ολοκλήρωσης → καταγράφεται μόνιμα στη μνήμη του AI (και στο ιστορικό
    // του σκάφους, αν υπάρχει) ώστε ο βοηθός AI να θυμάται τι έχει συμβεί και πώς λύθηκε, χωρίς χειροκίνητη καταχώρηση.
    if (cleanNote) {
      const boatName = t.boatId ? (boats.find(b => b.id === t.boatId)?.name || "") : "";
      const memText = `📝 ${boatName ? boatName + " — " : ""}"${t.desc}" — ${cleanNote}`;
      await addAiMemory(memText);
      if (t.boatId) addBoatNote(t.boatId, memText);
    }
  };
  const addBeforePhotos = async (t, files) => {
    if (!files?.length) return;
    const urls = await uploadTaskPhotos(files, t.id);
    if (urls.length) await persistTasks(tasks.map(x => x.id === t.id ? { ...x, photosBefore: [...(x.photosBefore || []), ...urls] } : x));
  };
  const externalTask = async (t, note) => {
    const finalNote = (acting.lang === "en" && note?.trim()) ? await translateToGreek(note) : note;
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, status: "external", externalBy: acting.id, externalAt: new Date().toISOString(), externalNote: finalNote } : x));
    showToast("Καταγράφηκε: χρειάζεται εξωτερικό συνεργάτη ⚠");
  };
  const acknowledgeExternal = async (t) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, ackBy: { ...(x.ackBy || {}), [acting.id]: new Date().toISOString() } } : x));
  };
  const addProgress = async (t, note, photoFiles) => {
    let urls = [];
    if (photoFiles?.length) { try { urls = await uploadTaskPhotos(photoFiles, t.id); } catch {} }
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, progress: [...x.progress, { by: acting.id, at: new Date().toISOString(), note, ...(urls.length ? { photos: urls } : {}) }] } : x));
    showToast("Η πρόοδος καταγράφηκε");
  };
  const returnTask = async (t, note) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, status: "open", assignedTo: x.completedBy, returns: (x.returns || 0) + 1, returnNote: note, returnedAt: new Date().toISOString() } : x));
    showToast("Η εργασία επιστράφηκε ως ατελής");
  };
  const rateTask = async (t, rating) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, rating, ratedBy: acting.id, ratedAt: new Date().toISOString() } : x));
    showToast("Η αξιολόγηση καταχωρήθηκε");
  };
  const closeExternal = async (t, note) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, status: "done", completedBy: acting.id, completedAt: new Date().toISOString(), closedAsExternal: true, externalCloseNote: note } : x));
    showToast("Έκλεισε (εξωτερικός συνεργάτης) ✔");
    classifyServiceRelevance(t, note);
  };
  const toggleServiceRelevant = (t) => patchTask(t.id, { serviceRelevant: !t.serviceRelevant });
  const toggleUrgent = async (t) => {
    const next = !t.urgent;
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, urgent: next, ...(next ? { upgradedBy: acting.id } : { downgradedBy: acting.id }) } : x));
    showToast(next ? "Μαρκαρίστηκε ως επείγον 🔴" : "Υποβαθμίστηκε σε κανονική");
  };
  // Η διαγραφή είναι πλέον «μαλακή»: η εργασία μένει στη βάση με status="deleted" (κρατάει και την προηγούμενη
  // κατάστασή της σε prevStatus, ώστε η επαναφορά να την ξαναβάλει ακριβώς εκεί που ήταν) και εξαφανίζεται από
  // όλες τις κανονικές λίστες (καμία από αυτές δεν ψάχνει status="deleted"). Ορατή μόνο στον «Κάδο» της Διοίκησης.
  const deleteTask = async (t) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, prevStatus: x.status, status: "deleted", deletedBy: acting.id, deletedAt: new Date().toISOString() } : x));
    showToast("Μετακινήθηκε στον κάδο — μπορεί να επαναφερθεί από τη Διοίκηση");
  };
  // Μαζική διαγραφή: ΜΙΑ μόνο ενημέρωση για όλες μαζί, όχι πολλές ξεχωριστές. Καλώντας deleteTask() σε βρόχο για
  // κάθε εργασία, κάθε κλήση διάβαζε το ίδιο «παλιό» tasks από το closure και έγραφε πάνω από την προηγούμενη —
  // αποτέλεσμα να «επιβιώνει» μόνο η τελευταία διαγραφή. Έτσι διαγράφονται όλες μαζί, σωστά.
  const deleteTasks = async (taskList) => {
    const ids = new Set(taskList.map(t => t.id));
    if (!ids.size) return;
    await persistTasks(tasks.map(x => ids.has(x.id) ? { ...x, prevStatus: x.status, status: "deleted", deletedBy: acting.id, deletedAt: new Date().toISOString() } : x));
    showToast(`${ids.size} εργασίες μετακινήθηκαν στον κάδο`);
  };
  const restoreTask = async (t) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, status: x.prevStatus || "open", prevStatus: undefined, deletedBy: undefined, deletedAt: undefined } : x));
    showToast("Η εργασία επαναφέρθηκε");
  };
  const editTask = async (t, desc) => {
    let finalDesc = desc, descEn = null;
    if (acting.lang === "en" && desc?.trim()) { descEn = desc.trim(); finalDesc = await translateToGreek(desc); }
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, desc: finalDesc, editedBy: acting.id, editedAt: new Date().toISOString(), descEn } : x));
    showToast("Η εργασία διορθώθηκε");
  };
  // Μετάφραση περιγραφής εργασίας στα αγγλικά (για χρήστες με lang="en", π.χ. Martin) — γίνεται μία φορά και μένει cached στην εργασία
  const translateTask = async (t) => {
    if (!t?.desc || t.descEn || t.translating) return;
    setTasks(cur => cur.map(x => x.id === t.id ? { ...x, translating: true } : x));
    try {
      const out = await askClaude(`Translate the following boat-maintenance task description from Greek to English. Reply with ONLY the translation, no quotes, no explanation:\n\n${t.desc}`, 150);
      const clean = (out || "").trim().replace(/^"|"$/g, "");
      setTasks(cur => { const nx = cur.map(x => x.id === t.id ? { ...x, descEn: clean || t.desc, translating: false } : x); save("app-tasks", nx); return nx; });
    } catch {
      setTasks(cur => cur.map(x => x.id === t.id ? { ...x, translating: false } : x));
    }
  };
  // Μετάφραση ελεύθερου κειμένου ΠΡΟΣ τα ελληνικά (για χρήστες με lang="en", π.χ. Martin, όταν γράφουν οι ίδιοι κάτι) —
  // η βάση κρατάει πάντα το κύριο κείμενο (περιγραφή εργασίας, σημείωση ολοκλήρωσης, εύρημα) στα ελληνικά, ώστε να είναι
  // ενιαία αναζητήσιμο και κατανοητό από όλη την ομάδα, το Service Book και τη μνήμη του AI. Αν η μετάφραση αποτύχει,
  // επιστρέφεται το πρωτότυπο κείμενο αμετάβλητο, ώστε να μη χαθεί ποτέ καταχώρηση.
  const translateToGreek = async (text) => {
    const clean = (text || "").trim();
    if (!clean) return clean;
    try {
      const out = await askClaude(`Translate the following boat-maintenance related text from English to Greek. Reply with ONLY the translation, no quotes, no explanation:\n\n${clean}`, 200);
      return (out || "").trim().replace(/^"|"$/g, "") || clean;
    } catch { return clean; }
  };
  // "💡 Βοήθεια": φιλτράρει ΤΟΠΙΚΑ (χωρίς AI) το ιστορικό για ό,τι μοιάζει με το τρέχον πρόβλημα — ίδιο σκάφος ή κοινές λέξεις-
  // κλειδιά — και δίνει μόνο τα πιο σχετικά 6-10 περιστατικά στο AI. Έτσι μένει γρήγορο και φθηνό ό,τι κι αν μεγαλώσει η βάση.
  const STOP_WORDS = new Set(["και", "του", "της", "το", "τα", "με", "για", "στο", "στη", "στον", "στην", "από", "είναι", "να", "σε", "μια", "ένα", "που", "δεν", "ή", "αλλά", "αυτό", "αυτή", "θα", "έχει", "τον", "την"]);
  const getTaskHelp = async (t, extra) => {
    try {
      const extraText = (extra || "").trim();
      const boatName = t.boatId ? (boats.find(b => b.id === t.boatId)?.name || "") : "";
      const combinedText = `${t.desc || ""} ${extraText}`;
      const words = combinedText.toLowerCase().split(/[^a-zά-ωΐάέήίόύώ0-9]+/i).filter(w => w.length > 2 && !STOP_WORDS.has(w));
      const scoreText = (txt) => { const low = (txt || "").toLowerCase(); return words.reduce((s, w) => s + (low.includes(w) ? 1 : 0), 0); };
      const past = tasks
        .filter(x => x.id !== t.id && (x.completionNote || x.problemDesc || x.problemSolution))
        .map(x => ({ x, score: (x.boatId === t.boatId ? 2 : 0) + scoreText(x.desc) + scoreText(x.completionNote) + scoreText(x.problemDesc) + scoreText(x.problemSolution) }))
        .filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
      const mems = aiMemories
        .map(m => ({ m, score: scoreText(m.text) }))
        .filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
      const histLines = [
        ...past.map(({ x }) => `- [${boats.find(b => b.id === x.boatId)?.name || "Βάση"}] "${x.desc}" — ${x.completionNote || `Πρόβλημα: ${x.problemDesc || "-"} · Λύση: ${x.problemSolution || "-"}`}`),
        ...mems.map(({ m }) => `- ${m.text}`),
      ].join("\n") || "(κανένα σχετικό ιστορικό ακόμα)";
      const prompt = `Είσαι έμπειρος τεχνικός σε βάση yacht charter (σκάφη ιστιοπλοΐας/μηχανοκίνητα). Ένας εργαζόμενος αντιμετωπίζει πρόβλημα σε εργασία${boatName ? ` στο σκάφος "${boatName}"` : ""}: "${t.desc}".${extraText ? `
ΕΠΙΠΛΕΟΝ ΣΥΜΠΤΩΜΑΤΑ / ΛΕΠΤΟΜΕΡΕΙΕΣ ΠΟΥ ΕΔΩΣΕ Ο ΕΡΓΑΖΟΜΕΝΟΣ: "${extraText}"` : ""}
ΣΧΕΤΙΚΟ ΙΣΤΟΡΙΚΟ ΑΠΟ ΤΗ ΒΑΣΗ (προηγούμενα παρόμοια προβλήματα/λύσεις, αν υπάρχουν):
${histLines}
Δώσε ΣΥΝΤΟΜΗ πρακτική πρόταση λύσης (2-4 προτάσεις)${extraText ? ", προσαρμοσμένη ειδικά στα συμπτώματα που περιγράφηκαν" : ""}. Αν το ιστορικό δείχνει τι δούλεψε ξανά σε παρόμοιο πρόβλημα, ανάφερέ το ΠΡΩΤΟ και ρητά. Αν δεν υπάρχει σχετικό ιστορικό, χρησιμοποίησε τη γενική τεχνική σου γνώση για σκάφη/θαλάσσιο εξοπλισμό. Μίλα απευθείας, χωρίς εισαγωγικές φράσεις τύπου "Ορίστε η πρόταση".`;
      const raw = await askClaude(prompt, 350);
      return (raw || "").trim() || null;
    } catch {
      return null;
    }
  };
  const setTaskDeadline = async (t, isoDeadline) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, manualDeadline: isoDeadline, deadlineSetBy: acting.id } : x));
    showToast(isoDeadline ? "Το deadline ορίστηκε" : "Το deadline αφαιρέθηκε");
  };
  const setTaskDeadlineByDuration = async (t, minutes) => {
    let base = Date.now();
    if (t.assignedTo) {
      const queueEnd = tasks
        .filter(x => x.id !== t.id && x.assignedTo === t.assignedTo && x.status === "open" && x.manualDeadline)
        .reduce((max, x) => Math.max(max, new Date(x.manualDeadline).getTime()), 0);
      if (queueEnd > base) base = queueEnd;
    }
    const iso = addWorkMinutes(base, minutes);
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, manualDeadline: iso, deadlineSetBy: acting.id } : x));
    showToast(`Το deadline ορίστηκε: έως ${fmtTime(iso)}`);
  };
  const assignTask = async (t, userId) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, assignedTo: userId || null, assignedBy: acting.id } : x));
    showToast(userId ? "Ανατέθηκε" : "Έγινε ελεύθερη");
  };
  const assignTaskWithDeadline = async (t, userId, minutes) => {
    const patch = { assignedTo: userId || null, assignedBy: acting.id };
    if (userId && minutes) {
      let base = Date.now();
      const queueEnd = tasks
        .filter(x => x.id !== t.id && x.assignedTo === userId && x.status === "open" && x.manualDeadline)
        .reduce((max, x) => Math.max(max, new Date(x.manualDeadline).getTime()), 0);
      if (queueEnd > base) base = queueEnd;
      patch.manualDeadline = addWorkMinutes(base, Number(minutes));
      patch.deadlineSetBy = acting.id;
    }
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, ...patch } : x));
    showToast(userId ? (patch.manualDeadline ? `Ανατέθηκε — έως ${fmtTime(patch.manualDeadline)}` : "Ανατέθηκε") : "Έγινε ελεύθερη");
  };

  const addAbsence = async (userId, from, to, note) => {
    const a = { id: "ab" + Date.now(), userId, from, to, note: note || "", addedBy: acting.id, addedAt: new Date().toISOString() };
    await persistAbsences([a, ...absences]);
    showToast("Η απουσία καταχωρήθηκε");
  };
  const deleteAbsence = async (id) => {
    await persistAbsences(absences.filter(a => a.id !== id));
    showToast("Η απουσία διαγράφηκε");
  };

  const sendNote = async (recipientIds, text, fromOverride, kind) => {
    const n = { id: "n" + Date.now(), from: fromOverride || acting.id, to: recipientIds, text, at: new Date().toISOString(), ...(kind ? { kind } : {}) };
    await persistNotes([n, ...notes]);
    if (!fromOverride) showToast("Το μήνυμα στάλθηκε");
  };
  const deleteNote = async (id) => {
    await persistNotes(notes.filter(n => n.id !== id));
    showToast("Το μήνυμα διαγράφηκε");
  };
  const persistBoatNotes = async (next) => { setBoatNotes(next); await save("app-boatnotes", next); };
  const addBoatNote = async (boatId, text, photoFiles) => {
    const id = "bn" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    let urls = [];
    if (photoFiles?.length) { try { urls = await uploadTaskPhotos(photoFiles, id); } catch {} }
    const n = { id, boatId, text, by: acting.id, at: new Date().toISOString(), ...(urls.length ? { photos: urls } : {}) };
    // Λειτουργική ενημέρωση: το completeTask μπορεί να προσθέσει 2 σημειώσεις διαδοχικά (επιλογή ποιότητας +
    // σημείωση ολοκλήρωσης) — με ανάγνωση του boatNotes από το closure η δεύτερη έσβηνε την πρώτη.
    setBoatNotes(cur => { const nx = [n, ...cur]; save("app-boatnotes", nx); return nx; });
    showToast("Η παρατήρηση καταχωρήθηκε");
  };
  const deleteBoatNote = async (id) => {
    await persistBoatNotes(boatNotes.filter(n => n.id !== id));
    showToast("Η παρατήρηση διαγράφηκε");
  };
  const persistAiMemories = async (next) => { setAiMemories(next); await save("app-aimemories", next); };
  const addAiMemory = async (text, byOverride) => {
    const m = { id: "am" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), text, at: new Date().toISOString(), by: byOverride || acting.id };
    // Λειτουργική ενημέρωση: όταν καταγράφονται πολλές μνήμες στη σειρά (π.χ. πολλά χαμένα κλεισίματα, ή πολλές
    // ολοκληρώσεις με φωνή), με ανάγνωση του aiMemories από το closure επιβίωνε μόνο η τελευταία.
    setAiMemories(cur => { const nx = [m, ...cur]; save("app-aimemories", nx); return nx; });
  };
  const deleteAiMemory = async (id) => {
    await persistAiMemories(aiMemories.filter(m => m.id !== id));
  };
  const addScheduledBacklogTask = async (desc, boatId, scheduledFor, preferredAssigneeName) => {
    const preferred = preferredAssigneeName ? users.find(u => u.name.toLowerCase() === String(preferredAssigneeName).toLowerCase()) : null;
    const t = {
      id: "t" + Date.now(), status: "backlog", createdBy: acting.id, createdAt: new Date().toISOString(),
      progress: [], returns: 0, assignedTo: null, boatId: boatId || null, desc,
      ...(scheduledFor ? { scheduledFor } : {}),
      ...(preferred ? { preferredAssignee: preferred.id } : {}),
    };
    await persistTasks([t, ...tasks]);
  };

  // Αναχώρηση σκάφους: ορισμός ημερομηνίας + αυτόματο checklist
  const setDeparture = async (boat, date, returnDate) => {
    await persistBoats(boats.map(b => b.id === boat.id ? { ...b, departureDate: date || null, returnDate: date ? (returnDate || null) : null } : b));
    if (date) {
      const already = tasks.some(t => t.boatId === boat.id && t.status === "open" && t.checklistItems);
      if (!already && checklist.length) {
        const t = {
          id: "t" + Date.now(), status: "open", createdBy: acting.id, createdAt: new Date().toISOString(),
          progress: [], returns: 0, assignedTo: null, boatId: boat.id, desc: "Έλεγχος αναχώρησης",
          checklistItems: checklist.map((c, i) => ({ id: "ci" + i, text: c, status: "pending", problemTaskId: null })),
        };
        await persistTasks([t, ...tasks]);
      }
      showToast("Ορίστηκε ναύλο" + (!already && checklist.length ? " — άνοιξε ο έλεγχος αναχώρησης" : ""));
    } else showToast("Η αναχώρηση αφαιρέθηκε");
  };

  const cancelCharter = async (boat) => {
    await persistBoats(boats.map(b => b.id === boat.id ? { ...b, departureDate: null, returnDate: null } : b));
    // Το checklist ελέγχου αναχώρησης δεν έχει πια νόημα και φεύγει· τυχόν εργασίες που προέκυψαν από προβλήματα (⚠) παραμένουν κανονικά.
    const stillOpen = tasks.filter(t => !(t.boatId === boat.id && t.status === "open" && t.checklistItems));
    if (stillOpen.length !== tasks.length) await persistTasks(stillOpen);
    showToast("Ο ναύλος ακυρώθηκε — οι εργασίες του σκάφους βγήκαν από προτεραιότητα");
  };
  // Προγραμματισμός επόμενου ναύλου ενώ το σκάφος είναι ακόμα εν πλω — απλή αποθήκευση ημερομηνιών,
  // ΧΩΡΙΣ να ανοίγει έλεγχος αναχώρησης (δεν μπορεί κανείς να ετοιμάσει σκάφος που δεν έχει καν επιστρέψει).
  const setNextCharter = async (boat, date, returnDate) => {
    await persistBoats(boats.map(b => b.id === boat.id ? { ...b, nextDepartureDate: date || null, nextReturnDate: date ? (returnDate || null) : null } : b));
    showToast(date ? "Προγραμματίστηκε ο επόμενος ναύλος" : "Ο προγραμματισμός αφαιρέθηκε");
  };
  // Επιστροφή σκάφους: αν είχε προγραμματιστεί επόμενος ναύλος, ενεργοποιείται τώρα ως ο τρέχων —
  // αλλά ο έλεγχος αναχώρησης ΔΕΝ ανοίγει αμέσως· ενεργοποιείται το επόμενο πρωί (βλ. activateDepartureChecklists).
  const returnBoat = async (boat) => {
    const promoted = boat.nextDepartureDate || null;
    const promotedReturn = boat.nextReturnDate || null;
    await persistBoats(boats.map(x => x.id === boat.id ? {
      ...x, atSea: false, departureDate: promoted, returnDate: promoted ? promotedReturn : null,
      nextDepartureDate: null, nextReturnDate: null,
    } : x));
    showToast(promoted ? `Το ${boat.name} επέστρεψε — ο προγραμματισμένος ναύλος ενεργοποιείται το πρωί` : `Το ${boat.name} επέστρεψε`);
  };
  // Ανοίγει τον έλεγχο αναχώρησης για σκάφη που είναι ήδη στη βάση με ορισμένη ημερομηνία ναύλου αλλά δεν έχουν
  // ακόμα το checklist — καλύπτει ειδικά τα σκάφη που μόλις επέστρεψαν, με φυσική καθυστέρηση ως το επόμενο πρωί
  // (τρέχει μία φορά τη μέρα, στο πρώτο άνοιγμα της εφαρμογής, μαζί με την υπόλοιπη καθημερινή ροή).
  const activateDepartureChecklists = async (tasksOverride) => {
    const src = tasksOverride || tasks;
    if (!checklist.length) return src;
    // Ενεργοποίηση ελέγχου αναχώρησης για σκάφη στη βάση που έχουν επόμενη αναχώρηση εντός 2 ημερών —
    // ώστε να υπάρχει χρόνος ετοιμασίας, χωρίς να ανοίγει πολύ νωρίς.
    const need = boats.filter(b => {
      const nd = nextDeparture(b);
      return nd && nd.days !== null && nd.days <= 2
        && !src.some(t => t.boatId === b.id && t.status === "open" && t.checklistItems);
    });
    if (!need.length) return src;
    const newTasks = need.map((b, i) => ({
      id: "t" + Date.now() + "-dc" + i, status: "open", createdBy: "system", createdAt: new Date().toISOString(),
      progress: [], returns: 0, assignedTo: null, boatId: b.id, desc: "Έλεγχος αναχώρησης",
      checklistItems: checklist.map((c, j) => ({ id: "ci" + j, text: c, status: "pending", problemTaskId: null })),
    }));
    const merged = [...newTasks, ...src];
    // Λειτουργική ενημέρωση + έλεγχος διπλοτύπων μέσα στην ενημέρωση — ασφαλής απέναντι σε παράλληλες ροές ανοίγματος.
    setTasks(cur => {
      const fresh = newTasks.filter(t => !cur.some(x => x.boatId === t.boatId && x.status === "open" && x.checklistItems));
      if (!fresh.length) return cur;
      const nx = [...fresh, ...cur];
      save("app-tasks", nx);
      return nx;
    });
    return merged;
  };

  const resolveChecklistItem = async (task, itemId, outcome, note) => {
    let base = tasks;
    let newTaskId = null;
    if (outcome === "problem") {
      newTaskId = "t" + Date.now() + "-p";
      const newTask = {
        id: newTaskId, status: "open", createdBy: acting.id, createdAt: new Date().toISOString(),
        progress: [], returns: 0, assignedTo: null, boatId: task.boatId,
        desc: note?.trim() || "Πρόβλημα κατά τον έλεγχο αναχώρησης",
      };
      base = [newTask, ...tasks];
    }
    const items = (Array.isArray(task.checklistItems) ? task.checklistItems : []).map(it => it.id === itemId ? { ...it, status: outcome, problemTaskId: outcome === "problem" ? newTaskId : null } : it);
    const allResolved = items.every(it => it.status !== "pending");
    const next = base.map(t2 => t2.id === task.id ? {
      ...t2, checklistItems: items,
      ...(allResolved ? { status: "done", completedBy: acting.id, completedAt: new Date().toISOString() } : {}),
    } : t2);
    await persistTasks(next);
    showToast(outcome === "problem" ? "Καταγράφηκε πρόβλημα — δημιουργήθηκε νέα εργασία ⚠" : "Τσεκαρίστηκε ✔");
  };

  const effectiveDeadline = (t) => {
    if (t.manualDeadline) return t.manualDeadline;
    if (t.excludedFromDeadline) return null;
    const b = boats.find(x => x.id === t.boatId);
    if (!b) return null;
    const s = boatStatus(b);
    // Προθεσμία = επόμενη αναχώρηση του σκάφους (αν είναι στη βάση με προγραμματισμένο ναύλο)
    return s.nextEventType === "depart" ? s.departureDate : null;
  };
  const sortTasks = (list) => [...list].sort((a, b) => {
    if (!!b.urgent - !!a.urgent) return !!b.urgent - !!a.urgent;
    const da = effectiveDeadline(a), db = effectiveDeadline(b);
    if (da && db) return da.localeCompare(db);
    if (da) return -1; if (db) return 1;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  const myTasks = sortTasks(tasks.filter(t => t.status === "open" && t.assignedTo === acting.id));
  const freeTasks = sortTasks(tasks.filter(t => t.status === "open" && (!t.assignedTo || t.assignedTo !== acting.id)));
  // Τα διαγραμμένα (status="deleted") φιλτράρονται εδώ, ΜΙΑ φορά, κεντρικά — έτσι καμία οθόνη, στατιστικό ή
  // αναφορά δεν τα βλέπει ποτέ κατά λάθος. Μόνο ο «Κάδος» της Διοίκησης παίρνει την πλήρη λίστα (tasksRaw).
  const activeTasks = tasks.filter(t => t.status !== "deleted");
  const deletedTasks = tasks.filter(t => t.status === "deleted");

  const tabs = [
    { id: "today", label: tr("Σήμερα"), icon: "☀" },
    { id: "tasks", label: tr("Εργασίες"), icon: "☰" },
    { id: "new", label: tr("Νέα"), icon: "+" },
    { id: "service", label: "Service", icon: "📖" },
    ...(isMgr ? [{ id: "admin", label: "Διοίκηση", icon: "⚙" }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT_STACK, paddingBottom: 88 }}>
      <BaseStyles />
      <Header me={acting} onLogout={logout} />
      {canGoBack && (
        <button onClick={goBack} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 4, background: COLORS.card, border: "none",
          borderBottom: `1px solid ${COLORS.line}`, padding: "8px 12px", fontSize: 13, fontWeight: 700, color: COLORS.navy, textAlign: "left",
        }}>‹ Πίσω</button>
      )}
      {viewAs && (
        <div style={{ background: COLORS.amber, color: "#33260C", padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 700 }}>
          👁 Προβολή ως: {viewAs.name}
          <button onClick={() => { setViewAs(null); setTab("admin"); }} style={{ border: "1.5px solid #3A2600", background: "transparent", color: "#33260C", borderRadius: 8, padding: "4px 8px", fontWeight: 700 }}>Επιστροφή σε {me.name}</button>
        </div>
      )}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "12px 12px" }}>
        {tab === "today" && <ErrorBoundary label="Σήμερα"><TodayView me={acting} tasks={myTasks} allTasks={activeTasks} boats={boats} users={users} isMgr={isMgr} canAssign={canAssign}
          effectiveDeadline={effectiveDeadline} onComplete={completeTask} onProgress={addProgress} onExternal={externalTask} onEdit={editTask} onDelete={deleteTask} onChecklistItem={resolveChecklistItem} onSetDeadline={setTaskDeadline} onSetDeadlineDuration={setTaskDeadlineByDuration} onAddBeforePhotos={addBeforePhotos} onLogFinding={logFinding} onTranslate={translateTask} onHelp={getTaskHelp}
          onAssign={assignTask} onAssignWithDeadline={assignTaskWithDeadline} onDowngrade={toggleUrgent}
          absences={absences} onAddAbsence={addAbsence} onDeleteAbsence={deleteAbsence} notes={notes} onSendNote={sendNote} onDeleteNote={deleteNote} onAckExternal={acknowledgeExternal} onCloseExternal={closeExternal} /></ErrorBoundary>}
        {tab === "tasks" && <ErrorBoundary label="Εργασίες"><TasksView tasks={freeTasks} boats={boats} users={users} isMgr={isMgr} me={acting}
          boatFilter={tasksBoatFilter} onBoatFilterChange={setTasksBoatFilter}
          effectiveDeadline={effectiveDeadline} onComplete={completeTask} onProgress={addProgress} onExternal={externalTask}
          onAssign={assignTask} onAssignWithDeadline={assignTaskWithDeadline} onDowngrade={toggleUrgent} onEdit={editTask} onDelete={deleteTask} onBulkDelete={deleteTasks} canAssign={canAssign} onChecklistItem={resolveChecklistItem} onSetDeadline={setTaskDeadline} onSetDeadlineDuration={setTaskDeadlineByDuration} onAddBeforePhotos={addBeforePhotos} onLogFinding={logFinding} onTranslate={translateTask} onHelp={getTaskHelp} /></ErrorBoundary>}
        {tab === "new" && <ErrorBoundary label="Νέα εργασία"><NewTask boats={boats} quick={quick} users={users} isMgr={isMgr} onAdd={addTask} onAddMany={addTasks} onAddParsed={addParsed} /></ErrorBoundary>}
        {tab === "service" && <ErrorBoundary label="Service Book"><ServiceBook boats={boats} tasks={activeTasks} users={users} isMgr={isMgr} onDelete={deleteTask} onToggleService={toggleServiceRelevant} /></ErrorBoundary>}
        {tab === "admin" && isMgr && <ErrorBoundary label="Admin"><AdminView me={acting} users={users} boats={boats} tasks={activeTasks} quick={quick} checklist={checklist} closingChecklist={closingChecklist} boatNotes={boatNotes} onAddBoatNote={addBoatNote} onDeleteBoatNote={deleteBoatNote} aiMemories={aiMemories} onAddMemory={addAiMemory} onDeleteMemory={deleteAiMemory} onAddScheduled={addScheduledBacklogTask} absences={absences}
          persistUsers={persistUsers} persistBoats={persistBoats} persistQuick={persistQuick} persistChecklist={persistChecklist} persistClosingChecklist={persistClosingChecklist}
          setDeparture={setDeparture} cancelCharter={cancelCharter} onReturnBoat={returnBoat} onSetNextCharter={setNextCharter} onReturn={returnTask} onCloseExternal={closeExternal} onDowngrade={toggleUrgent} onRate={rateTask}
          onAssign={assignTask} runDistribution={() => runDistribution(true).then(fresh => generateAutoTasks(fresh))} generateClosingChecks={generateClosingChecks} effectiveDeadline={effectiveDeadline}
          settings={settings} updateSettings={updateSettings} resetSettings={resetSettings}
          persistTasks={persistTasks} tasksRaw={deletedTasks} onRestore={restoreTask} showToast={showToast} onViewAs={isMgr ? (u) => { setViewAs(u); setTab("today"); } : null} realOwner={me.role === "owner"} onDelete={deleteTask}
          onAddAbsence={addAbsence} onDeleteAbsence={deleteAbsence} onGoToBoatTasks={goToBoatTasks} section={adminSection} setSection={setAdminSection} /></ErrorBoundary>}
      </div>
      <TabBar tabs={tabs} tab={tab} setTab={selectTab} />
      {toast && <div style={{ position: "fixed", bottom: 86, left: "50%", transform: "translateX(-50%)", background: COLORS.navy, color: "#fff", padding: "8px 16px", borderRadius: 12, fontSize: 15, zIndex: 50, maxWidth: "90%" }}>{toast}</div>}
    </div>
  );
}

// ---------- Κοινά UI ----------
const Center = ({ children }) => <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg }}>{children}</div>;

function Header({ me, onLogout }) {
  const roleLabel = me.role === "owner" ? "Διαχειριστής" : me.role === "manager" ? "Base Manager" : me.role === "associate" ? "Στέλεχος" : tr("Συνεργείο βάσης");
  return (
    <div style={{ background: COLORS.navy, color: "#fff", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <img src="/icon-192.png" alt="" width={32} height={32} style={{ borderRadius: R.sm, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, letterSpacing: 0.3, fontSize: T.body, lineHeight: 1.25 }}>SAILWAYS <span style={{ fontWeight: 400, opacity: 0.65 }}>Βάση Αλίμου</span></div>
          <div style={{ fontSize: T.caption, opacity: 0.65, lineHeight: 1.35 }}>{me.name} · {roleLabel}</div>
        </div>
      </div>
      <button onClick={onLogout} style={{ background: "transparent", border: "1px solid rgba(255,255,255,.28)", color: "#fff", borderRadius: R.sm, padding: "8px 12px", fontSize: T.small, fontWeight: 500, flexShrink: 0 }}>{tr("Έξοδος")}</button>
    </div>
  );
}

function TabBar({ tabs, tab, setTab }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(255,255,255,0.94)",
      backdropFilter: "saturate(1.6) blur(12px)", WebkitBackdropFilter: "saturate(1.6) blur(12px)",
      borderTop: `1px solid ${COLORS.line}`, display: "flex", zIndex: 40,
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex: 1, padding: "8px 4px", background: "none", border: "none",
          color: tab === t.id ? COLORS.navy : COLORS.sub, fontWeight: tab === t.id ? 600 : 500, fontSize: T.caption,
        }}>
          <div style={{ fontSize: 20, lineHeight: 1.2, opacity: tab === t.id ? 1 : 0.55 }}>{t.icon}</div>{t.label}
        </button>
      ))}
    </div>
  );
}

function Login({ users, onPick }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const tryLogin = () => {
    const u = users.find(x => (x.code || "").toUpperCase() === code.trim().toUpperCase());
    if (u) onPick(u);
    else setErr("Ο κωδικός δεν αναγνωρίστηκε. / Code not recognized.");
  };
  return (
    <Center>
      <div style={{ width: "100%", maxWidth: 380, padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 12, marginBottom: 12 }} />
          <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.navy, letterSpacing: 1 }}>SAILWAYS</div>
          <div style={{ color: COLORS.sub, marginTop: 4 }}>Βάση Μαρίνας Αλίμου <span style={{ fontSize: 12, opacity: .6 }}>· {APP_VERSION}</span></div>
        </div>
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 16 }}>
          <label style={lbl}>Προσωπικός κωδικός / Personal code</label>
          <input value={code} onChange={e => { setCode(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && tryLogin()}
            placeholder="π.χ. VAS-4821" autoCapitalize="characters"
            style={{ ...inputStyle, fontSize: 17, textAlign: "center", letterSpacing: 1.5 }} />
          {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 12 }}>
            <button onClick={tryLogin} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", background: COLORS.navy, color: "#fff", fontSize: 15, fontWeight: 700 }}>Είσοδος / Sign in</button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: COLORS.sub, textAlign: "center" }}>
            Ο κωδικός μπαίνει μία φορά — η συσκευή σε θυμάται. / Enter once — this device remembers you.
          </div>
        </div>
      </div>
    </Center>
  );
}

// ---------- Κάρτα εργασίας ----------
function FindingsFlow({ t, onLogFinding, onComplete, isMgr, me, setCompleteAsId, setMode, employees, completeAsId }) {
  const [text, setText] = useState("");
  const min = t.findMin || 3;
  const findings = t.findings || [];
  const canComplete = findings.length >= min;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, color: canComplete ? COLORS.green : COLORS.sub, fontWeight: 700, marginBottom: 8 }}>
        {findings.length}/{min} {tr("εντοπισμένα")} {canComplete ? "✔" : ""}
      </div>
      {findings.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {findings.map((f, i) => (
            <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: i < findings.length - 1 ? `1px dashed ${COLORS.line}` : "none" }}>
              {i + 1}. {f.desc}
            </div>
          ))}
        </div>
      )}
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder={tr("Τι εντόπισες; π.χ. Το πόμολο της ντουλάπας στην πλώρη είναι χαλαρό")} style={inputStyle} />
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Btn small color={COLORS.teal} onClick={() => { if (!text.trim()) return; onLogFinding(t, text.trim()); setText(""); }}>{tr("Προσθήκη εύρεσης")}</Btn>
        {canComplete && (
          <Btn small color={COLORS.green} onClick={() => { setCompleteAsId(me.id); setMode("confirmComplete"); }}>{tr("Ολοκληρώθηκε ✔")}</Btn>
        )}
      </div>
    </div>
  );
}

function ChecklistItems({ t, onChecklistItem }) {
  const [probFor, setProbFor] = useState(null);
  const [note, setNote] = useState("");
  const items = Array.isArray(t.checklistItems) ? t.checklistItems : [];
  const doneCount = items.filter(it => it.status !== "pending").length;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, color: COLORS.sub, fontWeight: 700, marginBottom: 4 }}>{doneCount}/{items.length} ελέγχθηκαν</div>
      {items.map(it => (
        <div key={it.id} style={{ borderBottom: `1px dashed ${COLORS.line}`, padding: "8px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>
              {it.status === "ok" && "✔ "}{it.status === "problem" && "⚠ "}{it.text}
            </div>
            {it.status === "pending"
              ? <div style={{ display: "flex", gap: 4 }}>
                  <Btn small color={COLORS.green} onClick={() => onChecklistItem(t, it.id, "ok")}>✔</Btn>
                  <Btn small color={COLORS.red} outline onClick={() => { setProbFor(it.id); setNote(""); }}>⚠</Btn>
                </div>
              : <span style={{ fontSize: 12, color: it.status === "ok" ? COLORS.green : COLORS.red, fontWeight: 700 }}>
                  {it.status === "ok" ? tr("Εντάξει") : tr("Πρόβλημα")}
                </span>}
          </div>
          {probFor === it.id && (
            <div style={{ marginTop: 8 }}>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder={tr("Τι πρόβλημα είδες;")} style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <Btn small color={COLORS.red} onClick={() => { if (!note.trim()) return; onChecklistItem(t, it.id, "problem", note.trim()); setProbFor(null); }}>{tr("Καταχώρηση προβλήματος")}</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setProbFor(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Μικρό κουμπί μικροφώνου για υπαγόρευση κειμένου σε οποιοδήποτε πεδίο (π.χ. Πρόβλημα/Λύση) —
// ξεχωριστό από το VoiceComplete: εδώ απλά μετατρέπει ομιλία σε κείμενο, χωρίς αναγνώριση εργασίας από AI.
function MicButton({ onResult }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!SR) return null;
  const toggle = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = LANG === "en" ? "en-US" : "el-GR";
    rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add) onResult(add.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };
  return (
    <button type="button" onClick={toggle} style={{
      border: `1.5px solid ${listening ? COLORS.red : COLORS.teal}`, background: listening ? COLORS.red : "transparent",
      color: listening ? "#fff" : COLORS.teal, borderRadius: 8, padding: "4px 8px", fontSize: 13, fontWeight: 700, marginLeft: 8, lineHeight: 1.4,
    }}>{listening ? "⏹" : "🎤"}</button>
  );
}

function TaskCard({ t, boats, users, isMgr, me, deadline, onComplete, onProgress, onExternal, onAssign, onAssignWithDeadline, onDowngrade, onEdit, onDelete, canAssign, showAssignee, onChecklistItem, onSetDeadline, onSetDeadlineDuration, onAddBeforePhotos, onLogFinding, onTranslate, onHelp }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // 'progress' | 'external' | 'assign' | 'completeAs'
  const [showMore, setShowMore] = useState(false); // δευτερεύουσες ενέργειες — κρυφές μέχρι να ζητηθούν
  const [note, setNote] = useState("");
  const [completeAsId, setCompleteAsId] = useState(null);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [assignMinutes, setAssignMinutes] = useState("");
  const [customMins, setCustomMins] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [completionNote, setCompletionNote] = useState("");
  const [aiReview, setAiReview] = useState(null);
  const [aiReviewBusy, setAiReviewBusy] = useState(false);
  const [helpText, setHelpText] = useState(null);
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpQuery, setHelpQuery] = useState("");
  const afterFileRef = useRef(null);
  const progressFileRef = useRef(null);
  const [progressPhotos, setProgressPhotos] = useState([]);
  const boat = boats.find(b => b.id === t.boatId);
  const dl = deadline(t);
  const du = daysUntil(dl);
  const spine = t.urgent ? COLORS.red : (dl && du !== null && du <= 7 ? COLORS.amber : COLORS.line);
  const assignee = users.find(u => u.id === t.assignedTo);
  const employees = users.filter(u => u.role === "employee" && !u.noStats);
  const needsTranslation = me?.lang === "en" && t.desc && !t.descEn;
  // Αυτόματη μετάφραση της περιγραφής (γραμμένη στα ελληνικά από τον manager) όταν ο χρήστης έχει lang="en" — μία φορά, μένει cached
  useEffect(() => { if (needsTranslation && !t.translating && onTranslate) onTranslate(t); }, [t.id, needsTranslation, t.translating]);
  const shownDesc = (me?.lang === "en" && t.descEn && !showOriginal) ? t.descEn : t.desc;
  // Κάθε ολοκλήρωση περνάει πλέον από ΕΝΑ ενιαίο panel επιβεβαίωσης, με υποχρεωτικό πεδίο "τι είχε/τι έκανες" —
  // ανεξάρτητα από ρόλο (manager/employee) ή τύπο εργασίας (απλή/εντατική/checklist).
  // ΠΡΟΣΟΧΗ — ζήτημα δικαιοσύνης μεταξύ υπαλλήλων: η προεπιλογή «ποιος το ολοκλήρωσε» πρέπει να είναι ΠΑΝΤΑ
  // αυτός που πραγματικά κάνει την ολοκλήρωση αυτή τη στιγμή (acting/me), ΟΧΙ ο αρχικά ανατεθειμένος. Αν π.χ. ο
  // Φανούρης αναλάβει και ολοκληρώσει μια εργασία του Μήτσου, πρέπει να φαίνεται ο Φανούρης — ο επιλογέας
  // παρακάτω επιτρέπει σε manager να το αλλάξει ρητά (π.χ. αν ο υπάλληλος του το ανέφερε τηλεφωνικά), αλλά ποτέ
  // δεν πρέπει να «κληρονομεί» σιωπηλά τον αρχικό ανάδοχο σαν προεπιλογή.
  const startComplete = (conf) => {
    setConfidence(conf);
    setCompleteAsId(me.id);
    setAiReview(null);
    setMode("confirmComplete");
  };
  const finalizeComplete = (finalNote) => {
    onComplete(t, isMgr ? completeAsId : null, afterPhotos, confidence, finalNote);
    setMode(null); setOpen(false); setAfterPhotos([]); setConfidence(null); setCompletionNote(""); setAiReview(null);
  };
  const confirmComplete = () => {
    if (!completionNote.trim()) return;
    finalizeComplete(completionNote.trim());
  };
  // Προαιρετική διόρθωση της σημείωσης ολοκλήρωσης από AI — καθαρίζει τη διατύπωση ώστε να είναι κατανοητή από
  // όλη την ομάδα, ΧΩΡΙΣ να αλλάζει τα γεγονότα. Ο χρήστης βλέπει το αποτέλεσμα και το εγκρίνει πριν οριστικοποιηθεί.
  const requestAiCorrection = async () => {
    if (!completionNote.trim()) return;
    setAiReviewBusy(true);
    try {
      const prompt = `Διόρθωσε το παρακάτω κείμενο που περιγράφει πρόβλημα/λύση σε εργασία συντήρησης σκάφους — μόνο ορθογραφία, στίξη και σύνταξη, ώστε να είναι καθαρό και κατανοητό από όλη την ομάδα. Κράτα φυσική, καθημερινή γλώσσα — όπως θα το έγραφε ο ίδιος ο τεχνικός σε μια σημείωση δουλειάς, όχι επίσημο ή τυπικό ύφος (όχι γλώσσα εξυπηρέτησης πελατών). ΜΗΝ αλλάξεις κανένα γεγονός και μην προσθέσεις πληροφορία που δεν υπάρχει στο πρωτότυπο — το νόημα πρέπει να μείνει ακριβώς το ίδιο. Κράτα το σύντομο. Απάντησε ΜΟΝΟ με το διορθωμένο κείμενο, χωρίς εισαγωγικά, χωρίς σχόλια.\n\nΚείμενο: ${completionNote.trim()}`;
      const out = await askClaude(prompt, 220);
      setAiReview((out || "").trim() || completionNote.trim());
    } catch { setAiReview(completionNote.trim()); }
    setAiReviewBusy(false);
  };

  return (
    <div style={{
      background: COLORS.card, borderRadius: R.lg, marginBottom: 12,
      // Λεπτή έγχρωμη ράχη αντί για χοντρή: η κατάσταση διαβάζεται με μια ματιά χωρίς να κραυγάζει.
      borderLeft: `3px solid ${spine}`, border: `1px solid ${COLORS.line}`, borderLeftColor: spine, borderLeftWidth: 3,
      boxShadow: "0 1px 2px rgba(28,26,23,.04)",
    }}>
      <div onClick={() => setOpen(!open)} style={{ padding: "12px 12px", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>
            {shownDesc}
            {needsTranslation && t.translating && <span style={{ color: COLORS.sub, fontWeight: 400, fontSize: 13 }}> · translating…</span>}
            {me?.lang === "en" && t.descEn && (
              <span onClick={(e) => { e.stopPropagation(); setShowOriginal(!showOriginal); }} style={{ display: "block", color: COLORS.teal, fontWeight: 600, fontSize: 12, marginTop: 4 }}>
                {showOriginal ? "🌐 Show translation" : "🇬🇷 Show original"}
              </span>
            )}
          </div>
          <div style={{ fontSize: 20 }}>{open ? "▾" : "▸"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, fontSize: 13, color: COLORS.sub, alignItems: "center" }}>
          <span style={{ background: COLORS.bg, padding: "0px 8px", borderRadius: 8, fontWeight: 600, color: COLORS.navy }}>{boat ? boat.name : tr("Βάση / Άλλο")}</span>
          {t.urgent && <span style={{ color: COLORS.red, fontWeight: 700 }}>🔴 {tr("Επείγον")}</span>}
          {t.purchase && <span style={{ color: COLORS.amber, fontWeight: 700 }}>🛒 {tr("Αγορά")}</span>}
          {t.autoGenerated && <span style={{ color: COLORS.sub, fontWeight: 600 }}>🤖 {tr("αυτόματη")}</span>}
          {!t.urgent && dl && du !== null && du <= 7 && <span style={{ color: (t.manualDeadline && new Date(dl).getTime() < Date.now()) ? COLORS.red : COLORS.amber, fontWeight: 700 }}>⏰ {deadlineLabel(t, dl)}</span>}
          {dl && (du === null || du > 7) && <span>{tr("έως")} {fmtDate(dl)}</span>}
          {showAssignee && assignee && <span>→ {assignee.name}{t.assignedBy === "AI" ? " (AI)" : ""}</span>}
          {t.returnNote && t.status === "open" && <span style={{ color: COLORS.red }}>↩ {tr("Επιστράφηκε")}</span>}
          {t.progress?.length > 0 && <span style={{ color: COLORS.teal }}>✏ {t.progress.length} {tr("πρόοδοι")}</span>}
        </div>
      </div>
      {open && (
        <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${COLORS.line}` }}>
          {(t.completionNote || t.problemDesc || t.problemSolution) && (
            <div style={{ background: "#FDF3E3", color: "#6B5410", padding: "8px 8px", borderRadius: 8, fontSize: 13, margin: "8px 0" }}>
              {t.completionNote ? (
                <div><b>{tr("Ολοκλήρωση:")}</b> {(me?.lang === "en" && t.completionNoteEn) ? t.completionNoteEn : t.completionNote}</div>
              ) : (
                <>
                  <div><b>🛠 {tr("Πρόβλημα:")}</b> {t.problemDesc || "-"}</div>
                  <div style={{ marginTop: 4 }}><b>{tr("Λύση:")}</b> {t.problemSolution || "-"}</div>
                </>
              )}
            </div>
          )}
          {t.returnNote && t.status === "open" && (
            <div style={{ background: "#FBEBE6", color: "#8A2A1C", padding: "8px 8px", borderRadius: 8, fontSize: 13, margin: "8px 0" }}>
              <b>{tr("Σημείωση manager:")}</b> {t.returnNote}
            </div>
          )}
          {t.photos?.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
              {(t.photos || []).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}` }} />
                </a>
              ))}
            </div>
          )}
          {(t.photosBefore?.length > 0 || t.photosAfter?.length > 0) && (
            <div style={{ margin: "8px 0" }}>
              {t.photosBefore?.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 4 }}>{tr("Πριν")}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {t.photosBefore.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}` }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {t.photosAfter?.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 4 }}>{tr("Μετά")}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {t.photosAfter.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}` }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {t.intensive && t.status === "done" && !(t.photosAfter?.length) && (
            <div style={{ color: COLORS.amber, fontSize: 13, fontWeight: 600, margin: "8px 0" }}>⚠ {tr("Χωρίς φωτογραφία αποτελέσματος")}</div>
          )}
          {t.progress?.length > 0 && (
            <div style={{ margin: "8px 0", fontSize: 13 }}>
              {(t.progress || []).map((p, i) => (
                <div key={i} style={{ padding: "4px 0", borderBottom: i < (t.progress || []).length - 1 ? `1px dashed ${COLORS.line}` : "none", color: COLORS.sub }}>
                  ✏ {fmtDate(p.at)}: {p.note}{isMgr ? ` — ${users.find(u => u.id === p.by)?.name || ""}` : ""}
                  {p.photos?.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                      {p.photos.map((url, pi) => <img key={pi} src={url} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8 }} onClick={() => window.open(url, "_blank")} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {Array.isArray(t.reminderList) && t.reminderList.length > 0 && (
            <div style={{ margin: "8px 0", fontSize: 13, background: COLORS.bg, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontWeight: 700, color: COLORS.sub, marginBottom: 4 }}>{tr("Έλεγξε:")}</div>
              {t.reminderList.map((item, i) => <div key={i} style={{ color: COLORS.sub, padding: "0px 0" }}>• {item}</div>)}
            </div>
          )}
          {Array.isArray(t.checklistItems) && (
            <ChecklistItems t={t} onChecklistItem={onChecklistItem} />
          )}
          {t.findMode && (
            <FindingsFlow t={t} onLogFinding={onLogFinding} onComplete={onComplete} isMgr={isMgr} me={me} setCompleteAsId={setCompleteAsId} setMode={setMode} employees={employees} completeAsId={completeAsId} />
          )}
          {mode === null && (
            <div style={{ marginTop: 8 }}>
              {!Array.isArray(t.checklistItems) && !t.findMode && (
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  {t.boatId ? (
                    <>
                      <Btn color={COLORS.green} onClick={() => startComplete("good")}>{tr("Ολοκληρώθηκε")}</Btn>
                      <Btn color={NEUTRAL} outline onClick={() => startComplete("reservations")}>{tr("Με επιφυλάξεις")}</Btn>
                    </>
                  ) : (
                    <Btn color={COLORS.green} onClick={() => startComplete(null)}>{tr("Ολοκληρώθηκε")}</Btn>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <Btn color={NEUTRAL} outline onClick={() => { setMode("progress"); setNote(""); }}>{tr("Πρόοδος")}</Btn>
                {t.intensive && !(t.photosBefore?.length) && <Btn color={NEUTRAL} outline onClick={() => setMode("beforePhoto")}>{tr("Φωτογραφία πριν")}</Btn>}
                <button onClick={() => setShowMore(!showMore)} style={{ background: "none", border: "none", color: COLORS.sub, fontSize: 13, fontWeight: 600, padding: "8px 4px" }}>
                  {showMore ? tr("Λιγότερα") : tr("Περισσότερα")} {showMore ? "▾" : "▸"}
                </button>
              </div>
              {showMore && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${COLORS.line}` }}>
                  {onHelp && <Btn small color={NEUTRAL} outline onClick={() => setMode("help")}>{tr("Βοήθεια")}</Btn>}
                  <Btn small color={COLORS.amber} outline onClick={() => { setMode("external"); setNote(""); }}>{tr("Χρειάζεται ειδικός")}</Btn>
                  {(isMgr || t.createdBy === me?.id || t.assignedTo === me?.id) && <Btn small color={NEUTRAL} outline onClick={() => { setMode("edit"); setNote(t.desc); }}>{tr("Διόρθωση")}</Btn>}
                  {isMgr && <Btn small color={COLORS.amber} outline onClick={() => setMode("deadline")}>{tr("Προθεσμία")}</Btn>}
                  {(isMgr || canAssign) && <Btn small color={COLORS.navy} outline onClick={() => setMode("assign")}>{tr("Ανάθεση")}</Btn>}
                  {!t.urgent && <Btn small color={COLORS.red} outline onClick={() => onDowngrade(t)}>{tr("Επείγον")}</Btn>}
                  {isMgr && t.urgent && <Btn small color={NEUTRAL} outline onClick={() => onDowngrade(t)}>{tr("Άρση επείγοντος")}</Btn>}
                  {(isMgr || t.createdBy === me?.id || t.assignedTo === me?.id) && <Btn small color={COLORS.red} outline onClick={() => setMode("confirmDel")}>{tr("Διαγραφή")}</Btn>}
                </div>
              )}
            </div>
          )}
          {mode === "confirmDel" && (
            <div style={{ marginTop: 8, background: "#FBEBE6", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#8A2A1C", marginBottom: 8 }}>{tr("Διαγραφή εργασίας; Δεν αναιρείται.")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small color={COLORS.red} onClick={() => onDelete(t)}>{tr("Ναι, διαγραφή")}</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "edit" && (
            <div style={{ marginTop: 8 }}>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn color={COLORS.teal} onClick={() => { if (!note.trim()) return; onEdit(t, note.trim()); setMode(null); }}>{tr("Καταχώρηση")}</Btn>
                <Btn color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "deadline" && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 8 }}>{tr("Ορισμός προθεσμίας:")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["30′", 30], ["1ω", 60], ["2ω", 120], ["3ω", 180], ["4ω", 240]].map(([label, mins]) => (
                  <Btn key={mins} small color={COLORS.amber} outline onClick={() => { onSetDeadlineDuration(t, mins); setMode(null); }}>{label}</Btn>
                ))}
                <Btn small color={COLORS.amber} outline onClick={() => { onSetDeadline(t, workDayEnd(nextWorkMoment(Date.now())).toISOString()); setMode(null); }}>{tr("Τέλος ημέρας")}</Btn>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <input type="number" min="1" placeholder={tr("Custom (λεπτά)")} value={customMins} onChange={e => setCustomMins(e.target.value)} style={{ ...inputStyle, width: 130 }} />
                <Btn small color={COLORS.amber} outline onClick={() => { if (customMins) { onSetDeadlineDuration(t, Number(customMins)); setMode(null); setCustomMins(""); } }}>{tr("Ορισμός")}</Btn>
              </div>
              {t.manualDeadline && (
                <div style={{ marginTop: 8 }}>
                  <Btn small color={COLORS.red} outline onClick={() => { onSetDeadline(t, null); setMode(null); }}>{tr("Αφαίρεση προθεσμίας")}</Btn>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Btn small color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "beforePhoto" && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 4 }}>{tr("Φωτογραφία πριν ξεκινήσεις:")}</div>
              <input ref={afterFileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }}
                onChange={async e => { const files = Array.from(e.target.files || []); if (files.length) { await onAddBeforePhotos(t, files); } setMode(null); }} />
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small color={COLORS.teal} onClick={() => afterFileRef.current?.click()}>📷 {tr("Επιλογή φωτογραφίας")}</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {(mode === "progress" || mode === "external") && (
            <div style={{ marginTop: 8 }}>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder={mode === "progress" ? tr("Τι έκανες; π.χ. γυάλισα τη δεξιά πλευρά της πλώρης (~1 ώρα)") : tr("Τι δοκίμασες; Τι ειδικό χρειάζεται;")}
                style={inputStyle} />
              {mode === "progress" && (
                <div style={{ marginTop: 8 }}>
                  <input ref={progressFileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }}
                    onChange={e => setProgressPhotos(prev => [...prev, ...Array.from(e.target.files || [])])} />
                  <Btn small color={COLORS.teal} outline onClick={() => progressFileRef.current?.click()}>📷 {tr("Προσθήκη φωτογραφίας (προαιρετικό)")}</Btn>
                  {progressPhotos.length > 0 && <span style={{ fontSize: 13, color: COLORS.sub, marginLeft: 8 }}>{progressPhotos.length} {tr("επιλεγμένες")}</span>}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn color={COLORS.teal} onClick={() => { if (!note.trim()) return; mode === "progress" ? onProgress(t, note.trim(), progressPhotos) : onExternal(t, note.trim()); setMode(null); setOpen(false); setProgressPhotos([]); }}>{tr("Καταχώρηση")}</Btn>
                <Btn color={COLORS.sub} outline onClick={() => { setMode(null); setProgressPhotos([]); }}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "assign" && (isMgr || canAssign) && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input type="number" min="1" placeholder={tr("Χρόνος (λεπτά, προαιρετικό)")} value={assignMinutes}
                  onChange={e => setAssignMinutes(e.target.value)} style={{ ...inputStyle, width: 180 }} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {users.map(u => (
                  <Btn key={u.id} color={t.assignedTo === u.id ? COLORS.teal : COLORS.navy} outline={t.assignedTo !== u.id}
                    onClick={() => { onAssignWithDeadline(t, u.id, assignMinutes ? Number(assignMinutes) : null); setMode(null); setAssignMinutes(""); }}>{u.name}</Btn>
                ))}
                <Btn color={COLORS.sub} outline onClick={() => { onAssign(t, null); setMode(null); setAssignMinutes(""); }}>Ελεύθερη</Btn>
              </div>
            </div>
          )}
          {mode === "help" && (
            <div style={{ marginTop: 8, background: "#F4F0F6", borderRadius: 12, padding: 12, border: "1px solid #E1D3F0" }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: "#63407E" }}>💡 {tr("Βοήθεια AI")}</div>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 13, color: COLORS.sub }}>{tr("Συμπτώματα ή λεπτομέρειες (προαιρετικό — κάνε την ερώτηση πιο συγκεκριμένη):")}</div>
                <MicButton onResult={(txt) => setHelpQuery(q => (q ? q.trim() + " " : "") + txt)} />
              </div>
              <textarea value={helpQuery} onChange={e => setHelpQuery(e.target.value)} rows={2} placeholder={tr("π.χ. κάνει περίεργο θόρυβο όταν ξεκινάει, μυρίζει καμένο, δεν παίρνει καθόλου μπρος…")} style={inputStyle} />
              <div style={{ marginTop: 8 }}>
                <Btn small color="#63407E" onClick={() => {
                  setHelpBusy(true); setHelpText(null);
                  onHelp(t, helpQuery.trim()).then(r => { setHelpText(r || tr("Δεν βρέθηκε πρόταση αυτή τη στιγμή — δοκίμασε ξανά σε λίγο.")); setHelpBusy(false); });
                }}>{helpText ? "🔄 " + tr("Ρώτα ξανά") : "💡 " + tr("Ρώτα το AI")}</Btn>
              </div>
              {helpBusy && <div style={{ color: COLORS.sub, fontSize: 13, marginTop: 8 }}>{tr("Σκέφτεται…")}</div>}
              {!helpBusy && helpText && <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5, color: COLORS.text, marginTop: 8, paddingTop: 8, borderTop: "1px dashed #E1D3F0" }}>{helpText}</div>}
              <div style={{ marginTop: 8 }}>
                <Btn small color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Κλείσιμο")}</Btn>
              </div>
            </div>
          )}
          {mode === "confirmComplete" && (
            <div style={{ marginTop: 8 }}>
              {t.boatId && confidence && (
                <div style={{ fontSize: 13, marginBottom: 8, color: confidence === "reservations" ? COLORS.amber : COLORS.green, fontWeight: 700 }}>
                  {confidence === "reservations" ? "🟡 " + tr("Με επιφυλάξεις") : "🟢 " + tr("Τέλεια ολοκλήρωση")}
                </div>
              )}
              {isMgr && (
                <>
                  <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 8 }}>{tr("Ολοκληρώθηκε από:")}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {employees.map(u => (
                      <Btn key={u.id} small color={completeAsId === u.id ? COLORS.teal : COLORS.navy} outline={completeAsId !== u.id}
                        onClick={() => setCompleteAsId(u.id)}>{u.name}</Btn>
                    ))}
                    <Btn small color={completeAsId === me.id ? COLORS.teal : COLORS.navy} outline={completeAsId !== me.id}
                      onClick={() => setCompleteAsId(me.id)}>{tr("Εγώ")} ({me.name})</Btn>
                  </div>
                </>
              )}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 4 }}>{tr("Φωτογραφία αποτελέσματος (προαιρετικό):")}</div>
                <input ref={afterFileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }}
                  onChange={e => setAfterPhotos(prev => [...prev, ...Array.from(e.target.files || [])])} />
                <Btn small color={COLORS.teal} outline onClick={() => afterFileRef.current?.click()}>📷 {tr("Προσθήκη φωτογραφίας")}</Btn>
                {afterPhotos.length > 0 && <span style={{ fontSize: 13, color: COLORS.sub, marginLeft: 8 }}>{afterPhotos.length} {tr("επιλεγμένες")}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 13, color: COLORS.sub, fontWeight: 700 }}>{tr("Πώς ολοκληρώθηκε *")}</div>
                <MicButton onResult={(txt) => setCompletionNote(p => (p ? p.trim() + " " : "") + txt)} />
              </div>
              <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 4 }}>{tr("Πες σύντομα τι έκανες — και τι πρόβλημα αντιμετώπισες, αν υπήρχε.")}</div>
              {aiReview !== null ? (
                <div>
                  <div style={{ fontSize: 13, color: COLORS.sub, fontWeight: 700, marginBottom: 4 }}>{tr("Διορθωμένο κείμενο — μπορείς να το επεξεργαστείς πριν ολοκληρώσεις:")}</div>
                  <textarea value={aiReview} onChange={e => setAiReview(e.target.value)} rows={2} style={inputStyle} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <Btn color={aiReview.trim() ? COLORS.green : COLORS.line} onClick={() => aiReview.trim() && finalizeComplete(aiReview.trim())}>{tr("✔ Οκ, ολοκλήρωση")}</Btn>
                    <Btn color={COLORS.sub} outline onClick={() => setAiReview(null)}>{tr("✎ Πίσω, να το ξαναγράψω από την αρχή")}</Btn>
                  </div>
                </div>
              ) : (
                <>
                  <textarea value={completionNote} onChange={e => setCompletionNote(e.target.value)} rows={2} placeholder={tr("π.χ. Η αντλία σεντίνας δεν λειτουργούσε· καθάρισα το φίλτρο και δούλεψε κανονικά — γράψε ή πάτα 🎤")} style={inputStyle} />
                  <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>🧠 {tr("Υποχρεωτικό — καταγράφεται μόνιμα στη μνήμη του AI και στο ιστορικό του σκάφους.")}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <Btn color={completionNote.trim() ? COLORS.green : COLORS.line} onClick={requestAiCorrection}>{aiReviewBusy ? tr("Διόρθωση…") : tr("Διόρθωση & Ολοκλήρωση")}</Btn>
                    <Btn color={completionNote.trim() ? COLORS.teal : COLORS.line} outline onClick={confirmComplete}>{tr("⏭ Ολοκλήρωση όπως το έγραψα")}</Btn>
                    <Btn color={COLORS.sub} outline onClick={() => { setMode(null); setAfterPhotos([]); setConfidence(null); setCompletionNote(""); setAiReview(null); }}>{tr("Άκυρο")}</Btn>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Τα outline κουμπιά παίρνουν απαλό περίγραμμα αντί για έντονο στο χρώμα τους: με 1.5px στο πλήρες χρώμα,
// δέκα δευτερεύοντα κουμπιά διεκδικούσαν την ίδια προσοχή με το ένα κύριο. Το γεμάτο κουμπί ξεχωρίζει μόνο του.
const Btn = ({ children, color, outline, onClick, small }) => (
  <button onClick={onClick} style={{
    background: outline ? "transparent" : color, color: outline ? color : "#fff",
    border: `1px solid ${outline ? COLORS.line : color}`, borderRadius: R.sm,
    padding: small ? "8px 12px" : "12px 16px",
    fontSize: small ? T.small : T.body, fontWeight: outline ? 500 : 600,
    letterSpacing: 0.1,
  }}>{children}</button>
);

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "12px", borderRadius: R.sm, border: `1px solid ${COLORS.line}`, fontSize: T.body, fontFamily: "inherit", background: "#fff", color: COLORS.text };


function BaseStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      * { -webkit-tap-highlight-color: transparent; }
      body { margin: 0; }
      button, input, textarea, select { font-family: inherit; }
      button { cursor: pointer; transition: background-color ${EASE}, border-color ${EASE}, color ${EASE}, opacity ${EASE}; }
      button:active { opacity: 0.7; }
      /* Περιοχές αφής: όταν φοβάσαι ότι θα πατήσεις λάθος κουμπί, αγχώνεσαι. Ελάχιστο 44px = εμπιστοσύνη.
         Εξαιρούνται τα εικονίδια-σύνδεσμοι μέσα σε σειρές λίστας, που έχουν δικό τους μέγεθος. */
      button:not([data-compact]) { min-height: 44px; }
      /* Αναπνοή: 1.55 ύψος γραμμής είναι ο μεγαλύτερος μοχλός ηρεμίας σε κινητό — το στριμωγμένο
         κείμενο κουράζει κυριολεκτικά, γιατί το μάτι δουλεύει περισσότερο σε κάθε σειρά. */
      body, button, input, textarea, select { line-height: 1.55; }
      input, textarea, select { transition: border-color ${EASE}, box-shadow ${EASE}; }
      input:focus, textarea:focus, select:focus { outline: none; border-color: ${COLORS.navy}; box-shadow: 0 0 0 3px rgba(18,41,63,0.10); }
      /* Ορατή εστίαση πληκτρολογίου, χωρίς να εμφανίζεται στο άγγιγμα. */
      button:focus-visible, a:focus-visible { outline: 2px solid ${COLORS.navy}; outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
    `}</style>
  );
}

// ---------- Οπτική γλώσσα ----------
// Αρχή: το χρώμα σημαίνει κάτι, δεν διακοσμεί.
//   κόκκινο  = επείγον ή μη αναστρέψιμη ενέργεια
//   πορτοκαλί= προθεσμία ή προειδοποίηση
//   πράσινο  = ολοκλήρωση
//   navy     = κύρια ενέργεια
//   γκρι     = όλα τα υπόλοιπα (η συντριπτική πλειοψηφία)
// Ό,τι δεν ανήκει στις 4 πρώτες κατηγορίες παίρνει ουδέτερο γκρι — έτσι το κόκκινο ξαναποκτά τη σημασία του.
const NEUTRAL = COLORS.sub;

// Τίτλος ενότητας: πεζά, χωρίς letter-spacing, χαμηλή αντίθεση. Οργανώνει χωρίς να τραβάει το βλέμμα.
const SectionTitle = ({ children }) => <div style={{ fontSize: T.small, fontWeight: 600, color: COLORS.sub, margin: "32px 0 12px", letterSpacing: 0.2 }}>{children}</div>;


// ---------- Προβολές ----------

function DailyGreeting({ me }) {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    (async () => {
      const key = "greet-" + me.id + "-" + todayStr();
      try { const r = await winStorage.get(key, false); if (r) { setMsg(r.value); return; } } catch {}
      if (!me.humor) return;
      try {
        const prompt = LANG === "en"
          ? `Write ONE short morning message (1-2 sentences, emoji ok) for ${me.name}, a boat-base worker. Style: ${me.humor}. Today is ${todayStr()} — make it fresh and different from other days. Reply ONLY with the message.`
          : `Γράψε ΕΝΑ σύντομο πρωινό μήνυμα (1-2 προτάσεις, emoji επιτρέπονται) για τον/την ${me.name}, που δουλεύει σε βάση σκαφών στη μαρίνα. Ύφος: ${me.humor}. Σήμερα είναι ${todayStr()} — να είναι φρέσκο, διαφορετικό από άλλες μέρες. Απάντησε ΜΟΝΟ με το μήνυμα, χωρίς εισαγωγικά.`;
        const m = (await askClaude(prompt, 200)).trim().replace(/^"|"$/g, "");
        if (m) { setMsg(m); try { await winStorage.set("greet-" + me.id + "-" + todayStr(), m, false); } catch {} }
      } catch {}
    })();
  }, [me.id]);
  if (!msg) return null;
  return (
    <div style={{ color: COLORS.sub, padding: "0px 0px 12px", fontSize: 15, lineHeight: 1.45, fontStyle: "italic" }}>
      {msg}
    </div>
  );
}

function DeparturesWidget({ boats }) {
  const [open, setOpen] = useState(false);
  const winDays = Number(SET.departuresWindowDays) || 7;
  const soon = boats
    .map(b => ({ b, s: boatStatus(b) }))
    .filter(({ s }) => s.nextEventType === "depart" && s.nextEventDays !== null && s.nextEventDays <= winDays)
    .sort((x, y) => x.s.nextEventDays - y.s.nextEventDays);
  const returning = boats
    .map(b => ({ b, s: boatStatus(b) }))
    .filter(({ s }) => s.nextEventType === "return" && s.nextEventDays !== null && s.nextEventDays <= winDays)
    .sort((x, y) => x.s.nextEventDays - y.s.nextEventDays);
  if (!soon.length && !returning.length) return null;
  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 12, border: `1px solid ${COLORS.line}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, textAlign: "left" }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>⚓ Αναχωρήσεις & Επιστροφές ({winDays} μέρες)</span>
        <span style={{ fontSize: 13, color: COLORS.sub, fontWeight: 700 }}>
          {!open ? `${soon.length ? `${soon.length} φεύγουν` : ""}${soon.length && returning.length ? " · " : ""}${returning.length ? `${returning.length} επιστρέφουν` : ""} ▸` : "▾"}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          {soon.map(({ b, s }) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
              <span>⏰ {b.name}</span>
              <span style={{ color: s.nextEventDays <= 1 ? COLORS.red : COLORS.amber, fontWeight: 700 }}>{s.nextEventDays <= 0 ? "Φεύγει σήμερα" : `Φεύγει σε ${s.nextEventDays}μ — ${fmtDate(s.nextEventDate)}`}</span>
            </div>
          ))}
          {returning.map(({ b, s }) => {
            const isBackToday = s.nextEventDays <= 0;
            const nd = isBackToday ? nextDeparture(b) : null;
            return (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                <span>{isBackToday ? "🏠 " : "🌊 "}{b.name}</span>
                <span style={{ color: isBackToday ? COLORS.green : COLORS.teal, fontWeight: 700 }}>
                  {isBackToday ? (nd ? `Επέστρεψε σήμερα — φεύγει ξανά σε ${nd.days <= 0 ? "λίγο" : `${nd.days}μ`}` : "Επέστρεψε σήμερα") : `Επιστρέφει σε ${s.nextEventDays}μ — ${fmtDate(s.nextEventDate)}`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExternalReminders({ me, tasks, boats, onAck, onProgress, onCloseExternal, onDelete, onEdit }) {
  const allowed = me.role === "owner" || ["Φανούρης", "Αλέξανδρος"].includes(me.name);
  const [mode, setMode] = useState(null); // { taskId, kind: 'progress'|'complete'|'confirmDel'|'edit' }
  const [note, setNote] = useState("");
  if (!allowed) return null;
  const threeDaysAgo = Date.now() - 3 * 24 * 3600 * 1000;
  const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
  const shown = tasks.filter(t => {
    if (t.status !== "external") return false;
    const ackAt = t.ackBy?.[me.id];
    if (!ackAt) return true;
    return new Date(ackAt).getTime() < threeDaysAgo;
  });
  if (shown.length === 0) return null;
  const startMode = (taskId, kind, prefill = "") => { setMode({ taskId, kind }); setNote(prefill); };
  const cancelMode = () => { setMode(null); setNote(""); };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#7D5406", marginBottom: 4 }}>⚠ Εκκρεμούν εξωτερικοί συνεργάτες ({shown.length})</div>
      {shown.map(t => {
        const m = mode?.taskId === t.id ? mode.kind : null;
        return (
          <div key={t.id} style={{ background: "#FDF3E3", borderRadius: 12, padding: "8px 12px", marginBottom: 4, fontSize: 13 }}>
            <div><b>{t.desc}</b> — {bn(t.boatId)}</div>
            {t.externalNote && <div style={{ color: "#7D5406", fontSize: 13, marginTop: 4 }}>{t.externalNote}</div>}
            {t.progress?.length > 0 && (
              <div style={{ marginTop: 4, fontSize: 13, color: "#6B5410" }}>
                {t.progress.map((p, i) => <div key={i}>✏ {fmtDate(p.at)}: {p.note}</div>)}
              </div>
            )}
            {m === null && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn small color={COLORS.green} onClick={() => startMode(t.id, "complete")}>Ολοκληρώθηκε</Btn>
                <Btn small color={COLORS.teal} outline onClick={() => startMode(t.id, "progress")}>Πρόοδος</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => startMode(t.id, "edit", t.desc)}>Διόρθωση</Btn>
                <Btn small color={COLORS.red} outline onClick={() => startMode(t.id, "confirmDel")}>Διαγραφή</Btn>
                <Btn small color={COLORS.amber} outline onClick={() => onAck(t)}>Το γνωρίζω</Btn>
              </div>
            )}
            {(m === "progress" || m === "complete") && (
              <div style={{ marginTop: 8 }}>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder={m === "complete" ? "π.χ. Ο μηχανικός ολοκλήρωσε την επισκευή" : "π.χ. Ο μηχανικός έφτιαξε το μισό, θα ξανάρθει την Πέμπτη"}
                  style={inputStyle} />
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <Btn small color={COLORS.teal} onClick={() => {
                    if (!note.trim()) return;
                    if (m === "complete") onCloseExternal(t, note.trim()); else onProgress(t, note.trim());
                    cancelMode();
                  }}>Καταχώρηση</Btn>
                  <Btn small color={COLORS.sub} outline onClick={cancelMode}>Άκυρο</Btn>
                </div>
              </div>
            )}
            {m === "edit" && (
              <div style={{ marginTop: 8 }}>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={inputStyle} />
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <Btn small color={COLORS.teal} onClick={() => { if (!note.trim()) return; onEdit(t, note.trim()); cancelMode(); }}>Καταχώρηση</Btn>
                  <Btn small color={COLORS.sub} outline onClick={cancelMode}>Άκυρο</Btn>
                </div>
              </div>
            )}
            {m === "confirmDel" && (
              <div style={{ marginTop: 8, background: "#FBEBE6", borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#8A2A1C", marginBottom: 4 }}>Διαγραφή εργασίας; Δεν αναιρείται.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small color={COLORS.red} onClick={() => { onDelete(t); cancelMode(); }}>Ναι, διαγραφή</Btn>
                  <Btn small color={COLORS.sub} outline onClick={cancelMode}>Άκυρο</Btn>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MyNotes({ me, notes, users }) {
  const [idx, setIdx] = useState(0);
  const mine = notes.filter(n => n.to.includes(me.id) && isNoteVisible(n))
    .sort((a, b) => b.at.localeCompare(a.at));
  if (mine.length === 0) return null;
  const shown = mine[Math.min(idx, mine.length - 1)];
  const senderName = users.find(u => u.id === shown.from)?.name || "Σύστημα";
  const timeAgo = (() => {
    const mins = Math.round((Date.now() - new Date(shown.at).getTime()) / 60000);
    if (mins < 60) return `${mins}λ`;
    return `${Math.round(mins / 60)}ω`;
  })();
  return (
    <div style={{ background: "#FDF3E3", border: `1.5px solid ${COLORS.amber}`, borderRadius: 12, padding: "8px 12px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7D5406", marginBottom: 4 }}>📌 {senderName} · {timeAgo}</div>
          <div style={{ fontSize: 15, lineHeight: 1.4, color: "#33260C" }}>{shown.text}</div>
        </div>
        {mine.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0, alignItems: "center" }}>
            <button onClick={() => setIdx((idx - 1 + mine.length) % mine.length)} style={{ border: "none", background: "none", color: "#7D5406", fontSize: 15, padding: 0, lineHeight: 1 }}>▴</button>
            <div style={{ fontSize: 12, color: "#7D5406" }}>{idx + 1}/{mine.length}</div>
            <button onClick={() => setIdx((idx + 1) % mine.length)} style={{ border: "none", background: "none", color: "#7D5406", fontSize: 15, padding: 0, lineHeight: 1 }}>▾</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SendNote({ me, users, notes, onSend, onDelete }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [text, setText] = useState("");
  const visibleSince = Date.now() - (Number(SET.noteVisibleHours) || 8) * 3600 * 1000;
  const sent = notes.filter(n => n.from === me.id && new Date(n.at).getTime() >= visibleSince).sort((a, b) => b.at.localeCompare(a.at));
  const recipientNames = (ids) => ids.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(", ");
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "none", border: "none", color: COLORS.sub, fontSize: 13, fontWeight: 600, padding: 0, display: "flex", alignItems: "center", gap: 4,
      }}>Μήνυμα σε ομάδα {open ? "▾" : "▸"}</button>
      {open && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {users.filter(u => u.id !== me.id).map(u => (
              <button key={u.id} onClick={() => toggle(u.id)} style={{
                padding: "4px 12px", borderRadius: 12, fontSize: 13, fontWeight: 600,
                border: `1.5px solid ${selected.includes(u.id) ? COLORS.teal : COLORS.line}`,
                background: selected.includes(u.id) ? COLORS.teal : "transparent", color: selected.includes(u.id) ? "#fff" : COLORS.text,
              }}>{u.name}</button>
            ))}
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="π.χ. Παιδιά σήμερα θέλω να ασχοληθείτε με το σκάφος Χ" style={inputStyle} />
          <div style={{ marginTop: 8 }}>
            <Btn small color={COLORS.navy} onClick={() => { if (!selected.length || !text.trim()) return; onSend(selected, text.trim()); setSelected([]); setText(""); }}>Αποστολή</Btn>
          </div>
          {sent.length > 0 && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.line}`, paddingTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.sub, marginBottom: 4 }}>Στάλθηκαν πρόσφατα:</div>
              {sent.map(n => (
                <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "4px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 13 }}>
                  <div><b>{recipientNames(n.to)}</b>: {n.text}</div>
                  <button data-compact onClick={() => onDelete(n.id)} style={{ border: "none", background: "none", color: COLORS.sub, fontSize: 15, fontWeight: 700, whiteSpace: "nowrap" }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MyAbsences({ me, absences, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const mine = absences.filter(a => a.userId === me.id).sort((a, b) => b.from.localeCompare(a.from));
  const upcoming = mine.filter(a => a.to >= todayStr());
  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "none", border: "none", color: COLORS.sub, fontSize: 13, fontWeight: 600, padding: 0, display: "flex", alignItems: "center", gap: 4,
      }}>Απουσίες{upcoming.length > 0 ? ` (${upcoming.length})` : ""} {open ? "▾" : "▸"}</button>
      {open && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginTop: 8 }}>
          {mine.length === 0 && <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 8 }}>Καμία δηλωμένη απουσία.</div>}
          {mine.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 13 }}>
              <span>{fmtDate(a.from)} – {fmtDate(a.to)}{a.note ? ` · ${a.note}` : ""}</span>
              <button data-compact onClick={() => onDelete(a.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700 }}>×</button>
            </div>
          ))}
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: "auto", flex: 1 }} />
            <input type="date" min={from} value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: "auto", flex: 1 }} />
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="π.χ. άδεια, καπετάνιος σε ναύλο (προαιρετικό)" style={{ ...inputStyle, marginTop: 8 }} />
          <div style={{ marginTop: 8 }}>
            <Btn small color={COLORS.navy} onClick={() => { if (!from || !to) return; onAdd(me.id, from, to, note.trim()); setFrom(""); setTo(""); setNote(""); }}>+ Προσθήκη απουσίας</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceComplete({ tasks, boats, onComplete }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState(null);
  const [err, setErr] = useState("");
  const recRef = useRef(null);
  const wakeLockRef = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const requestWakeLock = async () => {
    try { if (typeof navigator !== "undefined" && "wakeLock" in navigator) wakeLockRef.current = await navigator.wakeLock.request("screen"); } catch {}
  };
  const releaseWakeLock = async () => {
    try { await wakeLockRef.current?.release(); } catch {}
    wakeLockRef.current = null;
  };
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible" && listening && !wakeLockRef.current) requestWakeLock(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [listening]);

  const toggleMic = () => {
    setErr("");
    if (listening) { recRef.current?.stop(); setListening(false); releaseWakeLock(); return; }
    if (!SR) { setErr(tr("Η φωνητική αναγνώριση δεν υποστηρίζεται σε αυτή τη συσκευή/browser — γράψε το κείμενο και πάτα Αναγνώριση.")); return; }
    const rec = new SR();
    rec.lang = LANG === "en" ? "en-US" : "el-GR";
    rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add) setText(t => (t + " " + add).trim());
    };
    rec.onerror = () => { setListening(false); releaseWakeLock(); setErr(tr("Πρόβλημα μικροφώνου — δοκίμασε ξανά ή γράψε το κείμενο.")); };
    rec.onend = () => { setListening(false); releaseWakeLock(); };
    recRef.current = rec; rec.start(); setListening(true); requestWakeLock();
  };

  const analyze = async () => {
    if (!text.trim() || busy || !tasks.length) return;
    setBusy(true); setErr(""); setMatches(null);
    try {
      const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
      const list = tasks.map(t => `${t.id}: "${t.desc}" [σκάφος: ${bn(t.boatId)}]`).join("; ");
      const prompt = `Είσαι βοηθός βάσης σκαφών. Ο χρήστης λέει προφορικά ότι ολοκλήρωσε κάποια/ες από τις παρακάτω ανοιχτές εργασίες της βάσης (δικές του ή όχι — μπορεί να βοήθησε σε κάτι που δεν ήταν επίσημα δικό του), περιγράφοντας τι έκανε ή/και τι πρόβλημα υπήρχε (π.χ. "στο Σοφία 2 έφτιαξα την τουαλέτα, είχε πρόβλημα το μοτέρ"). Βρες ΠΟΙΕΣ εργασίες εννοεί, με βάση το σκάφος και την περιγραφή — να είσαι συντηρητικός, βάλε μόνο ό,τι ταιριάζει με σιγουριά. Για κάθε εργασία, γράψε ΣΥΝΤΟΜΑ στα ελληνικά τι έγινε/τι πρόβλημα υπήρχε, όπως προκύπτει από το κείμενο. Αν ο χρήστης αναφέρει ότι το έκανε ΜΑΖΙ ΜΕ κάποιον συνάδελφο (π.χ. "μαζί με τον Φανούρη"), κράτα ρητά αυτή την αναφορά μέσα στη σημείωση — μην την παραλείψεις.
ΕΡΓΑΣΙΕΣ: ${list}
ΚΕΙΜΕΝΟ: "${text.trim()}"
Απάντησε ΜΟΝΟ με JSON χωρίς markdown: {"items":[{"taskId":"...","note":"..."}]}`;
      const raw = await askClaude(prompt, 400);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const items = (parsed.items || [])
        .map(it => ({ task: tasks.find(t => t.id === it.taskId), note: (it.note || "").trim() || text.trim() }))
        .filter(x => x.task);
      if (!items.length) setErr(tr("Δεν βρέθηκε αντίστοιχη εργασία — δοκίμασε πιο συγκεκριμένα (π.χ. όνομα σκάφους)."));
      else setMatches(items);
    } catch { setErr(tr("Η αναγνώριση απέτυχε — δοκίμασε ξανά.")); }
    setBusy(false);
  };

  const confirm = () => {
    matches.forEach(({ task: t, note }) => {
      const conf = t.boatId ? "good" : null;
      onComplete(t, undefined, undefined, conf, note);
    });
    setMatches(null); setText(""); setOpen(false);
  };

  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 12, border: `1.5px solid ${open ? COLORS.green : COLORS.line}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", textAlign: "left", fontSize: 15, fontWeight: 700, color: COLORS.green }}>
        🎤 {tr("Ολοκλήρωση με φωνή")} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <button onClick={toggleMic} style={{
            width: "100%", padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 15,
            border: `2px solid ${listening ? COLORS.red : COLORS.green}`,
            background: listening ? COLORS.red : "transparent", color: listening ? "#fff" : COLORS.green,
          }}>{listening ? "⏹ " + tr("Σταμάτημα") : "🎤 " + tr("Μίλα")}</button>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
            placeholder={tr("π.χ. Στο Σοφία 2 το πόμολο το έφτιαξα μαζί με τον Φανούρη")} style={{ ...inputStyle, marginTop: 8 }} />
          <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>{tr("Δουλεύει σε όλες τις ανοιχτές εργασίες της βάσης, όχι μόνο τις δικές σου — και το «μαζί με τον Χ» καταγράφεται στη σημείωση.")}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn color={COLORS.green} onClick={analyze}>{busy ? tr("Αναγνώριση…") : tr("Αναγνώριση")}</Btn>
            {text && <Btn color={COLORS.sub} outline onClick={() => { setText(""); setMatches(null); }}>{tr("Καθάρισμα")}</Btn>}
          </div>
          {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          {matches && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.sub, marginBottom: 4 }}>{tr("Βρέθηκαν")}:</div>
              {matches.map(({ task: t, note }) => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 8, marginBottom: 4, fontSize: 15, gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div>{t.desc} <span style={{ color: COLORS.sub, fontSize: 13 }}>({boats.find(b => b.id === t.boatId)?.name || "Βάση/Άλλο"})</span></div>
                    {note && (
                      <div style={{ fontSize: 12, color: "#7D5406", marginTop: 4 }}>
                        📝 {note}
                      </div>
                    )}
                  </div>
                  <Btn small color={COLORS.sub} outline onClick={() => setMatches(matches.filter(x => x.task.id !== t.id))}>×</Btn>
                </div>
              ))}
              {matches.length > 0 && <Btn color={COLORS.green} onClick={confirm}>{tr("Ολοκλήρωση")} ({matches.length})</Btn>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TodayView({ me, tasks, allTasks, boats, users, isMgr, canAssign, effectiveDeadline, onComplete, onProgress, onExternal, onEdit, onDelete, onChecklistItem, onSetDeadline, onSetDeadlineDuration, onAddBeforePhotos, onLogFinding, onAssign, onAssignWithDeadline, onDowngrade, onTranslate, onHelp, absences, onAddAbsence, onDeleteAbsence, notes, onSendNote, onDeleteNote, onAckExternal, onCloseExternal }) {
  return (
    <div>
      {/* Πάνω-πάνω μόνο ό,τι εμφανίζεται υπό συνθήκη και απαιτεί προσοχή τώρα. */}
      <ExternalReminders me={me} tasks={allTasks} boats={boats} onAck={onAckExternal} onProgress={onProgress} onCloseExternal={onCloseExternal} onDelete={onDelete} onEdit={onEdit} />
      <MyNotes me={me} notes={notes} users={users} />
      <DailyGreeting me={me} />
      <DeparturesWidget boats={boats} />

      {/* Η δουλειά της ημέρας — φτάνει στην πρώτη οθόνη, χωρίς σκρολάρισμα πάνω από widget. */}
      <SectionTitle>{tr("Οι εργασίες μου")} — {new Date().toLocaleDateString(LANG === "en" ? "en-GB" : "el-GR", { weekday: "long", day: "numeric", month: "long" })}</SectionTitle>
      {allTasks.filter(t => t.status === "open").length > 0 && <VoiceComplete tasks={allTasks.filter(t => t.status === "open")} boats={boats} onComplete={onComplete} />}
      {tasks.length === 0 && <Empty>{tr("Δεν σου έχει ανατεθεί κάτι ονομαστικά. Δες τις διαθέσιμες εργασίες στην καρτέλα «Εργασίες».")}</Empty>}
      {tasks.map(t => <TaskCard key={t.id} t={t} boats={boats} users={users} isMgr={isMgr} me={me} deadline={effectiveDeadline}
        onComplete={onComplete} onProgress={onProgress} onExternal={onExternal} onEdit={onEdit} onDelete={onDelete} onChecklistItem={onChecklistItem} onSetDeadline={onSetDeadline} onSetDeadlineDuration={onSetDeadlineDuration} onAddBeforePhotos={onAddBeforePhotos} onLogFinding={onLogFinding} onTranslate={onTranslate} onHelp={onHelp}
        onAssign={onAssign} onAssignWithDeadline={onAssignWithDeadline} onDowngrade={onDowngrade} canAssign={canAssign} showAssignee={isMgr} />)}

      {/* Σπάνια χρησιμοποιούμενα εργαλεία: στο τέλος, ως διακριτικοί σύνδεσμοι. */}
      <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${COLORS.line}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <MyAbsences me={me} absences={absences} onAdd={onAddAbsence} onDelete={onDeleteAbsence} />
        {canAssign && <SendNote me={me} users={users} notes={notes} onSend={onSendNote} onDelete={onDeleteNote} />}
      </div>
    </div>
  );
}

function TasksView({ tasks, boats, users, isMgr, me, effectiveDeadline, onComplete, onProgress, onExternal, onAssign, onAssignWithDeadline, onDowngrade, onEdit, onDelete, onBulkDelete, canAssign, onChecklistItem, onSetDeadline, onSetDeadlineDuration, onAddBeforePhotos, onLogFinding, onTranslate, onHelp, boatFilter: boatFilterProp, onBoatFilterChange }) {
  const [boatFilterLocal, setBoatFilterLocal] = useState("");
  const [q, setQ] = useState("");
  // Παρατεταμένο πάτημα σε μια εργασία → μπαίνει σε «λειτουργία επιλογής»: εμφανίζεται τσεκ σε όλες τις κάρτες,
  // κι από κει και πέρα ένα απλό πάτημα σε οποιαδήποτε άλλη επιλέγει/αποεπιλέγει — χρήσιμο για μαζική διαγραφή.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState({});
  const pressTimer = useRef(null);
  const startPress = (id) => {
    pressTimer.current = setTimeout(() => { setSelectMode(true); setSelected(s => ({ ...s, [id]: true })); }, 450);
  };
  const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
  const toggleSelect = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const exitSelectMode = () => { setSelectMode(false); setSelected({}); };
  // Το φίλτρο μπορεί να ελέγχεται από τον γονέα (π.χ. deep-link από «Επισκόπηση»), αλλιώς τοπικό state
  const boatFilter = onBoatFilterChange ? (boatFilterProp || "") : boatFilterLocal;
  const setBoatFilter = onBoatFilterChange || setBoatFilterLocal;
  const byBoat = boatFilter ? tasks.filter(t => t.boatId === boatFilter || (boatFilter === "other" && !t.boatId)) : tasks;
  // Χωρίς συγκεκριμένο φίλτρο σκάφους, οι εργασίες σκαφών που βρίσκονται ΤΩΡΑ στη βάση έρχονται πρώτες (πιο άμεσα
  // αξιοποιήσιμες) — αλλά καμία εργασία δεν κρύβεται: όσα ανήκουν σε σκάφος εν πλω απλά ακολουθούν από κάτω, και
  // παραμένουν πάντα αναζητήσιμα επιλέγοντας το συγκεκριμένο σκάφος από το φίλτρο.
  const atBaseNow = (t) => { if (!t.boatId) return true; const b = boats.find(x => x.id === t.boatId); return b ? !isBoatAway(b) : true; };
  const prioritized = boatFilter ? byBoat : [...byBoat].sort((a, c) => (atBaseNow(c) ? 1 : 0) - (atBaseNow(a) ? 1 : 0));
  const qLower = q.trim().toLowerCase();
  const shown = qLower ? prioritized.filter(t => (t.desc || "").toLowerCase().includes(qLower)) : prioritized;
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const bulkDelete = () => {
    const toDelete = shown.filter(t => selected[t.id]);
    if (!toDelete.length) return;
    if (!window.confirm(`Διαγραφή ${toDelete.length} εργασιών; Θα μπουν στον κάδο — μπορείς να τις επαναφέρεις από τη Διοίκηση.`)) return;
    if (onBulkDelete) onBulkDelete(toDelete); else toDelete.forEach(t => onDelete(t));
    exitSelectMode();
  };
  return (
    <div>
      <SectionTitle>{tr("Διαθέσιμες εργασίες")} ({tasks.length})</SectionTitle>
      {selectMode && (
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: COLORS.navy, color: "#fff", borderRadius: 12, padding: "8px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={exitSelectMode} style={{ background: "none", border: "none", color: "#fff", fontSize: 15 }}>✕ {tr("Άκυρο")}</button>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{selectedCount} {tr("επιλεγμένες")}</span>
          <button onClick={bulkDelete} disabled={!selectedCount} style={{ background: "none", border: "none", color: selectedCount ? "#F0857A" : "rgba(255,255,255,.4)", fontSize: 15, fontWeight: 700 }}>🗑 {tr("Διαγραφή")}</button>
        </div>
      )}
      <select value={boatFilter} onChange={e => setBoatFilter(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
        <option value="">{tr("Όλα τα σκάφη")}</option>
        {boats.map(b => <option key={b.id} value={b.id}>{b.name}{isBoatAway(b) ? " (εν πλω)" : ""}</option>)}
        <option value="other">{tr("Βάση / Άλλο")}</option>
      </select>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Αναζήτηση στις εργασίες…" style={{ ...inputStyle, marginBottom: 12 }} />
      {shown.length === 0 && <Empty>{tr("Καμία εργασία εδώ.")}</Empty>}
      {shown.map(t => (
        <div key={t.id} style={{ position: "relative" }}
          onTouchStart={() => startPress(t.id)} onTouchEnd={cancelPress} onTouchMove={cancelPress}
          onMouseDown={() => startPress(t.id)} onMouseUp={cancelPress} onMouseLeave={cancelPress}
          onContextMenu={(e) => { if (selectMode) e.preventDefault(); }}>
          {selectMode && (
            <div onClick={() => toggleSelect(t.id)} style={{ position: "absolute", inset: 0, zIndex: 5, cursor: "pointer" }} />
          )}
          {selectMode && (
            <div style={{
              position: "absolute", top: 10, right: 10, zIndex: 6, width: 24, height: 24, borderRadius: 8,
              border: `2px solid ${COLORS.teal}`, background: selected[t.id] ? COLORS.teal : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,.15)", pointerEvents: "none",
            }}>{selected[t.id] && <span style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>✓</span>}</div>
          )}
          <TaskCard t={t} boats={boats} users={users} isMgr={isMgr} me={me} deadline={effectiveDeadline}
            onComplete={onComplete} onProgress={onProgress} onExternal={onExternal} onAssign={onAssign} onAssignWithDeadline={onAssignWithDeadline} onDowngrade={onDowngrade} onEdit={onEdit} onDelete={onDelete} canAssign={canAssign} showAssignee={isMgr || canAssign} onChecklistItem={onChecklistItem} onSetDeadline={onSetDeadline} onSetDeadlineDuration={onSetDeadlineDuration} onAddBeforePhotos={onAddBeforePhotos} onLogFinding={onLogFinding} onTranslate={onTranslate} onHelp={onHelp} />
        </div>
      ))}
    </div>
  );
}

// Κενή κατάσταση χωρίς κουτί: μια πρόταση σε αέρα, όχι μια άδεια κάρτα που μοιάζει με σφάλμα.
const Empty = ({ children }) => <div style={{ padding: "24px 16px", color: COLORS.sub, fontSize: T.body, textAlign: "center", lineHeight: 1.55 }}>{children}</div>;

function NewTask({ boats, quick, users, isMgr, onAdd, onAddMany, onAddParsed }) {
  const [boatId, setBoatId] = useState("");
  const [desc, setDesc] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [multi, setMulti] = useState(false);
  const [purchase, setPurchase] = useState(false);
  const [backlog, setBacklog] = useState(false);
  const [photos, setPhotos] = useState([]);
  const fileRef = useRef(null);
  const submit = () => {
    if (!desc.trim()) return;
    if (multi) {
      const lines = desc.split("\n").map(l => l.trim()).filter(Boolean);
      if (!lines.length) return;
      onAddMany({ boatId: boatId || null, urgent: backlog ? false : urgent, assignedTo: (isMgr && assignTo && !backlog) ? assignTo : null, purchase: backlog ? false : purchase, backlog }, lines);
    } else {
      onAdd({ boatId: boatId || null, desc: desc.trim(), urgent: backlog ? false : urgent, assignedTo: (isMgr && assignTo && !backlog) ? assignTo : null, purchase: backlog ? false : purchase, backlog }, photos);
    }
    setDesc(""); setUrgent(false); setAssignTo(""); setBoatId(""); setMulti(false); setPurchase(false); setBacklog(false); setPhotos([]);
  };
  return (
    <div>
      <SectionTitle>{tr("Νέα εργασία")}</SectionTitle>
      <VoiceEntry boats={boats} onAddParsed={onAddParsed} />
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 16 }}>
        <label style={lbl}>{tr("Σκάφος")}</label>
        <select value={boatId} onChange={e => setBoatId(e.target.value)} style={inputStyle}>
          <option value="">{tr("Βάση / Άλλο (van, εργαλεία…)")}</option>
          {boats.map(b => <option key={b.id} value={b.id}>{b.name}{isBoatAway(b) ? ` (${tr("εν πλω")})` : ""}</option>)}
        </select>

        <label style={lbl}>{tr("Περιγραφή")}</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={multi ? 6 : 3}
          placeholder={multi ? tr("Μία εργασία ανά γραμμή, π.χ.:\nΠαράθυρο σπασμένο\nΤο φως στην πλώρη δεν ανάβει\nΗ σκότα θέλει αλλαγή") : tr("π.χ. Το πόμολο στη δεξιά πόρτα της καμπίνας έχει χαλάσει")} style={inputStyle} />
        <button onClick={() => setMulti(!multi)} style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700,
          border: `1.5px solid ${COLORS.teal}`, background: multi ? COLORS.teal : "transparent", color: multi ? "#fff" : COLORS.teal,
        }}>≡ {multi ? tr("Πολλαπλές εργασίες: ΝΑΙ — μία ανά γραμμή") : tr("Πολλαπλές εργασίες μαζί (μία ανά γραμμή)")}</button>

        <button onClick={() => setUrgent(!urgent)} style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700,
          border: `1.5px solid ${COLORS.red}`, background: urgent ? COLORS.red : "transparent", color: urgent ? "#fff" : COLORS.red,
        }}>🔴 {urgent ? tr("ΕΠΕΙΓΟΝ — σοβαρό πρόβλημα") : tr("Μαρκάρισμα ως επείγον (σοβαρό πρόβλημα)")}</button>

        <button onClick={() => setPurchase(!purchase)} style={{
          marginTop: 8, width: "100%", padding: "12px", borderRadius: 12, fontWeight: 700, fontSize: 15,
          border: `2px solid ${COLORS.amber}`, background: purchase ? COLORS.amber : "transparent", color: purchase ? "#fff" : COLORS.amber,
        }}>🛒 {purchase ? tr("ΑΓΟΡΑ / ΛΕΙΨΗ ΥΛΙΚΟΥ — θα ανατεθεί στον Λεωνίδα") : tr("Λείπει υλικό / χρειάζεται αγορά")}</button>

        <button onClick={() => setBacklog(!backlog)} style={{
          marginTop: 8, width: "100%", padding: "12px", borderRadius: 12, fontWeight: 700, fontSize: 15,
          border: `2px solid ${COLORS.sub}`, background: backlog ? COLORS.sub : "transparent", color: backlog ? "#fff" : COLORS.sub,
        }}>⏳ {backlog ? tr("ΑΝΑΜΟΝΗ — δεν εμφανίζεται τώρα, το AI θα τη βάλει όταν υπάρχει κενό") : tr("Βάλε σε αναμονή (όχι τώρα — να τη θυμάται το AI για αργότερα)")}</button>

        {isMgr && (
          <>
            <label style={lbl}>Ανάθεση σε συγκεκριμένο άτομο (προαιρετικό)</label>
            <select value={assignTo} onChange={e => setAssignTo(e.target.value)} style={inputStyle}>
              <option value="">Ελεύθερη — θα κατανεμηθεί από το AI ή όποιον την πιάσει</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </>
        )}

        <label style={lbl}>{tr("Φωτογραφίες (προαιρετικό)")}</label>
        <input ref={fileRef} type="file" accept="image/*" multiple capture="environment"
          onChange={e => setPhotos(prev => [...prev, ...Array.from(e.target.files || [])])}
          style={{ display: "none" }} />
        <button onClick={() => fileRef.current?.click()} style={{
          width: "100%", padding: "8px", borderRadius: 8, border: `1.5px dashed ${COLORS.teal}`,
          background: "transparent", color: COLORS.teal, fontSize: 13, fontWeight: 600,
        }}>📷 {tr("Προσθήκη φωτογραφίας")}</button>
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {photos.map((f, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}` }} />
                <button data-compact onClick={() => setPhotos(photos.filter((_, j) => j !== i))} style={{
                  position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 999, border: "none",
                  background: COLORS.red, color: "#fff", fontSize: 12, lineHeight: "22px", padding: 0,
                }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <Btn color={COLORS.navy} onClick={submit}>{tr("Καταχώρηση εργασίας")}</Btn>
        </div>
      </div>
    </div>
  );
}
const lbl = { display: "block", fontSize: 13, fontWeight: 700, color: COLORS.sub, margin: "12px 0 4px" };


function VoiceEntry({ boats, onAddParsed }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const recRef = useRef(null);
  const wakeLockRef = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const requestWakeLock = async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch { /* not supported / denied — ignore, non-critical */ }
  };
  const releaseWakeLock = async () => {
    try { await wakeLockRef.current?.release(); } catch {}
    wakeLockRef.current = null;
  };

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && listening && !wakeLockRef.current) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [listening]);

  const toggleMic = () => {
    setErr("");
    if (listening) { recRef.current?.stop(); setListening(false); releaseWakeLock(); return; }
    if (!SR) { setErr(tr("Η φωνητική αναγνώριση δεν υποστηρίζεται σε αυτή τη συσκευή/browser — γράψε το κείμενο και πάτα Ανάλυση.")); return; }
    const rec = new SR();
    rec.lang = LANG === "en" ? "en-US" : "el-GR";
    rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add) setText(t => (t + " " + add).trim());
    };
    rec.onerror = () => { setListening(false); releaseWakeLock(); setErr(tr("Πρόβλημα μικροφώνου — δοκίμασε ξανά ή γράψε το κείμενο.")); };
    rec.onend = () => { setListening(false); releaseWakeLock(); };
    recRef.current = rec; rec.start(); setListening(true); requestWakeLock();
  };

  const analyze = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(""); setItems(null);
    try {
      const prompt = `Είσαι σύστημα καταγραφής εργασιών σε βάση σκαφών. Ο χρήστης περιγράφει προφορικά προβλήματα/εργασίες. Ανάλυσε το κείμενο σε ΞΕΧΩΡΙΣΤΕΣ εργασίες.
Σκάφη της βάσης: ${boats.map(b => b.name).join(", ")}. Αν αναφέρεται σκάφος (έστω με μικρή παραλλαγή/χωρίς τόνους), αντιστοίχισέ το στο σωστό όνομα από τη λίστα, αλλιώς boat: null.
Για κάθε εργασία: σύντομη, καθαρή, επαγγελματική περιγραφή στα ελληνικά (π.χ. "Αντικατάσταση σκότας", "Επισκευή φωτός πλώρης"). urgent: true ΜΟΝΟ αν το κείμενο δείχνει σοβαρό/επείγον πρόβλημα (διαρροή, τρύπα, κίνδυνος).
purchase: true αν η εργασία αφορά κάτι που λείπει, δεν υπάρχει, ή πρέπει να αγοραστεί/προμηθευτεί (π.χ. "μας λείπουν 20άκια", "δεν έχουμε βίδες", "θέλει αγορά", "να το φέρουν από το γραφείο/κατάστημα") — διαφορετικά false.
ΚΕΙΜΕΝΟ: "${text.trim()}"
Απάντησε ΜΟΝΟ με JSON χωρίς markdown: {"tasks":[{"boat":"...ή null","desc":"...","urgent":false,"purchase":false}]}`;
      const raw = await askClaude(prompt, 800);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const mapped = (parsed.tasks || []).map(t => {
        const boat = boats.find(b => b.name === t.boat) || boats.find(b => t.boat && b.name.toLowerCase().includes(String(t.boat).toLowerCase()));
        return { boatId: boat ? boat.id : "", desc: t.desc || "", urgent: !!t.urgent, purchase: !!t.purchase };
      }).filter(t => t.desc);
      if (!mapped.length) setErr(tr("Δεν αναγνωρίστηκαν εργασίες — δοκίμασε πιο συγκεκριμένη διατύπωση."));
      else setItems(mapped);
    } catch { setErr(tr("Η ανάλυση απέτυχε — δοκίμασε ξανά.")); }
    setBusy(false);
  };

  const upd = (i, patch) => setItems(items.map((x, j) => j === i ? { ...x, ...patch } : x));

  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 12, border: `1.5px solid ${open ? COLORS.teal : COLORS.line}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", textAlign: "left", fontSize: 15, fontWeight: 700, color: COLORS.teal }}>
        🎤 {tr("Φωνητική καταχώρηση με AI")} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={toggleMic} style={{
              flex: 1, padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 15,
              border: `2px solid ${listening ? COLORS.red : COLORS.teal}`,
              background: listening ? COLORS.red : "transparent", color: listening ? "#fff" : COLORS.teal,
            }}>{listening ? "⏹ " + tr("Σταμάτημα") : "🎤 " + tr("Μίλα")}</button>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
            placeholder={tr("π.χ. Στον Λεωνίδα το παράθυρο είναι σπασμένο, δεν ανάβει το φως στην πλώρη και θέλει αλλαγή η σκότα")}
            style={inputStyle} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn color={COLORS.navy} onClick={analyze}>{busy ? tr("Ανάλυση…") : tr("Ανάλυση με AI")}</Btn>
            {text && <Btn color={COLORS.sub} outline onClick={() => { setText(""); setItems(null); }}>{tr("Καθάρισμα")}</Btn>}
          </div>
          {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          {items && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.sub, marginBottom: 4 }}>{tr("Προεπισκόπηση — έλεγξε και διόρθωσε πριν την καταχώρηση")}:</div>
              {items.map((it, i) => (
                <div key={i} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 8, marginBottom: 8 }}>
                  <input value={it.desc} onChange={e => upd(i, { desc: e.target.value })} style={{ ...inputStyle, marginBottom: 4 }} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={it.boatId} onChange={e => upd(i, { boatId: e.target.value })} style={{ ...inputStyle, width: "auto", flex: 1 }}>
                      <option value="">{tr("Βάση / Άλλο")}</option>
                      {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button onClick={() => upd(i, { urgent: !it.urgent })} style={{
                      padding: "8px 8px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: `1.5px solid ${COLORS.red}`, background: it.urgent ? COLORS.red : "transparent", color: it.urgent ? "#fff" : COLORS.red,
                    }}>🔴</button>
                    <button onClick={() => upd(i, { purchase: !it.purchase })} title={tr("Λείπει υλικό / χρειάζεται αγορά")} style={{
                      padding: "8px 8px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                      border: `1.5px solid ${COLORS.amber}`, background: it.purchase ? COLORS.amber : "transparent", color: it.purchase ? "#fff" : COLORS.amber,
                    }}>🛒</button>
                    <Btn small color={COLORS.sub} outline onClick={() => setItems(items.filter((_, j) => j !== i))}>×</Btn>
                  </div>
                </div>
              ))}
              <Btn color={COLORS.green} onClick={() => { onAddParsed(items); setItems(null); setText(""); setOpen(false); }}>
                ✔ {tr("Καταχώρηση όλων")} ({items.length})
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceBook({ boats, tasks, users, isMgr, onDelete, onToggleService }) {
  const [boatId, setBoatId] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const doneAll = tasks.filter(t => t.status === "done" && (boatId ? t.boatId === boatId : true))
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  const bn = (id) => boats.find(b => b.id === id)?.name || tr("Βάση / Άλλο");
  const visible = showAll ? doneAll : doneAll.filter(t => t.serviceRelevant);
  const qLower = q.trim().toLowerCase();
  const done = qLower ? visible.filter(t => (t.desc || "").toLowerCase().includes(qLower) || (t.completionNote || "").toLowerCase().includes(qLower) || bn(t.boatId).toLowerCase().includes(qLower)) : visible;
  const exportCsv = () => {
    const rows = [["Σκάφος", "Περιγραφή", "Ημερομηνία", "Ολοκληρώθηκε από", "Σημείωση"]];
    done.forEach(t => rows.push([bn(t.boatId), t.desc || "", fmtDate(t.completedAt), users.find(u => u.id === t.completedBy)?.name || "", t.completionNote || ""]));
    downloadCsv(`service-book-${todayStr()}.csv`, rows);
  };
  return (
    <div>
      <SectionTitle>{tr("Βιβλίο service")}</SectionTitle>
      <select value={boatId} onChange={e => setBoatId(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }}>
        <option value="">{tr("Όλα τα σκάφη")}</option>
        {boats.map(b => <option key={b.id} value={b.id}>{b.name}{isBoatAway(b) ? " (εν πλω)" : ""}</option>)}
      </select>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Αναζήτηση σε περιγραφή, σημείωση, σκάφος…" style={{ ...inputStyle, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {isMgr && (
          <button onClick={() => setShowAll(!showAll)} style={{
            padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: `1.5px solid ${COLORS.sub}`, background: showAll ? COLORS.sub : "transparent", color: showAll ? "#fff" : COLORS.sub,
          }}>{showAll ? "Δείχνω όλες τις ολοκληρωμένες" : "Δείξε και τις ρουτίνας"}</button>
        )}
        {isMgr && done.length > 0 && (
          <button onClick={exportCsv} style={{
            padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: `1.5px solid ${COLORS.teal}`, background: "transparent", color: COLORS.teal,
          }}>⬇ Εξαγωγή CSV</button>
        )}
      </div>
      {done.length === 0 && <Empty>{tr("Καμία ολοκληρωμένη εργασία ακόμα.")}</Empty>}
      {done.map(t => {
        const boat = boats.find(b => b.id === t.boatId);
        return (
          <div key={t.id} style={{ background: COLORS.card, borderRadius: 12, padding: "12px 12px", marginBottom: 8, fontSize: 15 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>{t.desc}</div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {isMgr && (
                  <button onClick={() => onToggleService(t)} title={t.serviceRelevant ? "Αφαίρεση από βιβλίο service" : "Προσθήκη στο βιβλίο service"}
                    style={{ border: "none", background: "none", color: t.serviceRelevant ? COLORS.teal : COLORS.sub, fontSize: 15, padding: "0px 4px" }}>
                    {t.serviceRelevant ? "🔧✓" : "🔧+"}
                  </button>
                )}
                {isMgr && confirmId !== t.id && (
                  <button data-compact onClick={() => setConfirmId(t.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", padding: "0px 4px" }}>🗑</button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 13, color: COLORS.sub, marginTop: 4 }}>
              {boat ? boat.name : tr("Βάση / Άλλο")} · {fmtDate(t.completedAt)}
              {t.closedAsExternal && " · " + tr("εξωτερικός συνεργάτης")}
              {isMgr && t.completedBy && ` · ${users.find(u => u.id === t.completedBy)?.name || ""}`}
              {isMgr && t.returns > 0 && ` · ↩ ${t.returns} επιστροφή/ές`}
              {t.checklistItems && (() => { const p = t.checklistItems.filter(it => it.status === "problem").length; return p > 0 ? ` · ⚠ ${p} σημεία με πρόβλημα` : " · ✔ όλα εντάξει"; })()}
            </div>
            {confirmId === t.id && (
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <Btn small color={COLORS.red} onClick={() => { onDelete(t); setConfirmId(null); }}>{tr("Ναι, διαγραφή")}</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setConfirmId(null)}>{tr("Άκυρο")}</Btn>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Διοίκηση (manager + owner) ----------
function AdminView(props) {
  const { me, users, boats, tasks, quick, checklist, closingChecklist, boatNotes, onAddBoatNote, onDeleteBoatNote, aiMemories, onAddMemory, onDeleteMemory, onAddScheduled, absences, persistUsers, persistBoats, persistQuick, persistChecklist, persistClosingChecklist,
    setDeparture, cancelCharter, onReturnBoat, onSetNextCharter, onReturn, onCloseExternal, onDowngrade, onRate, runDistribution, generateClosingChecks, effectiveDeadline, settings, updateSettings, resetSettings, showToast, onViewAs, realOwner, onAddAbsence, onDeleteAbsence, onGoToBoatTasks, section, setSection, tasksRaw, onRestore } = props;
  const isOwner = me.role === "owner";
  // Δύο επίπεδα αντί για 12 καρτέλες σε οριζόντιο scroll: 4 ομάδες που χωράνε όλες στην οθόνη, και από κάτω
  // μόνο οι υποενότητες της επιλεγμένης ομάδας. Τίποτα δεν κρύβεται εκτός οθόνης πια.
  const GROUPS = [
    ["day", "Καθημερινά", [["overview", "Επισκόπηση"], ["control", "Έλεγχος"]]],
    ["base", "Βάση", [["boats", "Σκάφη"], ["lists", "Λίστες"]]],
    ["team", "Ομάδα", [["profiles", "Προφίλ"], ["stats", "Στατιστικά"], ["absences", "Απουσίες"]]],
    ["sys", "Σύστημα", [
      ["settings", "Ρυθμίσεις"], ["ai", "AI"], ["trash", `Κάδος${tasksRaw?.length ? ` (${tasksRaw.length})` : ""}`],
      ...(isOwner ? [["errors", "Σφάλματα"], ["usersS", "Χρήστες"]] : []),
    ]],
  ];
  const activeGroup = GROUPS.find(g => g[2].some(([id]) => id === section)) || GROUPS[0];
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {GROUPS.map(([gid, glabel, items]) => {
          const on = activeGroup[0] === gid;
          return (
            <button key={gid} onClick={() => setSection(items[0][0])} style={{
              flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${on ? COLORS.navy : COLORS.line}`,
              background: on ? COLORS.navy : COLORS.card, color: on ? "#fff" : COLORS.sub,
            }}>{glabel}</button>
          );
        })}
      </div>
      {activeGroup[2].length > 1 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          {activeGroup[2].map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} style={{
              background: "none", border: "none", padding: "0px 0", fontSize: 13,
              fontWeight: section === id ? 700 : 500,
              color: section === id ? COLORS.navy : COLORS.sub,
              borderBottom: `2px solid ${section === id ? COLORS.navy : "transparent"}`,
            }}>{label}</button>
          ))}
        </div>
      )}
      {section === "overview" && <Overview boats={boats} tasks={tasks} effectiveDeadline={effectiveDeadline} runDistribution={runDistribution} generateClosingChecks={generateClosingChecks} settings={settings} users={users} me={me} absences={absences} onBoatClick={onGoToBoatTasks} />}
      {section === "control" && <ControlPanel tasks={tasks} boats={boats} users={users} onReturn={onReturn} onCloseExternal={onCloseExternal} onDowngrade={onDowngrade} onRate={onRate} onDelete={props.onDelete} />}
      {section === "boats" && <BoatsAdmin boats={boats} tasks={tasks} boatNotes={boatNotes} onAddBoatNote={onAddBoatNote} onDeleteBoatNote={onDeleteBoatNote} isMgr={me.role === "manager" || me.role === "owner"} persistBoats={persistBoats} setDeparture={setDeparture} cancelCharter={cancelCharter} onReturnBoat={onReturnBoat} onSetNextCharter={onSetNextCharter} showToast={showToast} />}
      {section === "lists" && <ListsAdmin quick={quick} checklist={checklist} closingChecklist={closingChecklist} persistQuick={persistQuick} persistChecklist={persistChecklist} persistClosingChecklist={persistClosingChecklist} />}
      {section === "absences" && <AbsencesAdmin users={users} absences={absences} onAdd={onAddAbsence} onDelete={onDeleteAbsence} />}
      {section === "stats" && <Stats users={users} tasks={tasks} boats={boats} />}
      {section === "ai" && <AiSearch tasks={tasks} boats={boats} users={users} aiMemories={aiMemories} onAddMemory={onAddMemory} onDeleteMemory={onDeleteMemory} onAddScheduled={onAddScheduled} onDeleteTask={props.onDelete} />}
      {section === "profiles" && <ProfilesView users={users} me={me} onViewAs={onViewAs} persistUsers={persistUsers} />}
      {section === "settings" && <SettingsAdmin settings={settings} updateSettings={updateSettings} resetSettings={resetSettings} />}
      {section === "trash" && <TrashAdmin tasks={tasksRaw} boats={boats} users={users} onRestore={onRestore} />}
      {section === "errors" && isOwner && <ErrorsAdmin />}
      {section === "usersS" && isOwner && <UsersAdmin users={users} persistUsers={persistUsers} me={me} onViewAs={realOwner ? onViewAs : null} />}
    </div>
  );
}

// ---------- Κάδος ανακύκλωσης: διαγραμμένες εργασίες, ανακτήσιμες ----------
function TrashAdmin({ tasks, boats, users, onRestore }) {
  const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
  const un = (id) => users.find(u => u.id === id)?.name || "";
  const sorted = [...(tasks || [])].sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
  return (
    <div>
      <SectionTitle>Κάδος ανακύκλωσης</SectionTitle>
      <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 8 }}>Διαγραμμένες εργασίες — η επαναφορά τις ξαναβάζει ακριβώς στην κατάσταση που ήταν πριν διαγραφούν.</div>
      {sorted.length === 0 && <Empty>Ο κάδος είναι άδειος.</Empty>}
      {sorted.map(t => (
        <div key={t.id} style={{ background: COLORS.card, borderRadius: 12, padding: "12px 12px", marginBottom: 8, fontSize: 15 }}>
          <div style={{ fontWeight: 600 }}>{t.desc}</div>
          <div style={{ fontSize: 13, color: COLORS.sub, marginTop: 4 }}>
            {bn(t.boatId)} · διαγράφηκε {fmtDate(t.deletedAt)}{t.deletedBy ? ` από ${un(t.deletedBy)}` : ""}
          </div>
          <div style={{ marginTop: 8 }}>
            <Btn small color={COLORS.teal} onClick={() => onRestore(t)}>Επαναφορά</Btn>
          </div>
        </div>
      ))}
    </div>
  );
}


function WeeklyReport({ tasks, users, me, boats, absences }) {
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const allowed = me.role === "owner" || ["Φανούρης", "Αλέξανδρος"].includes(me.name);
  const weekKey = (() => { const d = new Date(); const day = d.getDay(); const back = day === 0 ? 0 : day; d.setDate(d.getDate() - back); return dateStrOf(d); })();
  const genReport = async (auto) => {
    if (busy) return; setBusy(true);
    try {
      const from = new Date(); from.setDate(from.getDate() - 7);
      const fromStr = dateStrOf(from);
      const inW = (d) => d && new Date(d) >= from;
      const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση";
      const team = users.filter(u => u.role === "employee" && !u.noStats);
      const data = team.map(u => {
        const done = tasks.filter(t => t.completedBy === u.id && t.status === "done" && inW(t.completedAt)).map(t => `"${t.desc}" (${bn(t.boatId)})${t.returns ? " [επιστράφηκε " + t.returns + "x]" : ""}${t.rating ? ` [αξιολόγηση manager: ${t.rating}/5]` : ""}${t.autoGenerated ? " [αυτόματη ανάθεση χαμηλού φόρτου]" : ""}${t.intensive && !(t.photosAfter?.length) ? " [ΧΩΡΙΣ φωτογραφία αποτελέσματος, παρότι ζητήθηκε]" : ""}`);
        const prog = tasks.reduce((s2, t) => s2 + (t.progress || []).filter(p => p.by === u.id && inW(p.at)).length, 0);
        const found = tasks.filter(t => t.createdBy === u.id && inW(t.createdAt)).length;
        const absPeriods = (absences || []).filter(a => a.userId === u.id && a.from <= todayStr() && a.to >= fromStr).map(a => `${fmtDate(a.from)}–${fmtDate(a.to)}${a.note ? " (" + a.note + ")" : ""}`);
        const absNote = absPeriods.length ? ` ΑΠΟΥΣΙΑΣΕ αυτή την εβδομάδα: ${absPeriods.join(", ")}.` : "";
        return `${u.name}: Ολοκλήρωσε [${done.join("; ") || "τίποτα"}]. Πρόοδοι σε μεγάλες εργασίες: ${prog}. Εντόπισε/κατέγραψε νέες: ${found}.${absNote}`;
      }).join("\n");
      const prompt = `Είσαι σύμβουλος απόδοσης ομάδας σε βάση σκαφών charter. Γράψε ΣΥΝΟΠΤΙΚΗ εβδομαδιαία αναφορά (150-250 λέξεις, ελληνικά) για τη διοίκηση, με βάση τα δεδομένα.
ΟΔΗΓΙΕΣ: Κρίνε κάθε ολοκληρωμένη εργασία με συντελεστή βαρύτητας 1-5 (1=ασήμαντη π.χ. βίδωμα/λάμπα/απλό πλύσιμο, 5=βαριά π.χ. αλλαγή θερμοσίφωνα, στεγανοποίηση παραθύρων, επισκευή μηχανισμών). Όπου υπάρχει "αξιολόγηση manager" σε μια εργασία, αυτή είναι η δική του κρίση για την ΠΟΙΟΤΗΤΑ εκτέλεσης (1=κακή, 5=άριστη) — συνυπολόγισέ την ΞΕΧΩΡΙΣΤΑ από τη δική σου εκτίμηση βαρύτητας, καθώς αντικατοπτρίζει άμεση επιτόπια κρίση. Οι εργασίες με ένδειξη "αυτόματη ανάθεση χαμηλού φόρτου" δόθηκαν επειδή ο υπάλληλος δεν είχε άλλη δουλειά εκείνη τη στιγμή — μέτρα τες κανονικά αλλά μην τις θεωρήσεις σημάδι χαμηλής απόδοσης από μόνες τους. Η ένδειξη "ΧΩΡΙΣ φωτογραφία αποτελέσματος" σε εργασία που τη ζητούσε είναι αρνητικό σημάδι — ο υπάλληλος δεν τεκμηρίωσε τη δουλειά του παρότι έπρεπε· ανάφερέ το. Σύγκρινε κάθε άτομο με τον μέσο όρο της ομάδας σε ΣΤΑΘΜΙΣΜΕΝΟ έργο (όχι σκέτο πλήθος). Επισήμανε μοτίβα: ποιος σηκώνει βαριές δουλειές, ποιος διαλέγει μόνο εύκολες (π.χ. μόνο πλυσίματα), ποιος έχει χαμηλή παραγωγή, ποιος εντοπίζει προβλήματα, επιστροφές ατελών, χαμηλές/υψηλές αξιολογήσεις manager, λείπουσες φωτογραφίες τεκμηρίωσης. Ευθύς αλλά δίκαιος. ΣΗΜΑΝΤΙΚΟ: αν κάποιος είχε δηλωμένη απουσία μέρος ή όλη την εβδομάδα, ΜΗΝ τον συγκρίνεις άδικα με όσους ήταν παρόντες όλη την εβδομάδα — ανάφερε ουδέτερα ότι απουσίαζε τις συγκεκριμένες μέρες και αξιολόγησε μόνο τις μέρες παρουσίας του.
ΔΕΔΟΜΕΝΑ ΕΒΔΟΜΑΔΑΣ:\n${data}`;
      const text = await askClaude(prompt, 900);
      if (text) { await save("weekly-report-" + weekKey, { text, at: new Date().toISOString() }); setRep({ text }); if (!auto) setOpen(true); }
    } catch {}
    setBusy(false);
  };
  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const r = await load("weekly-report-" + weekKey, null);
      if (r) { setRep(r); return; }
      const now = new Date();
      if (SET.autoWeeklyReport !== false && now.getDay() === (Number(SET.weeklyReportDay) ?? 0) && now.getHours() >= (Number(SET.weeklyReportHour) || 17)) genReport(true);
    })();
  }, []);
  if (!allowed) return null;
  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 12, border: `1.5px solid ${COLORS.navy}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => rep && setOpen(!open)} style={{ background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 4, cursor: rep ? "pointer" : "default" }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>📊 Εβδομαδιαία αναφορά ομάδας</div>
          {rep && <span style={{ fontSize: 12, color: COLORS.sub }}>{open ? "▾" : "▸"}</span>}
        </button>
        <Btn small color={COLORS.navy} outline onClick={() => genReport(false)}>{busy ? "Σύνταξη…" : rep ? "↻ Νέα" : "Δημιουργία"}</Btn>
      </div>
      {rep
        ? (open
            ? <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{rep.text}</div>
            : <div onClick={() => setOpen(true)} style={{ marginTop: 8, fontSize: 13, color: COLORS.sub, cursor: "pointer" }}>
                {rep.text.slice(0, 90)}… <span style={{ color: COLORS.teal, fontWeight: 600 }}>περισσότερα</span>
              </div>)
        : <div style={{ marginTop: 8, fontSize: 13, color: COLORS.sub }}>Δημιουργείται αυτόματα κάθε Κυριακή απόγευμα — ή πάτα «Δημιουργία» όποτε θες ενδιάμεση εικόνα.</div>}
    </div>
  );
}

function Overview({ boats, tasks, effectiveDeadline, runDistribution, generateClosingChecks, settings, users, me, absences, onBoatClick }) {
  const [boatListOpen, setBoatListOpen] = useState(false);
  const urgent = tasks.filter(t => t.status === "open" && t.urgent);
  const external = tasks.filter(t => t.status === "external");
  const purchases = tasks.filter(t => t.status === "open" && t.purchase);
  const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
  // Ενοποιημένη λίστα σκαφών: αναχωρήσεις + ανοιχτές εργασίες μαζί, ένα card, tap → Εργασίες φιλτραρισμένες.
  // Χρησιμοποιεί τις κοινές συναρτήσεις isBoatAway/nextDeparture (ίδιες σε όλη την εφαρμογή) — ένα σκάφος που
  // επιστρέφει σήμερα φαίνεται εδώ κανονικά, και τυχόν γρήγορη επόμενη αναχώρησή του δεν χάνεται.
  const boatRows = boats
    .filter(b => !isBoatAway(b))
    .map(b => {
      const s = boatStatus(b);
      const nd = nextDeparture(b);
      const hasDeparture = !!nd;
      const openCount = tasks.filter(t => t.boatId === b.id && t.status === "open").length;
      return { b, s, hasDeparture, departureDate: nd?.date || null, departureDays: nd?.days ?? null, openCount };
    })
    .filter(x => x.hasDeparture || x.openCount > 0)
    .sort((x, y) => {
      const xUrgent = x.hasDeparture && x.openCount > 0;
      const yUrgent = y.hasDeparture && y.openCount > 0;
      if (xUrgent !== yUrgent) return xUrgent ? -1 : 1;
      if (x.hasDeparture !== y.hasDeparture) return x.hasDeparture ? -1 : 1;
      if (x.hasDeparture && y.hasDeparture) return x.departureDays - y.departureDays;
      return y.openCount - x.openCount;
    });
  return (
    <div>
      <SectionTitle>Εικόνα εβδομάδας</SectionTitle>
      <WeeklyReport tasks={tasks} users={users} me={me} boats={boats} absences={absences} />
      {(urgent.length > 0 || external.length > 0) && (
        <div style={{ background: "#FBEBE6", borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 15 }}>
          {urgent.length > 0 && <div style={{ fontWeight: 700, color: COLORS.red }}>🔴 {urgent.length} επείγουσες εργασίες σοβαρότητας</div>}
          {external.length > 0 && <div style={{ fontWeight: 700, color: "#7D5406", marginTop: 4 }}>⚠ Εκκρεμούν εξωτερικοί συνεργάτες:</div>}
          {external.map(t => <div key={t.id} style={{ fontSize: 13, color: "#7D5406", paddingLeft: 8 }}>• {t.desc} — {bn(t.boatId)}</div>)}
          <div style={{ fontSize: 13, color: COLORS.sub, marginTop: 4 }}>Λεπτομέρειες/κλείσιμο στην καρτέλα «Έλεγχος».</div>
        </div>
      )}
      {purchases.length > 0 && (
        <div style={{ background: "#FDF3E3", borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 15 }}>
          <div style={{ fontWeight: 700, color: "#7D5406" }}>🛒 Ελλείψεις / προς αγορά ({purchases.length}) — ανατεθειμένα στον Λεωνίδα:</div>
          {purchases.map(t => <div key={t.id} style={{ fontSize: 13, color: "#6B5410", paddingLeft: 8, marginTop: 4 }}>• {t.desc} — {bn(t.boatId)}</div>)}
        </div>
      )}
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <button onClick={() => setBoatListOpen(!boatListOpen)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, textAlign: "left" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.navy }}>Σκάφη — αναχωρήσεις & ανοιχτές εργασίες</span>
          <span style={{ fontSize: 13, color: COLORS.sub, fontWeight: 700 }}>{!boatListOpen ? `${boatRows.length} ▸` : "▾"}</span>
        </button>
        {boatListOpen && (
          <div style={{ marginTop: 8 }}>
            {boatRows.length === 0 && <div style={{ color: COLORS.sub, fontSize: 15 }}>Καμία δηλωμένη αναχώρηση ή ανοιχτή εργασία αυτή τη στιγμή.</div>}
            {boatRows.map(({ b, s, hasDeparture, departureDate, departureDays, openCount }, i) => {
              const du = departureDays;
              const urgentRow = hasDeparture && du <= 2;
              const soonRow = !urgentRow && hasDeparture && du <= 7;
              const badgeBg = urgentRow ? COLORS.red : soonRow ? COLORS.amber : COLORS.bg;
              const badgeColor = urgentRow || soonRow ? "#fff" : COLORS.sub;
              return (
                <button key={b.id} onClick={() => onBoatClick && onBoatClick(b.id)} style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 0px", borderBottom: i < boatRows.length - 1 ? `1px solid ${COLORS.line}` : "none", fontSize: 15,
                  background: "none", border: "none", borderBottomStyle: i < boatRows.length - 1 ? "solid" : "none", textAlign: "left", cursor: onBoatClick ? "pointer" : "default",
                }}>
                  <span style={{ fontWeight: 500, color: COLORS.text }}>{b.name}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {hasDeparture && (
                      <span style={{ color: urgentRow ? COLORS.red : COLORS.sub, fontSize: 13 }}>
                        {fmtDate(departureDate)} ({du <= 0 ? "σήμερα" : `σε ${du}μ`})
                      </span>
                    )}
                    {openCount > 0 ? (
                      <span style={{
                        minWidth: 22, height: 22, padding: "0 4px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: badgeBg, color: badgeColor,
                      }}>{openCount}</span>
                    ) : (
                      <span style={{ color: COLORS.green, fontSize: 15 }}>✓</span>
                    )}
                    {onBoatClick && <span style={{ color: COLORS.sub, fontSize: 13 }}>›</span>}
                  </span>
            </button>
          );
        })}
          </div>
        )}
      </div>
      <Btn color={COLORS.teal} onClick={runDistribution}>▶ Εκτέλεση κατανομής ημέρας (AI) τώρα</Btn>
      <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4, marginBottom: 12 }}>Η κατανομή τρέχει αυτόματα μία φορά την ημέρα στο πρώτο άνοιγμα.</div>
      <Btn color={COLORS.amber} outline onClick={generateClosingChecks}>Δημιουργία ελέγχων κλεισίματος τώρα</Btn>
      <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>
        {settings?.closingCheckMode === "manual"
          ? "Χειροκίνητη λειτουργία: δημιουργείται ΜΟΝΟ με αυτό το κουμπί."
          : `Τρέχει αυτόματα μετά τις ${settings?.closingCheckTime || "15:30"} — το κουμπί είναι για χειροκίνητη εκτέλεση εκτός ώρας.`}
        {" "}Αλλαγή στις <b>Ρυθμίσεις</b>.
      </div>
    </div>
  );
}

function ControlPanel({ tasks, boats, users, onReturn, onCloseExternal, onDowngrade, onRate, onDelete }) {
  const [noteFor, setNoteFor] = useState(null);
  const [note, setNote] = useState("");
  const [confirmId, setConfirmId] = useState(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const external = tasks.filter(t => t.status === "external");
  const urgent = tasks.filter(t => t.status === "open" && t.urgent);
  const recentDone = tasks.filter(t => t.status === "done" && t.completedAt && (Date.now() - new Date(t.completedAt).getTime()) <= 7 * 24 * 60 * 60 * 1000).sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
  const un = (id) => users.find(u => u.id === id)?.name || "";
  const DelBtn = ({ t }) => confirmId === t.id ? (
    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
      <Btn small color={COLORS.red} onClick={() => { onDelete(t); setConfirmId(null); }}>Ναι, διαγραφή</Btn>
      <Btn small color={COLORS.sub} outline onClick={() => setConfirmId(null)}>Άκυρο</Btn>
    </div>
  ) : <button data-compact onClick={() => setConfirmId(t.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700, padding: "0px 4px" }}>🗑</button>;
  return (
    <div>
      <SectionTitle>⚠ Εκκρεμούν εξωτερικοί συνεργάτες ({external.length})</SectionTitle>
      {external.length === 0 && <Empty>Καμία εκκρεμότητα εξωτερικού.</Empty>}
      {external.map(t => (
        <div key={t.id} style={{ background: "#FDF3E3", borderRadius: 12, padding: 12, marginBottom: 8, fontSize: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>{t.desc} — {bn(t.boatId)}</div>
            <DelBtn t={t} />
          </div>
          <div style={{ color: COLORS.sub, fontSize: 13, margin: "4px 0 8px" }}>{un(t.externalBy)} ({fmtDate(t.externalAt)}): {t.externalNote}</div>
          {noteFor === t.id ? (
            <div>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="π.χ. Έγινε από εξωτερικό ψυκτικό (Χ)" style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn small color={COLORS.green} onClick={() => { onCloseExternal(t, note.trim()); setNoteFor(null); setNote(""); }}>Κλείσιμο ✔</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setNoteFor(null)}>Άκυρο</Btn>
              </div>
            </div>
          ) : <Btn small color={COLORS.green} onClick={() => { setNoteFor(t.id); setNote(""); }}>Έγινε — κλείσιμο εργασίας</Btn>}
        </div>
      ))}

      <SectionTitle>🔴 Επείγοντα σοβαρότητας ({urgent.length})</SectionTitle>
      {urgent.length === 0 && <Empty>Κανένα ενεργό επείγον.</Empty>}
      {urgent.map(t => (
        <div key={t.id} style={{ background: "#FBEBE6", borderRadius: 12, padding: 12, marginBottom: 8, fontSize: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontWeight: 700 }}>{t.desc} — {bn(t.boatId)}</div>
            <DelBtn t={t} />
          </div>
          <div style={{ color: COLORS.sub, fontSize: 13, margin: "4px 0 8px" }}>Καταχώρηση: {un(t.createdBy)}, {fmtDate(t.createdAt)}</div>
          <Btn small color={COLORS.red} outline onClick={() => onDowngrade(t)}>Υποβάθμιση σε κανονική</Btn>
        </div>
      ))}

      <SectionTitle>Πρόσφατα ολοκληρωμένες — έλεγχος ποιότητας</SectionTitle>
      {recentDone.length === 0 && <Empty>Τίποτα ολοκληρωμένο ακόμα.</Empty>}
      {(showAllDone ? recentDone : recentDone.slice(0, 3)).map(t => (
        <div key={t.id} style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 8, fontSize: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>{t.desc} — {bn(t.boatId)}</div>
            <DelBtn t={t} />
          </div>
          <div style={{ color: COLORS.sub, fontSize: 13, margin: "4px 0 8px" }}>
            {un(t.completedBy)} · {fmtDate(t.completedAt)}{t.returns > 0 ? ` · ↩ ${t.returns}` : ""}
          </div>
          {noteFor === "r" + t.id ? (
            <div>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Τι λείπει; π.χ. Έμειναν νερά στη σεντίνα" style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn small color={COLORS.red} onClick={() => { if (!note.trim()) return; onReturn(t, note.trim()); setNoteFor(null); setNote(""); }}>Επιστροφή ↩</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setNoteFor(null)}>Άκυρο</Btn>
              </div>
            </div>
          ) : <Btn small color={COLORS.red} outline onClick={() => { setNoteFor("r" + t.id); setNote(""); }}>Επιστροφή — ατελής</Btn>}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
            <span style={{ fontSize: 12, color: COLORS.sub, marginRight: 4 }}>Αξιολόγηση:</span>
            {[1, 2, 3, 4, 5].map(n => (
              <span key={n} onClick={() => onRate(t, n)} style={{ cursor: "pointer", fontSize: 20, color: (t.rating || 0) >= n ? COLORS.amber : COLORS.line }}>★</span>
            ))}
            {t.rating > 0 && <span style={{ fontSize: 12, color: COLORS.sub, marginLeft: 4 }}>({un(t.ratedBy)})</span>}
          </div>
        </div>
      ))}
      {recentDone.length > 3 && (
        <Btn small color={COLORS.navy} outline onClick={() => setShowAllDone(!showAllDone)}>
          {showAllDone ? "Λιγότερα ▲" : `Δείξε κι άλλα (${recentDone.length - 3} ακόμα) ▼`}
        </Btn>
      )}
    </div>
  );
}

const addDays = (dateStr, days) => { const d = localMidnight(dateStr); d.setDate(d.getDate() + days); return dateStrOf(d); };

// ---------- Πρόγραμμα ναύλων σεζόν ----------
// Κάθε σκάφος έχει προαιρετικά boat.charters = [{ id, from: "YYYY-MM-DD", to: "YYYY-MM-DD" }, ...].
// Η κατάσταση (εν πλω / στη βάση / επόμενο γεγονός) υπολογίζεται ΑΠΟ το πρόγραμμα + σημερινή ημερομηνία,
// ώστε να μη χρειάζεται χειροκίνητη διαχείριση. Τα παλιά πεδία (atSea/departureDate/returnDate) παραμένουν
// ως υποστήριξη για σκάφη χωρίς πρόγραμμα και για τη γρήγορη χειροκίνητη επιλογή.
const getCharters = (b) => Array.isArray(b?.charters) ? [...b.charters].filter(c => c && c.from && c.to).sort((a, c) => a.from.localeCompare(c.from)) : [];

// Επιστρέφει live κατάσταση σκάφους: { atSea, departureDate, returnDate, nextEventType, nextEventDate, nextEventDays }
// nextEventType: "return" (επιστρέφει από τρέχον ναύλο) | "depart" (φεύγει σε επόμενο ναύλο) | null
const boatStatus = (b) => {
  const today = todayStr();
  const charters = getCharters(b);
  if (charters.length) {
    // μέσα σε ναύλο — η μέρα επιστροφής μετράει ΑΚΟΜΑ ως πλήρης μέρα ναύλου· το σκάφος είναι ελεύθερο μόνο από την επόμενη μέρα.
    // Εξαίρεση: αν ο ναύλος ΞΕΚΙΝΑΕΙ σήμερα, δεν θεωρείται «εν πλω» πριν περάσει η ώρα αναχώρησης (βλ. departureCutoffPassed) —
    // μέχρι τότε παραμένει πρακτικά «επόμενος ναύλος» και το σκάφος συνεχίζει να δείχνει δουλειές στη βάση.
    const current = charters.find(c => c.from <= today && today <= c.to && !(c.from === today && !departureCutoffPassed(c)));
    const upcoming = charters.filter(c => c.from >= today).sort((a, c) => a.from.localeCompare(c.from));
    if (current) {
      const du = daysUntil(current.to);
      return { atSea: true, departureDate: null, returnDate: current.to, nextEventType: "return", nextEventDate: current.to, nextEventDays: du };
    }
    const next = upcoming[0];
    if (next) {
      const du = daysUntil(next.from);
      return { atSea: false, departureDate: next.from, returnDate: next.to, nextEventType: "depart", nextEventDate: next.from, nextEventDays: du };
    }
    return { atSea: false, departureDate: null, returnDate: null, nextEventType: null, nextEventDate: null, nextEventDays: null };
  }
  // Fallback: παλιά μεμονωμένα πεδία (σκάφη χωρίς πρόγραμμα)
  if (b?.atSea) return { atSea: true, departureDate: null, returnDate: b.returnDate || null, nextEventType: b.returnDate ? "return" : null, nextEventDate: b.returnDate || null, nextEventDays: b.returnDate ? daysUntil(b.returnDate) : null };
  if (b?.departureDate) return { atSea: false, departureDate: b.departureDate, returnDate: b.returnDate || null, nextEventType: "depart", nextEventDate: b.departureDate, nextEventDays: daysUntil(b.departureDate) };
  return { atSea: false, departureDate: null, returnDate: null, nextEventType: null, nextEventDate: null, nextEventDays: null };
};

// ---------- Κεντρικές, ΜΟΝΑΔΙΚΕΣ συναρτήσεις για «είναι πρακτικά μακριά/στη βάση τώρα» ----------
// Η ημέρα επιστροφής μετράει ΠΑΝΤΑ ως πλήρης μέρα ναύλου στο boatStatus/atSea (σωστό για το ημερολόγιο ναύλων —
// βλ. σχόλιο μέσα στο boatStatus). Όμως για ΟΤΙΔΗΠΟΤΕ άλλο — λίστες, φίλτρα, αυτόματες αναθέσεις, κείμενο προς το
// AI — ένα σκάφος που επιστρέφει σήμερα πρέπει να αντιμετωπίζεται σαν να είναι ήδη (ή σχεδόν) στη βάση, γιατί
// μπορεί να έχει ήδη γυρίσει νωρίτερα μέσα στη μέρα. Αυτή η εξαίρεση ορίζεται ΕΔΩ, μία φορά, και χρησιμοποιείται
// παντού — ώστε να μη χρειάζεται να ξαναγράφεται (και να ξεχνιέται) σε κάθε σημείο ξεχωριστά.
// Εξαίρεση σε αυτόν τον κανόνα: η καρτέλα «Σκάφη» (πρόγραμμα ναύλων) δείχνει σκόπιμα το ακριβές atSea, γιατί
// εκεί η ακρίβεια του προγράμματος έχει σημασία, όχι η πρακτική εικόνα της μέρας.
const isBoatAway = (b) => { const s = boatStatus(b); return s.atSea && s.returnDate !== todayStr(); };
// Επόμενη προγραμματισμένη αναχώρηση ενός σκάφους, ΑΚΟΜΑ ΚΙ ΑΝ το boatStatus δείχνει «επιστροφή» επειδή το
// σκάφος είναι τυπικά «εν πλω» σήμερα (μέρα επιστροφής) — ψάχνει ρητά για ναύλο που ξεκινάει μετά την τρέχουσα
// επιστροφή, ώστε μια γρήγορη επόμενη αναχώρηση (π.χ. φεύγει ξανά το ίδιο απόγευμα) να μη «χάνεται» ποτέ.
const nextDeparture = (b) => {
  const s = boatStatus(b);
  if (s.nextEventType === "depart") return { date: s.nextEventDate, days: s.nextEventDays };
  if (s.atSea) {
    const after = getCharters(b).filter(c => c.from > s.returnDate).sort((a, c) => a.from.localeCompare(c.from))[0];
    if (after) return { date: after.from, days: daysUntil(after.from) };
  }
  return null;
};

function BoatDetail({ boat, tasks, boatNotes, onAddNote, onDeleteNote, isMgr, onDeleteBoat }) {
  const [noteText, setNoteText] = useState("");
  const [notePhotos, setNotePhotos] = useState([]);
  const noteFileRef = useRef(null);
  const [aiQ, setAiQ] = useState("");
  const [aiAns, setAiAns] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const myNotes = boatNotes.filter(n => n.boatId === boat.id).sort((a, b) => b.at.localeCompare(a.at));
  const serviceHistory = tasks.filter(t => t.boatId === boat.id && t.status === "done" && t.serviceRelevant)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  const allDone = tasks.filter(t => t.boatId === boat.id && t.status === "done");

  const ask = async (customQ) => {
    const q = (customQ || aiQ).trim();
    if (!q || busy) return;
    setBusy(true); setAiAns("");
    try {
      const serviceText = serviceHistory.map(t => `"${t.desc}" (${fmtDate(t.completedAt)})`).join("; ") || "(κενό)";
      // Χρονολογική σειρά (παλιότερο → νεότερο) ώστε το AI να «διαβάζει» εξέλιξη — π.χ. θετική παρατήρηση παλιότερα, πρόβλημα μεταγενέστερα, άρα νέο ζήτημα.
      const notesChrono = [...myNotes].sort((a, b) => a.at.localeCompare(b.at));
      const notesText = notesChrono.map(n => `"${n.text}" (${fmtDate(n.at)})`).join("; ") || "(κενό)";
      const routineText = allDone.map(t => `"${t.desc}" (${fmtDate(t.completedAt)})`).join("; ") || "(κενό)";
      const prompt = `Είσαι βοηθός βάσης σκαφών, ειδικός για το σκάφος "${boat.name}". Απάντησε στην ερώτηση χρησιμοποιώντας ΜΟΝΟ τα παρακάτω δεδομένα.
Οι ΠΑΡΑΤΗΡΗΣΕΙΣ είναι σε χρονολογική σειρά (παλιότερη → νεότερη) και μπορεί να είναι είτε θετικές (κάτι δουλεύει καλά) είτε αρνητικές (πρόβλημα). Χρησιμοποίησέ τες σαν χρονικά σημεία αναφοράς: αν κάτι έχει σημειωθεί ότι δούλευε καλά σε μια ημερομηνία και αργότερα εμφανίζεται πρόβλημα για το ίδιο πράγμα (είτε σε παρατήρηση είτε στο ιστορικό ρουτίνας/service), ανάφερε ρητά ότι πρόκειται πιθανότατα για νέο ζήτημα και ανάφερε από πότε υπάρχει η τελευταία ένδειξη καλής λειτουργίας. Αν εντοπίζεις επαναλαμβανόμενο μοτίβο (το ίδιο πρόβλημα να ξαναγίνεται) στο ιστορικό ρουτίνας, επισήμανέ το ως πιθανό υποκείμενο ζήτημα.
ΒΙΒΛΙΟ SERVICE: ${serviceText}
ΠΑΡΑΤΗΡΗΣΕΙΣ (παλιότερη → νεότερη): ${notesText}
ΙΣΤΟΡΙΚΟ ΡΟΥΤΙΝΑΣ (όλες οι ολοκληρωμένες εργασίες): ${routineText}
ΕΡΩΤΗΣΗ: ${q}
Απάντησε σύντομα και συγκεκριμένα στα ελληνικά.`;
      setAiAns(await askClaude(prompt, 500));
    } catch { setAiAns("Σφάλμα — δοκίμασε ξανά."); }
    setBusy(false);
  };

  return (
    <div style={{ marginTop: 8, background: COLORS.bg, borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>ℹ️ {boat.name} — Πληροφορίες</div>
      <Btn small color={COLORS.teal} onClick={() => ask("Τι θέματα ή επαναλαμβανόμενα προβλήματα έχει αυτό το σκάφος; Αν κάτι φαίνεται καινούργιο (δηλαδή υπάρχει παλιότερη ένδειξη ότι δούλευε καλά), ανάφερέ το ρητά. Δώσε σύντομη επισκόπηση.")}>{busy ? "…" : "Επισκόπηση AI"}</Btn>
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <input value={aiQ} onChange={e => setAiQ(e.target.value)} placeholder="Ρώτησε κάτι για αυτό το σκάφος…" style={{ ...inputStyle, flex: 1 }} />
        <Btn small color={COLORS.navy} onClick={() => ask()}>{busy ? "…" : "Ρώτησε"}</Btn>
      </div>
      {aiAns && <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", background: COLORS.card, borderRadius: 8, padding: 8 }}>{aiAns}</div>}

      <div style={{ fontWeight: 700, marginTop: 12, marginBottom: 4, fontSize: 13 }}>Παρατηρήσεις <span style={{ fontWeight: 400, color: COLORS.sub, fontSize: 12 }}>(θετικές ή αρνητικές — και τα δύο βοηθούν)</span></div>
      {myNotes.length === 0 && <div style={{ color: COLORS.sub, fontSize: 13 }}>Καμία ακόμα.</div>}
      {myNotes.map(n => (
        <div key={n.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: `1px dashed ${COLORS.line}` }}>
          {n.text} <span style={{ color: COLORS.sub, fontSize: 12 }}>— {fmtDate(n.at)}</span>
          {isMgr && <button data-compact onClick={() => onDeleteNote(n.id)} style={{ border: "none", background: "none", color: COLORS.red, marginLeft: 6, fontSize: 12 }}>🗑</button>}
          {n.photos?.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
              {n.photos.map((url, pi) => <img key={pi} src={url} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8 }} onClick={() => window.open(url, "_blank")} />)}
            </div>
          )}
        </div>
      ))}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="π.χ. Ο αυτόματος πιλότος δουλεύει τέλεια — ή: Στάζει λάδι στο μηχανοστάσιο" style={{ ...inputStyle, flex: 1 }} />
          <Btn small color={COLORS.teal} onClick={() => { if (noteText.trim()) { onAddNote(boat.id, noteText.trim(), notePhotos); setNoteText(""); setNotePhotos([]); } }}>Προσθήκη</Btn>
        </div>
        <div style={{ marginTop: 4 }}>
          <input ref={noteFileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }}
            onChange={e => setNotePhotos(prev => [...prev, ...Array.from(e.target.files || [])])} />
          <Btn small color={COLORS.sub} outline onClick={() => noteFileRef.current?.click()}>Φωτογραφία (προαιρετικό)</Btn>
          {notePhotos.length > 0 && <span style={{ fontSize: 12, color: COLORS.sub, marginLeft: 8 }}>{notePhotos.length} επιλεγμένες</span>}
        </div>
      </div>

      {serviceHistory.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginTop: 12, marginBottom: 4, fontSize: 13 }}>Πρόσφατο ιστορικό Service Book</div>
          {serviceHistory.slice(0, 6).map(t => (
            <div key={t.id} style={{ fontSize: 13, padding: "4px 0", color: COLORS.sub }}>• {t.desc} — {fmtDate(t.completedAt)}</div>
          ))}
        </>
      )}
      {isMgr && onDeleteBoat && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px dashed ${COLORS.line}` }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ border: "none", background: "none", color: COLORS.sub, fontSize: 12, textDecoration: "underline" }}>Διαγραφή σκάφους</button>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: COLORS.red, marginBottom: 8 }}>Διαγραφή «{boat.name}»; Το ιστορικό/Βιβλίο Service παραμένουν καταγεγραμμένα, απλά το σκάφος δεν θα εμφανίζεται πλέον.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small color={COLORS.red} onClick={onDeleteBoat}>Ναι, διαγραφή</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setConfirmDelete(false)}>Άκυρο</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CharterCalendar({ charters }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(), month = base.getMonth();
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Δευτέρα πρώτη
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const dateStrOf = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const isBooked = (d) => { const ds = dateStrOf(d); return charters.some(c => c.from <= ds && ds <= c.to); };
  const monthLabel = base.toLocaleDateString("el-GR", { month: "long", year: "numeric" });
  const todayS = todayStr();
  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <button onClick={() => setMonthOffset(monthOffset - 1)} style={{ border: "none", background: "none", color: COLORS.navy, fontSize: 17, padding: "0px 8px" }}>‹</button>
        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>{monthLabel}</div>
        <button onClick={() => setMonthOffset(monthOffset + 1)} style={{ border: "none", background: "none", color: COLORS.navy, fontSize: 17, padding: "0px 8px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["Δ", "Τ", "Τ", "Π", "Π", "Σ", "Κ"].map((d, i) => <div key={i} style={{ fontSize: 12, color: COLORS.sub, textAlign: "center" }}>{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const booked = isBooked(d);
          const isToday = dateStrOf(d) === todayS;
          return (
            <div key={i} style={{
              fontSize: 12, textAlign: "center", padding: "4px 0", borderRadius: 8,
              background: booked ? COLORS.teal : "transparent", color: booked ? "#fff" : COLORS.text,
              border: isToday ? `1.5px solid ${COLORS.navy}` : "none", fontWeight: isToday ? 700 : 400,
            }}>{d}</div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Μαζική καταχώρηση αναχωρήσεων/επιστροφών (φωνή ή κείμενο) ----------
// Ο χρήστης περιγράφει ελεύθερα (μιλώντας ή γράφοντας — ίδιο πεδίο, ίδιος parser) ποια σκάφη φεύγουν ή
// επιστρέφουν και πότε, π.χ. «Παρασκευή 17 Ιουλίου γυρνάνε Λεωνίδας, Σοφία 2. Σάββατο φεύγουν Απόλλων, Κατερίνα».
// Το AI αναγνωρίζει σκάφη/ημερομηνίες, δείχνεται ΠΑΝΤΑ προεπισκόπηση επεξεργάσιμη πριν γραφτεί οτιδήποτε.
// Κανόνες:
// - «Φεύγει» → νέο ναύλο, προεπιλογή διάρκειας 1 εβδομάδα (επεξεργάσιμο στην προεπισκόπηση).
// - «Επιστρέφει» → ΔΕΝ επινοεί νέο ναύλο (δεν ξέρουμε πότε ξεκίνησε) — ενημερώνει το «έως» του πιο πρόσφατου
//   ήδη υπάρχοντος ναύλου του σκάφους. Αν δεν βρεθεί κανένας, δεν αλλάζει τίποτα και το δηλώνει ρητά.
const WEEKDAYS_EL = ["Κυριακή", "Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο"];
function BulkScheduleEntry({ boats, persistBoats, showToast }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState(null);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggleMic = () => {
    setErr("");
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    if (!SR) { setErr("Η φωνητική αναγνώριση δεν υποστηρίζεται σε αυτή τη συσκευή/browser — γράψε το κείμενο κατευθείαν."); return; }
    const rec = new SR();
    rec.lang = "el-GR";
    rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add) setText(t => (t + " " + add).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  // Πιο πρόσφατος ναύλος του σκάφους που να "ταιριάζει" ως ενημέρωση επιστροφής για τη δοσμένη ημερομηνία —
  // ήδη σωστός (to === date) ή, αλλιώς, ο πιο πρόσφατος που έχει ήδη ξεκινήσει μέχρι τη δοσμένη ημερομηνία.
  const findReturnMatch = (boat, date) => {
    const charters = getCharters(boat);
    const exact = charters.find(c => c.to === date);
    if (exact) return { id: exact.id, alreadyCorrect: true };
    const started = charters.filter(c => c.from <= date).sort((a, c) => c.from.localeCompare(a.from))[0];
    return { id: started ? started.id : null, alreadyCorrect: false };
  };

  const analyze = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(""); setPreview(null);
    try {
      const boatList = boats.map(b => b.name).join("; ");
      const today = todayStr();
      const prompt = `Είσαι βοηθός βάσης σκαφών charter. Ο χρήστης περιγράφει ΜΑΖΙΚΑ ποια σκάφη φεύγουν ή επιστρέφουν, με ημερομηνίες ρητές (π.χ. "18 Ιουλίου") ή σχετικές (π.χ. "αύριο", "την Παρασκευή", "Σάββατο").
ΣΗΜΕΡΙΝΗ ΗΜΕΡΟΜΗΝΙΑ: ${today} (${WEEKDAYS_EL[new Date().getDay()]})
ΛΙΣΤΑ ΣΚΑΦΩΝ ΒΑΣΗΣ (χρησιμοποίησε ΜΟΝΟ αυτά τα ακριβή ονόματα — πρόσεξε ότι π.χ. "Λεωνίδας", "Λεωνίδας II", "Λεωνίδας III", "Λεωνίδας 4" είναι ΔΙΑΦΟΡΕΤΙΚΑ σκάφη): ${boatList}
Για κάθε σκάφος που αναφέρεται εξήγαγε: boatName (το ΑΚΡΙΒΕΣ όνομα από τη λίστα, ή null αν δεν είσαι σίγουρος ποιο από τα σκάφη εννοεί), rawName (ό,τι ακριβώς είπε ο χρήστης γι' αυτό), action ("depart" αν φεύγει/αναχωρεί/βγαίνει σε ναύλο, "return" αν επιστρέφει/γυρνάει/έρχεται), date σε μορφή YYYY-MM-DD (μέρες εβδομάδας πάντα ως την ΕΠΟΜΕΝΗ εμφάνισή τους από σήμερα, ποτέ παρελθοντική, εκτός αν δόθηκε ρητή ημερομηνία).
ΚΕΙΜΕΝΟ ΧΡΗΣΤΗ: "${text.trim()}"
Απάντησε ΜΟΝΟ με JSON, χωρίς markdown: {"entries":[{"boatName":"..."|null,"rawName":"...","action":"depart"|"return","date":"YYYY-MM-DD"}]}`;
      const raw = await askClaude(prompt, 900);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const entries = (parsed.entries || []).filter(e => e && e.action && e.date);
      if (!entries.length) { setErr("Δεν αναγνωρίστηκε καμία καταχώρηση — δοκίμασε πιο συγκεκριμένα (ονόματα σκαφών + ημερομηνίες)."); setBusy(false); return; }
      const rows = entries.map((e, i) => {
        const boat = e.boatName ? boats.find(b => b.name === e.boatName) : null;
        const row = { key: "r" + i, rawName: e.rawName || e.boatName || "?", action: e.action, date: e.date, boatId: boat ? boat.id : null };
        if (e.action === "depart") row.toDate = addDays(e.date, 6);
        else if (boat) { const m = findReturnMatch(boat, e.date); row.matchedCharterId = m.id; row.alreadyCorrect = m.alreadyCorrect; }
        return row;
      });
      setPreview(rows);
    } catch { setErr("Η αναγνώριση απέτυχε — δοκίμασε ξανά."); }
    setBusy(false);
  };

  const updateRow = (key, patch) => {
    setPreview(cur => cur.map(r => {
      if (r.key !== key) return r;
      const next = { ...r, ...patch };
      // Αλλαγή σκάφους σε γραμμή "return" → ξαναβρίσκουμε τον ναύλο-στόχο για το νέο σκάφος.
      if (patch.boatId !== undefined && next.action === "return") {
        const boat = boats.find(b => b.id === patch.boatId);
        if (boat) { const m = findReturnMatch(boat, next.date); next.matchedCharterId = m.id; next.alreadyCorrect = m.alreadyCorrect; }
        else { next.matchedCharterId = null; next.alreadyCorrect = false; }
      }
      return next;
    }));
  };
  const removeRow = (key) => setPreview(cur => cur.filter(r => r.key !== key));

  const confirm = () => {
    let nextBoats = boats;
    let applied = 0, skipped = 0;
    preview.forEach(row => {
      if (!row.boatId) { skipped++; return; }
      nextBoats = nextBoats.map(b => {
        if (b.id !== row.boatId) return b;
        const charters = getCharters(b);
        if (row.action === "depart") {
          const overlap = charters.some(c => row.date < c.to && c.from < row.toDate);
          if (overlap) { skipped++; return b; }
          applied++;
          const next = [...charters, { id: "c" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), from: row.date, to: row.toDate, createdAt: new Date().toISOString() }].sort((a, c) => a.from.localeCompare(c.from));
          return { ...b, charters: next, atSea: false, departureDate: null, returnDate: null };
        }
        if (!row.matchedCharterId || row.alreadyCorrect) { if (!row.matchedCharterId) skipped++; return b; }
        applied++;
        return { ...b, charters: charters.map(c => c.id === row.matchedCharterId ? { ...c, to: row.date } : c) };
      });
    });
    persistBoats(nextBoats);
    showToast(`Ενημερώθηκαν ${applied} σκάφη${skipped ? ` — ${skipped} παραλείφθηκαν` : ""}`);
    setPreview(null); setText(""); setOpen(false);
  };

  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 12, border: `1.5px solid ${open ? COLORS.teal : COLORS.line}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", textAlign: "left", fontSize: 15, fontWeight: 700, color: COLORS.teal }}>
        🎙 Μαζική καταχώρηση αναχωρήσεων/επιστροφών {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <button onClick={toggleMic} style={{
            width: "100%", padding: 12, borderRadius: 12, fontWeight: 700, fontSize: 15,
            border: `2px solid ${listening ? COLORS.red : COLORS.teal}`,
            background: listening ? COLORS.red : "transparent", color: listening ? "#fff" : COLORS.teal,
          }}>{listening ? "⏹ Σταμάτημα" : "🎤 Μίλα"}</button>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
            placeholder='π.χ. "Παρασκευή 17 Ιουλίου γυρνάνε Λεωνίδας, Σοφία 2, Βερόνικα 2. Σάββατο φεύγουν Απόλλων, Κατερίνα, Λίνα."'
            style={{ ...inputStyle, marginTop: 8 }} />
          <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>Μπορείς να μιλήσεις ή να γράψεις απευθείας — δουλεύει το ίδιο. Τίποτα δεν καταχωρείται πριν το επιβεβαιώσεις παρακάτω.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn color={COLORS.teal} onClick={analyze}>{busy ? "Ανάλυση…" : "Ανάλυση"}</Btn>
            {text && <Btn color={COLORS.sub} outline onClick={() => { setText(""); setPreview(null); setErr(""); }}>Καθάρισμα</Btn>}
          </div>
          {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          {preview && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.sub, marginBottom: 4 }}>Προεπισκόπηση — έλεγξε πριν επιβεβαιώσεις:</div>
              {preview.map(row => (
                <div key={row.key} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 8, marginBottom: 8, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      {row.boatId ? (
                        <b>{boats.find(b => b.id === row.boatId)?.name}</b>
                      ) : (
                        <select value={row.boatId || ""} onChange={e => updateRow(row.key, { boatId: e.target.value || null })} style={{ ...inputStyle, padding: "4px 8px", fontSize: 13 }}>
                          <option value="">— διάλεξε σκάφος για "{row.rawName}" —</option>
                          {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      )}
                      <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: row.action === "depart" ? COLORS.green : COLORS.teal }}>
                        {row.action === "depart" ? "🏁 Φεύγει" : "🏠 Επιστρέφει"}
                      </span>
                    </div>
                    <button data-compact onClick={() => removeRow(row.key)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700 }}>×</button>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                    <input type="date" value={row.date} onChange={e => updateRow(row.key, { date: e.target.value })} style={{ ...inputStyle, width: "auto" }} />
                    {row.action === "depart" && (
                      <>
                        <span style={{ color: COLORS.sub }}>→</span>
                        <input type="date" min={row.date} value={row.toDate} onChange={e => updateRow(row.key, { toDate: e.target.value })} style={{ ...inputStyle, width: "auto" }} />
                        <span style={{ fontSize: 12, color: COLORS.sub }}>(προεπιλογή 1 εβδομάδα — επεξεργάσιμο)</span>
                      </>
                    )}
                  </div>
                  {row.action === "return" && row.boatId && (
                    <div style={{ fontSize: 12, color: row.matchedCharterId ? (row.alreadyCorrect ? COLORS.sub : COLORS.amber) : COLORS.red, marginTop: 4 }}>
                      {row.matchedCharterId
                        ? (row.alreadyCorrect ? "✓ Ήδη σωστά καταχωρημένο — καμία αλλαγή." : "Θα ενημερωθεί το «έως» του πιο πρόσφατου ναύλου του σκάφους σε αυτή την ημερομηνία.")
                        : "⚠ Δεν βρέθηκε υπάρχων ναύλος να ενημερωθεί — θα παραλειφθεί (πρόσθεσέ το χειροκίνητα στα «Ναύλα» του σκάφους αν χρειάζεται)."}
                    </div>
                  )}
                </div>
              ))}
              <Btn color={COLORS.green} onClick={confirm}>Επιβεβαίωση ({preview.filter(r => r.boatId).length})</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BoatsAdmin({ boats, tasks, boatNotes, onAddBoatNote, onDeleteBoatNote, isMgr, persistBoats, setDeparture, cancelCharter, onReturnBoat, onSetNextCharter, showToast }) {
  const [detailFor, setDetailFor] = useState(null);
  const [schedFor, setSchedFor] = useState(null);
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [customDays, setCustomDays] = useState("");
  const [newBoatName, setNewBoatName] = useState("");
  const [newBoatType, setNewBoatType] = useState("");

  // Προτεραιότητα σε 4 επίπεδα, με απλή χρωματική σήμανση:
  // 1. Στη βάση + φεύγει σύντομα — ΠΡΑΣΙΝΟ
  // 2. Έρχεται + έχει ήδη επόμενο ναύλο μετά — ΠΟΡΤΟΚΑΛΙ/ΜΠΛΕ (έρχεται) + ΠΡΑΣΙΝΟ (μετά φεύγει)
  //    Διπλή πληροφορία σκόπιμα ψηλά: το σκάφος χρειάζεται προσοχή και για την άφιξη ΚΑΙ για γρήγορη ετοιμασία μετά.
  // 3. Στη βάση + τίποτα προγραμματισμένο — ΓΚΡΙ
  // 4. Έρχεται + τίποτα μετά — ΠΟΡΤΟΚΑΛΙ/ΜΠΛΕ
  // Το "έρχεται" παίρνει πορτοκαλί μόνο αν η επιστροφή είναι μέσα στις επόμενες 7 μέρες (κάτι να προσέχει κανείς
  // άμεσα)· αν αργεί πάνω από μία εβδομάδα, παίρνει ένα ήρεμο, ουδέτερο μπλε — δεν χρειάζεται να «χτυπάει». Επειδή η
  // ταξινόμηση μέσα σε κάθε επίπεδο γίνεται πάντα με την πλησιέστερη ημερομηνία πρώτα, τα πορτοκαλί βγαίνουν φυσικά
  // πριν τα γαλάζια, χωρίς να χρειάζεται ξεχωριστό επίπεδο για αυτά.
  const rank = (b) => {
    const s = boatStatus(b);
    const charters = getCharters(b);
    if (!s.atSea) {
      if (s.nextEventType === "depart") {
        return { tier: 1, sortDate: s.departureDate, s,
          statusText: "Στη βάση", statusColor: COLORS.green,
          extra: { text: `Φεύγει ${fmtDate(s.departureDate)}`, color: COLORS.green } };
      }
      return { tier: 3, sortDate: null, s, statusText: "Στη βάση", statusColor: COLORS.sub, extra: null };
    }
    const returnColor = (s.nextEventDays !== null && s.nextEventDays > 7) ? COLORS.blue : COLORS.amber;
    const after = charters.filter(c => c.from > s.returnDate).sort((a, c) => a.from.localeCompare(c.from))[0];
    if (after) {
      return { tier: 2, sortDate: s.returnDate, s,
        statusText: "Έρχεται", statusColor: returnColor,
        extra: { text: `Μετά φεύγει ${fmtDate(after.from)}`, color: COLORS.green } };
    }
    return { tier: 4, sortDate: s.returnDate, s, statusText: "Έρχεται", statusColor: returnColor, extra: null };
  };
  const withStatus = boats.map(b => ({ b, r: rank(b) }));
  const sorted = [...withStatus].sort((x, y) => {
    if (x.r.tier !== y.r.tier) return x.r.tier - y.r.tier;
    if (x.r.sortDate && y.r.sortDate) return x.r.sortDate.localeCompare(y.r.sortDate) || x.b.name.localeCompare(y.b.name);
    if (x.r.sortDate) return -1;
    if (y.r.sortDate) return 1;
    return x.b.name.localeCompare(y.b.name);
  });

  const saveCharter = (b) => {
    if (!newFrom || !newTo) { showToast("Συμπλήρωσε από/έως"); return; }
    if (newTo < newFrom) { showToast("Η λήξη πρέπει να είναι μετά την έναρξη"); return; }
    const charters = getCharters(b);
    // Επιτρέπουμε ρητά το ίδιο σκάφος να επιστρέφει και να ξαναφεύγει την ΙΔΙΑ μέρα (π.χ. γυρίζει Σάββατο πρωί,
    // φεύγει ξανά Σάββατο απόγευμα) — γι' αυτό ο έλεγχος επικάλυψης είναι «ανοιχτός» στα άκρα (< / >), όχι
    // «κλειστός» (<= / >=), παρότι η κατάσταση του σκάφους μετράει την ημέρα επιστροφής ως πλήρη μέρα ναύλου.
    const overlap = charters.some(c => newFrom < c.to && c.from < newTo);
    if (overlap) { showToast("Επικαλύπτεται με υπάρχον ναύλο"); return; }
    const next = [...charters, { id: "c" + Date.now(), from: newFrom, to: newTo, createdAt: new Date().toISOString() }].sort((a, c) => a.from.localeCompare(c.from));
    persistBoats(boats.map(x => x.id === b.id ? { ...x, charters: next, atSea: false, departureDate: null, returnDate: null } : x));
    setNewFrom(""); setNewTo(""); setCustomDays(""); showToast("Προστέθηκε ναύλο");
  };
  const removeCharter = (b, cid) => {
    persistBoats(boats.map(x => x.id === b.id ? { ...x, charters: getCharters(b).filter(c => c.id !== cid) } : x));
  };

  return (
    <div>
      <SectionTitle>Σκάφη ({boats.length})</SectionTitle>
      <BulkScheduleEntry boats={boats} persistBoats={persistBoats} showToast={showToast} />
      <div style={{ fontSize: 12, color: COLORS.sub, marginBottom: 8 }}>Σειρά: πρώτα όσα φεύγουν σύντομα (πράσινο), μετά όσα έρχονται ΚΑΙ φεύγουν ξανά σύντομα μετά (πορτοκαλί/γαλάζιο + πράσινο), μετά τα ήρεμα στη βάση (γκρι), τέλος όσα απλώς έρχονται (πορτοκαλί αν μέσα σε 7 μέρες, γαλάζιο αν αργούν).</div>
      {sorted.map(({ b, r }) => {
        const s = r.s;
        return (
        <React.Fragment key={b.id}>
          <div style={{ background: COLORS.card, borderRadius: 12, padding: "12px 12px", marginBottom: 8, fontSize: 15 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <b>{b.name}</b>
                  <span style={{ color: COLORS.sub, fontSize: 13 }}>{b.type}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.statusColor, background: "#F0EDE8", padding: "0px 8px", borderRadius: 999 }}>
                    {s.atSea ? "🌊 " : ""}{r.statusText}{s.atSea ? ` ${s.returnDate === todayStr() ? "σήμερα" : fmtDate(s.returnDate)}` : ""}
                  </span>
                  {r.extra && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.extra.color, background: "#E9F3EA", padding: "0px 8px", borderRadius: 999 }}>
                      {r.extra.text}
                    </span>
                  )}
                </div>
                {getCharters(b).length > 0 && (
                  <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>
                    {getCharters(b).length} ναύλα σεζόν
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexDirection: "column", flexShrink: 0 }}>
                <Btn small color={COLORS.navy} outline onClick={() => { setSchedFor(schedFor === b.id ? null : b.id); setNewFrom(""); setNewTo(""); }}>Ναύλα</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setDetailFor(detailFor === b.id ? null : b.id)}>Πληροφορίες</Btn>
              </div>
            </div>

            {schedFor === b.id && (
              <div style={{ marginTop: 8, borderTop: `1px dashed ${COLORS.line}`, paddingTop: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.sub, marginBottom: 4 }}>Πρόγραμμα ναύλων σεζόν</div>
                <CharterCalendar charters={getCharters(b)} />
                {getCharters(b).length === 0 && <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 4 }}>Κανένα ναύλο ακόμα.</div>}
                {getCharters(b).map(ch => {
                  const active = ch.from <= todayStr() && todayStr() <= ch.to;
                  const past = ch.to < todayStr();
                  return (
                    <div key={ch.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "4px 0", borderBottom: `1px dashed ${COLORS.line}`, opacity: past ? 0.5 : 1 }}>
                      <span>{active && <span style={{ color: COLORS.teal, fontWeight: 700 }}>● </span>}{fmtDate(ch.from)} → {fmtDate(ch.to)}{active ? " (τώρα)" : past ? " (πέρασε)" : ""}</span>
                      <button data-compact onClick={() => removeCharter(b, ch.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12 }}>🗑</button>
                    </div>
                  );
                })}
                <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  <input type="date" value={newFrom} onChange={e => setNewFrom(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
                  <span style={{ color: COLORS.sub }}>→</span>
                  <input type="date" min={newFrom} value={newTo} onChange={e => setNewTo(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
                  <Btn small color={COLORS.navy} onClick={() => saveCharter(b)}>+ Προσθήκη</Btn>
                </div>
                {newFrom && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: COLORS.sub }}>Γρήγορη διάρκεια από {fmtDate(newFrom)}:</span>
                    <Btn small color={COLORS.teal} outline onClick={() => setNewTo(addDays(newFrom, 6))}>1 εβδομάδα</Btn>
                    <Btn small color={COLORS.teal} outline onClick={() => setNewTo(addDays(newFrom, 13))}>2 εβδομάδες</Btn>
                    <input type="number" min="1" value={customDays} onChange={e => setCustomDays(e.target.value)} placeholder="μέρες" style={{ ...inputStyle, width: 64 }} />
                    <Btn small color={COLORS.sub} outline onClick={() => { if (customDays && Number(customDays) > 0) setNewTo(addDays(newFrom, Number(customDays) - 1)); }}>Ορισμός</Btn>
                  </div>
                )}
                <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>Η μέρα επιστροφής μετράει ως πλήρης μέρα ναύλου — το σκάφος είναι ελεύθερο από την επόμενη. Η κατάσταση (εν πλω / στη βάση) και ο έλεγχος αναχώρησης υπολογίζονται αυτόματα από το πρόγραμμα.</div>
              </div>
            )}

            {detailFor === b.id && (
              <BoatDetail boat={b} tasks={tasks} boatNotes={boatNotes} onAddNote={onAddBoatNote} onDeleteNote={onDeleteBoatNote} isMgr={isMgr} onDeleteBoat={() => { persistBoats(boats.filter(x => x.id !== b.id)); showToast(`Το ${b.name} διαγράφηκε`); }} />
            )}
          </div>
        </React.Fragment>
        );
      })}
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginTop: 12 }}>
        <label style={lbl}>Νέο σκάφος</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={newBoatName} onChange={e => setNewBoatName(e.target.value)} placeholder="Όνομα (π.χ. Καλλιρόη)" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input value={newBoatType} onChange={e => setNewBoatType(e.target.value)} placeholder="Τύπος (π.χ. Bavaria 46)" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <Btn small color={COLORS.navy} onClick={() => {
            if (!newBoatName.trim()) return;
            persistBoats([...boats, { id: "b" + Date.now(), name: newBoatName.trim(), type: newBoatType.trim(), atSea: false, returnDate: null, departureDate: null, charters: [] }]);
            setNewBoatName(""); setNewBoatType(""); showToast(`Προστέθηκε: ${newBoatName.trim()}`);
          }}>+</Btn>
        </div>
      </div>
    </div>
  );
}

// ---------- ⚙️ Ρυθμίσεις ----------
// Κάθε τιμή που καθορίζει συμπεριφορά της βάσης, σε ένα σημείο. Οργανωμένες σε αναδιπλούμενες ομάδες ώστε
// η οθόνη να μένει ήρεμη — ανοίγει μία ομάδα τη φορά, όχι τοίχος από πεδία.
const DAY_NAMES_SHORT = ["Κυρ", "Δευ", "Τρι", "Τετ", "Πεμ", "Παρ", "Σαβ"];
function SettingsGroup({ title, subtitle, children, openKey, cur, setCur }) {
  const isOpen = cur === openKey;
  return (
    <div style={{ background: COLORS.card, borderRadius: 12, marginBottom: 8, border: `1px solid ${isOpen ? COLORS.navy : COLORS.line}` }}>
      <button onClick={() => setCur(isOpen ? null : openKey)} style={{ width: "100%", background: "none", border: "none", padding: "12px 12px", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span>
          <span style={{ fontWeight: 700, fontSize: 15, color: COLORS.text }}>{title}</span>
          {subtitle && <span style={{ display: "block", fontSize: 12, color: COLORS.sub, marginTop: 0 }}>{subtitle}</span>}
        </span>
        <span style={{ color: COLORS.sub, fontSize: 13 }}>{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen && <div style={{ padding: "0 12px 12px" }}>{children}</div>}
    </div>
  );
}
// Οι επεξηγήσεις είναι χρήσιμες την πρώτη φορά και θόρυβος τη δέκατη — μπαίνουν πίσω από το «ⓘ» της κάθε
// γραμμής, με τον διακόπτη «Επεξηγήσεις» της ομάδας να τις ανοίγει όλες μαζί όποτε χρειάζεται.
function SettingRow({ label, hint, children, showHints }) {
  const [openHint, setOpenHint] = useState(false);
  const visible = showHints || openHint;
  return (
    <div style={{ padding: "8px 0", borderTop: `1px dashed ${COLORS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, flex: 1 }}>
          {label}
          {hint && !showHints && (
            <button data-compact onClick={() => setOpenHint(!openHint)} style={{ border: "none", background: "none", color: COLORS.sub, fontSize: 13, padding: "0 4px" }}>ⓘ</button>
          )}
        </span>
        <span style={{ flexShrink: 0 }}>{children}</span>
      </div>
      {hint && visible && <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, minWidth: 68,
      border: `1.5px solid ${on ? COLORS.green : COLORS.line}`,
      background: on ? COLORS.green : COLORS.card, color: on ? "#fff" : COLORS.sub,
    }}>{on ? "Ενεργό" : "Ανενεργό"}</button>
  );
}
function DayPicker({ value, onChange }) {
  const sel = Array.isArray(value) ? value : [];
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
      {DAY_NAMES_SHORT.map((n, i) => {
        const on = sel.includes(i);
        return (
          <button key={i} onClick={() => onChange(on ? sel.filter(x => x !== i) : [...sel, i].sort())} style={{
            padding: "4px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${on ? COLORS.navy : COLORS.line}`,
            background: on ? COLORS.navy : COLORS.card, color: on ? "#fff" : COLORS.sub,
          }}>{n}</button>
        );
      })}
    </div>
  );
}
function SettingsAdmin({ settings, updateSettings, resetSettings }) {
  const [cur, setCur] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const s = settings;
  const numIn = (key, min, max, step) => (
    <input type="number" min={min} max={max} step={step || 1} value={s[key]}
      onChange={e => { const v = Number(e.target.value); if (!Number.isNaN(v) && v >= min && v <= max) updateSettings({ [key]: v }); }}
      style={{ ...inputStyle, width: 78, padding: "4px 8px", fontSize: 13 }} />
  );
  const timeIn = (key) => (
    <input type="time" value={s[key]} onChange={e => e.target.value && updateSettings({ [key]: e.target.value })}
      style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 13 }} />
  );
  const hourIn = (key) => (
    <select value={s[key]} onChange={e => updateSettings({ [key]: Number(e.target.value) })} style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 13 }}>
      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
    </select>
  );
  return (
    <div>
      <SectionTitle>Ρυθμίσεις</SectionTitle>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: COLORS.sub }}>Οι αλλαγές αποθηκεύονται αμέσως και ισχύουν για όλη τη βάση.</span>
        <button onClick={() => setShowHints(!showHints)} style={{ border: "none", background: "none", color: COLORS.sub, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
          {showHints ? "Απόκρυψη επεξηγήσεων" : "Επεξηγήσεις"}
        </button>
      </div>

      <SettingsGroup title="Ωράρια & αυτοματισμοί" subtitle="Πότε τρέχει τι μέσα στη μέρα" openKey="times" cur={cur} setCur={setCur}>
        <SettingRow showHints={showHints} label="Ώρα ελέγχου κλεισίματος" hint="Πότε δημιουργούνται αυτόματα οι εργασίες «Κλείσιμο σκάφους» (μόνο σε αυτόματη λειτουργία).">{timeIn("closingCheckTime")}</SettingRow>
        <SettingRow showHints={showHints} label="Ώρα λήξης κλεισιμάτων" hint="Μετά από αυτή την ώρα, όσα κλεισίματα δεν ολοκληρώθηκαν λήγουν και ειδοποιούνται οι Base Managers.">{hourIn("closingExpireHour")}</SettingRow>
        <SettingRow showHints={showHints} label="Ώρα αναχώρησης σκάφους" hint="Μέχρι αυτή την ώρα το σκάφος που φεύγει σήμερα μετράει ακόμα ως «στη βάση» με εργασίες.">{timeIn("departureCutoffTime")}</SettingRow>
        <SettingRow showHints={showHints} label="Περιθώριο ναύλου τελευταίας στιγμής (ώρες)" hint="Αν καταχωρηθεί ναύλος αφού περάσει η ώρα αναχώρησης, δίνεται τόσος χρόνος για τις τελευταίες δουλειές.">{numIn("lateCharterGraceHours", 0, 12)}</SettingRow>
        <SettingRow showHints={showHints} label="Έναρξη ωραρίου εργασίας">{timeIn("workStart")}</SettingRow>
        <SettingRow showHints={showHints} label="Λήξη ωραρίου εργασίας" hint="Το ωράριο καθορίζει τον υπολογισμό των προθεσμιών — καμία προθεσμία δεν πέφτει εκτός αυτού.">{timeIn("workEnd")}</SettingRow>
        <div style={{ padding: "8px 0", borderTop: `1px dashed ${COLORS.line}` }}>
          <div style={{ fontSize: 13 }}>Μη εργάσιμες μέρες</div>
          <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>Δεν τρέχει κατανομή και οι προθεσμίες τις προσπερνούν.</div>
          <DayPicker value={s.nonWorkingDays} onChange={v => updateSettings({ nonWorkingDays: v })} />
        </div>
        <div style={{ padding: "8px 0", borderTop: `1px dashed ${COLORS.line}` }}>
          <div style={{ fontSize: 13 }}>Μέρες χωρίς νέες αυτόματες εργασίες</div>
          <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 4 }}>Προεπιλογή Κυρ+Σαβ: το Σάββατο η προτεραιότητα είναι το κλείσιμο υπαρχουσών εργασιών, όχι νέες.</div>
          <DayPicker value={s.noAutoTaskDays} onChange={v => updateSettings({ noAutoTaskDays: v })} />
        </div>
        <SettingRow showHints={showHints} label="Ώρα εβδομαδιαίας αναφοράς">{hourIn("weeklyReportHour")}</SettingRow>
        <div style={{ padding: "8px 0", borderTop: `1px dashed ${COLORS.line}` }}>
          <div style={{ fontSize: 13 }}>Μέρα εβδομαδιαίας αναφοράς</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {DAY_NAMES_SHORT.map((n, i) => (
              <button key={i} onClick={() => updateSettings({ weeklyReportDay: i })} style={{
                padding: "4px 8px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                border: `1.5px solid ${s.weeklyReportDay === i ? COLORS.navy : COLORS.line}`,
                background: s.weeklyReportDay === i ? COLORS.navy : COLORS.card, color: s.weeklyReportDay === i ? "#fff" : COLORS.sub,
              }}>{n}</button>
            ))}
          </div>
        </div>
      </SettingsGroup>

      <SettingsGroup title="AI κατανομή εργασιών" subtitle="Πόσο και πώς μοιράζει το σύστημα" openKey="ai" cur={cur} setCur={setCur}>
        <SettingRow showHints={showHints} label="Μέγιστες εργασίες ανά άτομο/μέρα" hint="Ανώτατο όριο που δίνεται στο AI κατά την ημερήσια κατανομή.">{numIn("maxTasksPerEmployee", 1, 10)}</SettingRow>
        <SettingRow showHints={showHints} label="Όριο «χαμηλού φόρτου»" hint="Με τόσες ή λιγότερες ανοιχτές εργασίες, το άτομο θεωρείται διαθέσιμο για νέα αυτόματη εργασία.">{numIn("lowLoadThreshold", 0, 5)}</SettingRow>
        <SettingRow showHints={showHints} label="Εργασίες αναμονής ανά ενεργοποίηση" hint="Πόσες εργασίες «για όταν υπάρχει κενό» ενεργοποιούνται μαζί.">{numIn("maxBacklogConvert", 1, 10)}</SettingRow>
        <SettingRow showHints={showHints} label="Ιστορικό σκάφους για το AI (μέρες)" hint="Πόσο πίσω κοιτά το AI ώστε να μην ξαναστείλει κάποιον στο ίδιο σημείο.">{numIn("boatHistoryDays", 7, 90)}</SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Χρόνοι εμφάνισης" subtitle="Πόσο μένουν ορατά μηνύματα και πίνακες" openKey="vis" cur={cur} setCur={setCur}>
        <SettingRow showHints={showHints} label="Ορατότητα μηνυμάτων (ώρες)" hint="Πόσο μένει ορατό ένα εσωτερικό μήνυμα από τη στιγμή αποστολής.">{numIn("noteVisibleHours", 1, 72)}</SettingRow>
        <SettingRow showHints={showHints} label="Ειδοποίηση κλεισίματος έως" hint="Ως ποια ώρα το επόμενο πρωί παραμένει ορατή η ειδοποίηση για σκάφος που δεν έκλεισε.">{hourIn("closingAlertUntilHour")}</SettingRow>
        <SettingRow showHints={showHints} label="Παράθυρο «Αναχωρήσεις & Επιστροφές» (μέρες)" hint="Πόσες μέρες μπροστά δείχνει ο πίνακας στην αρχική οθόνη.">{numIn("departuresWindowDays", 1, 30)}</SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Διακόπτες αυτοματισμών" subtitle="Τι τρέχει μόνο του και τι όχι" openKey="switches" cur={cur} setCur={setCur}>
        <SettingRow showHints={showHints} label="Έλεγχος κλεισίματος: αυτόματος" hint={s.closingCheckMode === "manual" ? "Χειροκίνητο: δημιουργείται μόνο με το κουμπί στην Επισκόπηση." : `Τρέχει αυτόματα μετά τις ${s.closingCheckTime}.`}>
          <Toggle on={s.closingCheckMode !== "manual"} onChange={v => updateSettings({ closingCheckMode: v ? "auto" : "manual" })} />
        </SettingRow>
        <SettingRow showHints={showHints} label="Ημερήσια κατανομή AI" hint="Η αυτόματη μοιρασιά εργασιών στο πρώτο άνοιγμα κάθε μέρας.">
          <Toggle on={s.autoDistribution !== false} onChange={v => updateSettings({ autoDistribution: v })} />
        </SettingRow>
        <SettingRow showHints={showHints} label="Αυτόματες εργασίες χαμηλού φόρτου" hint="Δημιουργία νέων εργασιών όταν η ουρά αδειάζει.">
          <Toggle on={s.autoLowLoadTasks !== false} onChange={v => updateSettings({ autoLowLoadTasks: v })} />
        </SettingRow>
        <SettingRow showHints={showHints} label="Checklist αναχώρησης" hint="Άνοιγμα λίστας ελέγχου όταν πλησιάζει αναχώρηση σκάφους.">
          <Toggle on={s.autoDepartureChecklists !== false} onChange={v => updateSettings({ autoDepartureChecklists: v })} />
        </SettingRow>
        <SettingRow showHints={showHints} label="Αυτόματη εβδομαδιαία αναφορά" hint="Αν κλείσει, η αναφορά δημιουργείται μόνο χειροκίνητα.">
          <Toggle on={s.autoWeeklyReport !== false} onChange={v => updateSettings({ autoWeeklyReport: v })} />
        </SettingRow>
      </SettingsGroup>

      <SettingsGroup title="Φωτογραφίες" subtitle="Ποιότητα & μέγεθος αποθήκευσης" openKey="photo" cur={cur} setCur={setCur}>
        <SettingRow showHints={showHints} label="Μέγιστη διάσταση (pixels)" hint="Μεγαλύτερη τιμή = καθαρότερες φωτογραφίες, αλλά πιο αργό ανέβασμα και περισσότερος χώρος.">{numIn("photoMaxDim", 640, 2560, 160)}</SettingRow>
        <SettingRow showHints={showHints} label="Ποιότητα συμπίεσης" hint="Από 0.4 (μικρό αρχείο) έως 0.95 (υψηλή ποιότητα). Προεπιλογή 0.72.">{numIn("photoQuality", 0.4, 0.95, 0.01)}</SettingRow>
      </SettingsGroup>

      <div style={{ marginTop: 12, borderTop: `1px dashed ${COLORS.line}`, paddingTop: 12 }}>
        {!confirmReset
          ? <Btn small color={COLORS.sub} outline onClick={() => setConfirmReset(true)}>Επαναφορά προεπιλογών</Btn>
          : (
            <div>
              <div style={{ fontSize: 13, color: COLORS.red, marginBottom: 8 }}>Όλες οι ρυθμίσεις θα επανέλθουν στις αρχικές τιμές. Σίγουρα;</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small color={COLORS.red} onClick={() => { resetSettings(); setConfirmReset(false); }}>Ναι, επαναφορά</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setConfirmReset(false)}>Άκυρο</Btn>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

function ListsAdmin({ quick, checklist, closingChecklist, persistQuick, persistChecklist, persistClosingChecklist }) {
  return (
    <div>
      <EditableList title="Γρήγορες εργασίες (quick-tasks)" items={quick} onChange={persistQuick} placeholder="π.χ. Αλλαγή impeller" />
      <EditableList title="Checklist αναχώρησης (ανοίγουν αυτόματα όταν ορίζεται αναχώρηση)" items={checklist} onChange={persistChecklist} placeholder="π.χ. Έλεγχος άγκυρας" />
      <EditableList title="Checklist κλεισίματος βάσης (υπενθύμιση σε κάθε εργασία κλεισίματος, μετά τις 15:30)" items={closingChecklist} onChange={persistClosingChecklist} placeholder="π.χ. Φώτα σβηστά" />
    </div>
  );
}

function AbsencesAdmin({ users, absences, onAdd, onDelete }) {
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const today = todayStr();
  const upcoming = absences.filter(a => a.to >= today).sort((a, b) => a.from.localeCompare(b.from));
  const past = absences.filter(a => a.to < today).sort((a, b) => b.from.localeCompare(a.from));
  const un = (id) => users.find(u => u.id === id)?.name || "";
  const Row = ({ a }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 13 }}>
      <span><b>{un(a.userId)}</b> · {fmtDate(a.from)} – {fmtDate(a.to)}{a.note ? ` · ${a.note}` : ""}</span>
      <button data-compact onClick={() => onDelete(a.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700 }}>×</button>
    </div>
  );
  return (
    <div>
      <SectionTitle>Επερχόμενες / τρέχουσες απουσίες ({upcoming.length})</SectionTitle>
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 12 }}>
        {upcoming.length === 0 && <div style={{ fontSize: 15, color: COLORS.sub }}>Καμία δηλωμένη απουσία.</div>}
        {upcoming.map(a => <Row key={a.id} a={a} />)}
      </div>

      <SectionTitle>Καταχώρηση απουσίας για κάποιον</SectionTitle>
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 12 }}>
        <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
          <option value="">Επίλεξε άτομο</option>
          {users.filter(u => u.role !== "owner").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: "auto", flex: 1 }} />
          <input type="date" min={from} value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: "auto", flex: 1 }} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="π.χ. άδεια, καπετάνιος σε ναύλο (προαιρετικό)" style={{ ...inputStyle, marginTop: 8 }} />
        <div style={{ marginTop: 8 }}>
          <Btn small color={COLORS.navy} onClick={() => { if (!userId || !from || !to) return; onAdd(userId, from, to, note.trim()); setUserId(""); setFrom(""); setTo(""); setNote(""); }}>+ Προσθήκη</Btn>
        </div>
      </div>

      {past.length > 0 && (
        <>
          <SectionTitle>Παλαιότερες ({past.length})</SectionTitle>
          <div style={{ background: COLORS.card, borderRadius: 12, padding: 12 }}>
            {past.map(a => <Row key={a.id} a={a} />)}
          </div>
        </>
      )}
    </div>
  );
}

function EditableList({ title, items, onChange, placeholder }) {
  const [val, setVal] = useState("");
  const safeItems = asStringArray(items) || [];
  return (
    <div style={{ marginBottom: 8 }}>
      <SectionTitle>{title}</SectionTitle>
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 12 }}>
        {safeItems.map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 15 }}>
            {it}
            <Btn small color={COLORS.red} outline onClick={() => onChange(safeItems.filter((_, j) => j !== i))}>×</Btn>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} style={inputStyle} />
          <Btn small color={COLORS.navy} onClick={() => { if (!val.trim()) return; onChange([...safeItems, val.trim()]); setVal(""); }}>+</Btn>
        </div>
      </div>
    </div>
  );
}

function Stats({ users, tasks, boats }) {
  const [sel, setSel] = useState(null);
  const [range, setRange] = useState("week");
  if (sel) {
    const now = new Date();
    const from = new Date(now);
    if (range === "week") from.setDate(now.getDate() - 7);
    else if (range === "month") from.setMonth(now.getMonth() - 1);
    else from.setFullYear(2000);
    const inR = (d) => d && new Date(d) >= from;
    const bn = (id) => boats?.find(b => b.id === id)?.name || "Βάση/Άλλο";
    const done = tasks.filter(t => t.completedBy === sel.id && t.status === "done" && inR(t.completedAt)).sort((a,b)=>(b.completedAt||"").localeCompare(a.completedAt||""));
    const created = tasks.filter(t => t.createdBy === sel.id && inR(t.createdAt));
    const prog = tasks.flatMap(t => (t.progress||[]).filter(p => p.by === sel.id && inR(p.at)).map(p => ({...p, desc: t.desc, boatId: t.boatId})));
    return (
      <div>
        <SectionTitle>{sel.name} — ιστορικό</SectionTitle>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {[["week","Εβδομάδα"],["month","Μήνας"],["all","Όλα"]].map(([id,l]) => (
            <Btn key={id} small color={COLORS.navy} outline={range!==id} onClick={()=>setRange(id)}>{l}</Btn>
          ))}
          <Btn small color={COLORS.sub} outline onClick={()=>setSel(null)}>← Πίσω</Btn>
        </div>
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 8, fontSize: 15 }}>
          <b>Σύνοψη:</b> {done.length} ολοκληρώσεις · {created.length} καταχωρήσεις · {prog.length} πρόοδοι
        </div>
        <SectionTitle>Ολοκληρώσεις</SectionTitle>
        {done.length === 0 && <Empty>Καμία στο διάστημα.</Empty>}
        {done.map(t => (
          <div key={t.id} style={{ background: COLORS.card, borderRadius: 12, padding: "8px 12px", marginBottom: 4, fontSize: 13 }}>
            <b>{t.desc}</b> — {bn(t.boatId)} · {fmtDate(t.completedAt)}{t.returns > 0 ? <span style={{color:COLORS.red}}> · ↩{t.returns}</span> : ""}
          </div>
        ))}
        <SectionTitle>Πρόοδοι</SectionTitle>
        {prog.length === 0 && <Empty>Καμία στο διάστημα.</Empty>}
        {prog.map((p,i) => (
          <div key={i} style={{ background: COLORS.card, borderRadius: 12, padding: "8px 12px", marginBottom: 4, fontSize: 13 }}>
            ✏ {p.note} <span style={{color:COLORS.sub}}>({p.desc} — {bn(p.boatId)}, {fmtDate(p.at)})</span>
          </div>
        ))}
        <SectionTitle>Καταχωρήσεις (εντοπισμοί)</SectionTitle>
        {created.length === 0 && <Empty>Καμία στο διάστημα.</Empty>}
        {created.map(t => (
          <div key={t.id} style={{ background: COLORS.card, borderRadius: 12, padding: "8px 12px", marginBottom: 4, fontSize: 13 }}>
            {t.desc} — {bn(t.boatId)} · {fmtDate(t.createdAt)}
          </div>
        ))}
      </div>
    );
  }
  const rows = users.filter(u => u.role === "employee" && !u.noStats).map(u => ({
    name: u.name,
    created: tasks.filter(t => t.createdBy === u.id).length,
    done: tasks.filter(t => t.completedBy === u.id && t.status === "done").length,
    prog: tasks.reduce((s, t) => s + (t.progress || []).filter(p => p.by === u.id).length, 0),
    returns: tasks.filter(t => t.completedBy === u.id || (t.status === "open" && t.assignedTo === u.id && t.returnNote)).reduce((s, t) => s + (t.returns || 0), 0),
  }));
  return (
    <div>
      <SectionTitle>Στατιστικά ομάδας (ορατά μόνο σε managers)</SectionTitle>
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead><tr style={{ color: COLORS.sub, textAlign: "left" }}>
            <th style={th}>Άτομο</th><th style={th}>Εντόπισε</th><th style={th}>Ολοκλήρωσε</th><th style={th}>Πρόοδοι</th><th style={th}>↩ Επιστρ.</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.name} style={{ borderTop: `1px solid ${COLORS.line}` }} onClick={() => setSel(users.find(u => u.name === r.name))}>
                <td style={td}><b style={{ color: COLORS.teal, textDecoration: "underline" }}>{r.name}</b></td><td style={td}>{r.created}</td><td style={td}>{r.done}</td><td style={td}>{r.prog}</td>
                <td style={{ ...td, color: r.returns > 0 ? COLORS.red : COLORS.text }}>{r.returns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const th = { padding: "4px 8px", fontWeight: 700, fontSize: 12 };
const td = { padding: "8px 8px" };

function AiSearch({ tasks, boats, users, aiMemories, onAddMemory, onDeleteMemory, onAddScheduled, onDeleteTask }) {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const backlog = tasks.filter(t => t.status === "backlog");

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    if (!SR) return;
    const rec = new SR();
    rec.lang = LANG === "en" ? "en-US" : "el-GR";
    rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + " ";
      if (add) setQ(t => (t + " " + add).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec; rec.start(); setListening(true);
  };

  const run = async () => {
    if (!q.trim() || busy) return;
    setBusy(true); setAns("");
    try {
      const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
      const un = (id) => users.find(u => u.id === id)?.name || "";
      const history = tasks.filter(t => t.status === "done").map(t =>
        `[${bn(t.boatId)}] "${t.desc}" ολοκληρώθηκε ${new Date(t.completedAt).toLocaleDateString("el-GR")} από ${un(t.completedBy) || "άγνωστο"}${t.progress?.length ? " | πρόοδοι: " + t.progress.map(p => p.note).join("· ") : ""}`
      ).join("\n");
      const profiles = users.filter(u => u.profile).map(u => `${u.name}: ${u.profile}`).join("\n");
      const memText = aiMemories.map(m => `"${m.text}" (${fmtDate(m.at)})`).join("; ") || "(καμία)";
      const prompt = `Είσαι προσωπικός βοηθός του ιδιοκτήτη μιας βάσης σκαφών, μέσα σε εφαρμογή διαχείρισης. Ο χρήστης σου μιλάει ελεύθερα (γραπτά ή φωνητικά). Αποφάσισε ΤΙ θέλει και απάντησε με JSON.
ΣΗΜΕΡΙΝΗ ΗΜΕΡΟΜΗΝΙΑ: ${todayStr()}
ΤΡΕΙΣ πιθανές ενέργειες:
1. "remember" — σου λέει κάτι να θυμάσαι/καταγράψεις (παρατήρηση, πληροφορία, σχόλιο) ΧΩΡΙΣ να ζητάει συγκεκριμένη μελλοντική ανάθεση εργασίας.
2. "schedule" — σου ζητάει να «βάλεις»/«αναθέσεις» μια εργασία αργότερα, όχι τώρα (π.χ. «βάλε αυτό σε μια βδομάδα στον Βασίλη», «κάποια στιγμή θέλω να γίνει...»). Εξήγαγε: σύντομη περιγραφή εργασίας (note), σκάφος αν αναφέρεται (boatName), ΠΟΤΕ ως ημερομηνία YYYY-MM-DD υπολογισμένη από τη σημερινή (scheduledFor· null αν δεν ανέφερε χρόνο — τότε θα μπει μόλις υπάρξει διαθεσιμότητα), όνομα ατόμου αν προτιμά συγκεκριμένο (assigneeName, null αν δεν είπε).
3. "answer" — κάνει ερώτηση (για υπάλληλο, σκάφος, ιστορικό, στατιστικά) και θέλει απάντηση ΤΩΡΑ.
ΔΕΔΟΜΕΝΑ ΓΙΑ ΑΠΑΝΤΗΣΕΙΣ (χρησιμοποίησέ τα μόνο αν action="answer"):
ΠΡΟΦΙΛ ΥΠΑΛΛΗΛΩΝ:\n${profiles}
ΣΚΑΦΗ & ΠΡΟΓΡΑΜΜΑ ΝΑΥΛΩΝ ΣΕΖΟΝ:\n${boats.map(b => {
        const s = boatStatus(b);
        const chs = getCharters(b);
        const nd = nextDeparture(b);
        const departText = nd ? ` (επόμενη αναχώρηση ${fmtDate(nd.date)})` : " (κανένα προγραμματισμένο ναύλο μετά)";
        const now = s.atSea
          ? (s.returnDate === todayStr()
              ? `επιστρέφει ΣΗΜΕΡΑ (${fmtDate(s.returnDate)}) — μπορεί να έχει ήδη γυρίσει στη βάση νωρίτερα μέσα στη μέρα${departText}`
              : `τώρα ΕΝ ΠΛΩ (επιστρέφει ${fmtDate(s.returnDate)})`)
          : `τώρα στη βάση${departText}`;
        const list = chs.length ? chs.map(c => `${c.from}→${c.to}`).join(", ") : "κανένα";
        return `${b.name}: ${now}. Ναύλα σεζόν: ${list}`;
      }).join("\n")}
ΑΠΟΘΗΚΕΥΜΕΝΕΣ ΣΗΜΕΙΩΣΕΙΣ: ${memText}
ΙΣΤΟΡΙΚΟ ΕΡΓΑΣΙΩΝ:\n${history || "(κενό)"}
ΜΗΝΥΜΑ ΧΡΗΣΤΗ: "${q.trim()}"
Απάντησε ΜΟΝΟ με JSON χωρίς markdown: {"action":"remember|schedule|answer","note":"σύντομη περίληψη για αποθήκευση (για remember/schedule)","boatName":"...ή null","scheduledFor":"YYYY-MM-DD ή null","assigneeName":"...ή null","answer":"πλήρης απάντηση στα ελληνικά — μόνο για action=answer, αλλιώς κενό string"}`;
      const raw = await askClaude(prompt, 700);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (parsed.action === "remember") {
        await onAddMemory(parsed.note || q.trim());
        setAns(`🧠 Το θυμήθηκα: «${parsed.note || q.trim()}»`);
      } else if (parsed.action === "schedule") {
        const boat = boats.find(b => b.name === parsed.boatName) || boats.find(b => parsed.boatName && b.name.toLowerCase().includes(String(parsed.boatName).toLowerCase()));
        await onAddScheduled(parsed.note || q.trim(), boat ? boat.id : null, parsed.scheduledFor || null, parsed.assigneeName || null);
        setAns(`⏳ Μπήκε σε αναμονή: «${parsed.note || q.trim()}»${parsed.scheduledFor ? ` — θα ενεργοποιηθεί από ${fmtDate(parsed.scheduledFor)}` : " — θα μπει όταν υπάρξει διαθεσιμότητα"}${parsed.assigneeName ? ` (προτίμηση: ${parsed.assigneeName})` : ""}`);
      } else {
        setAns(parsed.answer || "Δεν κατάλαβα — δοκίμασε να το διατυπώσεις διαφορετικά.");
      }
      setQ("");
    } catch { setAns("Σφάλμα — δοκίμασε ξανά."); }
    setBusy(false);
  };

  return (
    <div>
      <SectionTitle>AI Βοηθός</SectionTitle>
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 8 }}>Ρώτησε οτιδήποτε, πες κάτι να το θυμάται, ή ζήτα να βάλει μια εργασία αργότερα.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={toggleMic} style={{
            padding: "8px 12px", borderRadius: 12, fontWeight: 700, fontSize: 15,
            border: `2px solid ${listening ? COLORS.red : COLORS.teal}`,
            background: listening ? COLORS.red : "transparent", color: listening ? "#fff" : COLORS.teal,
          }}>{listening ? "⏹" : "🎤"}</button>
          <textarea value={q} onChange={e => setQ(e.target.value)} rows={2} placeholder='π.χ. "Πες μου για τον Βασίλη" ή "Θυμήσου ότι το μηχανοστάσιο στη Βερόνικα θέλει τακτοποίηση, βάλε το όποτε υπάρχει χρόνος"' style={{ ...inputStyle, flex: 1 }} />
        </div>
        <Btn color={COLORS.teal} onClick={run}>{busy ? "…" : "Στείλε"}</Btn>
        {ans && <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap", background: COLORS.bg, borderRadius: 12, padding: 12 }}>{ans}</div>}
      </div>
      {aiMemories.length > 0 && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>🧠 Όσα θυμάται ({aiMemories.length})</div>
          {aiMemories.map(m => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "4px 0", borderBottom: `1px dashed ${COLORS.line}` }}>
              <span>{m.text} <span style={{ color: COLORS.sub, fontSize: 12 }}>— {fmtDate(m.at)}</span></span>
              <button data-compact onClick={() => onDeleteMemory(m.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, flexShrink: 0 }}>🗑</button>
            </div>
          ))}
        </div>
      )}
      {backlog.length > 0 && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>⏳ Σε αναμονή ({backlog.length}) — δεν φαίνονται σε κανέναν ακόμα</div>
          {backlog.map(t => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "4px 0", borderBottom: `1px dashed ${COLORS.line}` }}>
              <span>{t.desc} <span style={{ color: COLORS.sub, fontSize: 12 }}>({boats.find(b => b.id === t.boatId)?.name || "Βάση/Άλλο"}{t.scheduledFor ? ` · από ${fmtDate(t.scheduledFor)}` : ""}{t.preferredAssignee ? ` · προτίμηση: ${users.find(u => u.id === t.preferredAssignee)?.name || ""}` : ""})</span></span>
              <button data-compact onClick={() => onDeleteTask(t)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, flexShrink: 0 }}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ErrorsAdmin() {
  const [errors, setErrors] = useState(null);
  useEffect(() => { load("app-errorlog", []).then(x => setErrors(Array.isArray(x) ? x : [])); }, []);
  const clearAll = async () => { await save("app-errorlog", []); setErrors([]); };
  if (errors === null) return <Empty>Φόρτωση…</Empty>;
  return (
    <div>
      <SectionTitle>Σφάλματα ({errors.length})</SectionTitle>
      <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 8 }}>Αυτόματη καταγραφή κάθε φορά που κάτι σπάει κάπου στην εφαρμογή — δείχνει ακριβώς πού, ώστε να μη χρειάζεται τυφλή αναζήτηση.</div>
      {errors.length === 0 && <Empty>Κανένα καταγεγραμμένο σφάλμα. 🎉</Empty>}
      {errors.map(e => (
        <div key={e.id} style={{ background: COLORS.card, borderRadius: 12, padding: "12px 12px", marginBottom: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: COLORS.red }}>⚠️ {e.section} <span style={{ fontWeight: 400, color: COLORS.sub, fontSize: 12 }}>· {e.version} · {fmtDate(e.at)}</span></div>
          <div style={{ marginTop: 4, color: COLORS.text }}>{e.message}</div>
        </div>
      ))}
      {errors.length > 0 && <Btn small color={COLORS.sub} outline onClick={clearAll}>Καθάρισμα όλων</Btn>}
    </div>
  );
}

function ProfilesView({ users, me, onViewAs, persistUsers }) {
  const [phoneFor, setPhoneFor] = useState(null);
  const [phoneVal, setPhoneVal] = useState("");
  const roleLabel = (r) => r === "manager" ? "Base Manager" : r === "owner" ? "Διαχειριστής" : r === "associate" ? "Στέλεχος" : "Υπάλληλος";
  // Όλη η ομάδα εδώ — Διαχειριστής, Base Managers, Στελέχη, Υπάλληλοι — ώστε το τηλέφωνο του καθενός να
  // βρίσκεται εύκολα σε ένα σημείο. Η «Προβολή ως» παραμένει διαθέσιμη μόνο για υπαλλήλους/στελέχη, ποτέ για
  // Base Manager ή τον Διαχειριστή, και ποτέ για τον εαυτό σου.
  const shown = users;
  return (
    <div>
      <SectionTitle>Ομάδα</SectionTitle>
      {shown.length === 0 && <Empty>Κανένας χρήστης ακόμα.</Empty>}
      {shown.map(u => {
        const showViewAs = onViewAs && u.role !== "manager" && u.role !== "owner" && u.id !== me.id;
        return (
        <div key={u.id} style={{ background: COLORS.card, borderRadius: 12, padding: "12px 12px", marginBottom: 8, fontSize: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <div><b>{u.name}</b> <span style={{ color: COLORS.sub, fontSize: 13 }}>{roleLabel(u.role)}</span></div>
              {u.phone ? (
                <a href={`tel:${u.phone}`} style={{ fontSize: 13, color: COLORS.sub, textDecoration: "none", marginTop: 0, display: "inline-block" }}>📞 {u.phone}</a>
              ) : (
                <span style={{ fontSize: 12, color: COLORS.sub, opacity: 0.6 }}>Χωρίς τηλέφωνο</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 4, flexDirection: "column", alignItems: "flex-end" }}>
              {persistUsers && <Btn small color={COLORS.sub} outline onClick={() => { setPhoneFor(phoneFor === u.id ? null : u.id); setPhoneVal(u.phone || ""); }}>☎ Τηλέφωνο</Btn>}
              {showViewAs && <Btn small color={COLORS.teal} onClick={() => onViewAs(u)}>Προβολή ως</Btn>}
            </div>
          </div>
          {phoneFor === u.id && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input value={phoneVal} onChange={e => setPhoneVal(e.target.value)} placeholder="π.χ. 6912345678" style={{ ...inputStyle, flex: 1 }} />
              <Btn small color={COLORS.navy} onClick={() => { persistUsers(users.map(x => x.id === u.id ? { ...x, phone: phoneVal.trim() } : x)); setPhoneFor(null); }}>Αποθήκευση</Btn>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}

function UsersAdmin({ users, persistUsers, me, onViewAs }) {
  const [name, setName] = useState("");
  const [profFor, setProfFor] = useState(null);
  const [prof, setProf] = useState("");
  return (
    <div>
      <SectionTitle>Χρήστες & ρόλοι (μόνο owner)</SectionTitle>
      {users.filter(u => u.id !== me.id).map(u => (
        <div key={u.id} style={{ background: COLORS.card, borderRadius: 12, padding: "12px 12px", marginBottom: 8, fontSize: 15 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{u.name}</b> <span style={{ color: COLORS.sub, fontSize: 13 }}>{u.role === "manager" ? "Base Manager" : u.role === "owner" ? "Διαχειριστής" : u.role === "associate" ? "Στέλεχος" : "Υπάλληλος"}</span>
              <div style={{ fontSize: 13, marginTop: 0 }}>
                Κωδικός: <b style={{ letterSpacing: 1 }}>{u.code}</b>{" "}
                <button onClick={() => persistUsers(users.map(x => x.id === u.id ? { ...x, code: genCode(x.name) } : x))}
                  style={{ border: "none", background: "none", color: COLORS.teal, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↻ νέος</button>
              </div>
              {u.profile && <div style={{ fontSize: 13, color: COLORS.sub, marginTop: 0 }}>{u.profile}</div>}
            </div>
            <div style={{ display: "flex", gap: 4, flexDirection: "column", alignItems: "flex-end" }}>
              {u.role !== "owner" && (
                <Btn small color={COLORS.navy} outline onClick={() => persistUsers(users.map(x => x.id === u.id ? { ...x, role: x.role === "employee" ? "associate" : x.role === "associate" ? "manager" : "employee" } : x))}>
                  {u.role === "manager" ? "Manager → Υπάλληλος" : u.role === "associate" ? "Στέλεχος → Manager" : "Υπάλληλος → Στέλεχος"}
                </Btn>
              )}
              {u.role === "employee" && (
                <Btn small color={u.noAutoAssign ? COLORS.red : COLORS.green} outline
                  onClick={() => persistUsers(users.map(x => x.id === u.id ? { ...x, noAutoAssign: !x.noAutoAssign } : x))}>
                  AI κατανομή: {u.noAutoAssign ? "όχι" : "ναι"}
                </Btn>
              )}
              <Btn small color={COLORS.navy} outline
                onClick={() => persistUsers(users.map(x => x.id === u.id ? { ...x, lang: x.lang === "en" ? "el" : "en" } : x))}>
                Γλώσσα: {u.lang === "en" ? "EN" : "ΕΛ"}
              </Btn>
              <Btn small color={COLORS.teal} outline onClick={() => { setProfFor(u.id); setProf(u.profile || ""); }}>Προφίλ</Btn>
              <Btn small color={COLORS.amber} outline onClick={() => { setProfFor("h-" + u.id); setProf(u.humor || ""); }}>Ύφος 😄</Btn>
              {onViewAs && <Btn small color={COLORS.teal} onClick={() => onViewAs(u)}>Προβολή ως</Btn>}
              {u.role !== "owner" && <Btn small color={COLORS.red} outline onClick={() => { if (confirm(`Αφαίρεση πρόσβασης: ${u.name};`)) persistUsers(users.filter(x => x.id !== u.id)); }}>Αφαίρεση</Btn>}
            </div>
          </div>
          {profFor === u.id && (
            <div style={{ marginTop: 8 }}>
              <textarea value={prof} onChange={e => setProf(e.target.value)} rows={2} placeholder="Δεξιότητες / τι κάνει κυρίως — το χρησιμοποιεί το AI για τις αναθέσεις" style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn small color={COLORS.navy} onClick={() => { persistUsers(users.map(x => x.id === u.id ? { ...x, profile: prof.trim() } : x)); setProfFor(null); }}>Αποθήκευση</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setProfFor(null)}>Άκυρο</Btn>
              </div>
            </div>
          )}
          {profFor === "h-" + u.id && (
            <div style={{ marginTop: 8 }}>
              <textarea value={prof} onChange={e => setProf(e.target.value)} rows={2} placeholder="Ύφος ημερήσιου μηνύματος (χιούμορ, πειράγματα, running jokes) — κενό = χωρίς μήνυμα" style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn small color={COLORS.navy} onClick={() => { persistUsers(users.map(x => x.id === u.id ? { ...x, humor: prof.trim() } : x)); setProfFor(null); }}>Αποθήκευση</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setProfFor(null)}>Άκυρο</Btn>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 12, marginTop: 12 }}>
        <label style={lbl}>Νέος χρήστης</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Όνομα" style={inputStyle} />
          <Btn small color={COLORS.navy} onClick={() => {
            if (!name.trim()) return;
            persistUsers([...users, { id: "u" + Date.now(), name: name.trim(), role: "employee", profile: "", code: genCode(name.trim()) }]);
            setName("");
          }}>+</Btn>
        </div>
      </div>
    </div>
  );
}


export default function App() {
  return (
    <ErrorBoundary label="Εφαρμογή">
      <AppInner />
    </ErrorBoundary>
  );
}


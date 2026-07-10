"use client";
import React, { useState, useEffect, useRef } from "react";
import { storage as winStorage } from "../lib/storage";
import { supabase } from "../lib/supabaseClient";

// ---------- Σταθερές ----------
const APP_VERSION = "v2.7";
const COLORS = {
  navy: "#0B2239",
  navySoft: "#14314F",
  bg: "#F4F6F8",
  card: "#FFFFFF",
  teal: "#0E7C86",
  tealDark: "#0A5D65",
  red: "#D93025",
  amber: "#E8930C",
  green: "#1E8E3E",
  text: "#1A2733",
  sub: "#5B6B7A",
  line: "#E3E8ED",
};

const SEED_USERS = [
  { id: "u-owner", name: "Owner", role: "owner", profile: "Ιδιοκτήτης εφαρμογής", code: "OWN-7301" },
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

// Το νέο αντικειμενοστρεφές Seeding για το Checklist
const SEED_CHECKLIST = [
  { id: "chk-1", text: "Εξωτερικό πλύσιμο", category: "Καθαρισμός" },
  { id: "chk-2", text: "Εσωτερικός καθαρισμός", category: "Καθαρισμός" },
  { id: "chk-3", text: "Έλεγχος τουαλετών", category: "Έλεγχος" },
  { id: "chk-4", text: "Έλεγχος εξοπλισμού", category: "Έλεγχος" }
];

const todayStr = () => new Date().toISOString().slice(0, 10);
let LANG = "el";

const TR = {
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
  "Σημείωση manager:": "Manager note:", "Διόρθωση": "Edit", "Φωνητική καταχώρηση με AI": "Voice entry with AI", "Μίλα": "Speak", "Σταμάτημα": "Stop", "Ανάλυση με AI": "Analyze with AI", "Ανάλυση…": "Analyzing…", "Καθάρισμα": "Clear", "Καταχώρηση όλων": "Add all", "Προεπισκόπηση — έλεγξε και διόρθωσε πριν την καταχώρηση": "Preview — check and correct before submitting", "Δεν αναγνωρίστηκαν εργασίες — δοκίμασε πιο συγκεκριμένη διατύπωση.": "No tasks recognized — try being more specific.", "Η ανάλυση απέτυχε — δοκίμασε ξανά.": "Analysis failed — try again.", "Η φωνητική αναγνώριση δεν υποστηρίζεται σε αυτή τη συσκευή/browser — γράψε το κείμενο και πάτα Ανάλυση.": "Speech recognition not supported on this device/browser — type the text and press Analyze.", "Πρόβλημα μικροφώνου — δοκίει ξανά ή γράψε το κείμενο.": "Microphone problem — try again or type the text.", "π.χ. Στον Λεωνίδα το παράθυρο είναι σπασμένο, δεν ανάβει το φως στην πλώρη και θέλει αλλαγή η σκότα": "e.g. On Leonidas the window is broken, the bow light is not working and the sheet needs replacement", "Πολλαπλές εργασίες: ΝΑΙ — μία ανά γραμμή": "Multiple tasks: ON — one per line", "Πολλαπλές εργασίες μαζί (μία ανά γραμμή)": "Multiple tasks at once (one per line)", "Μία εργασία ανά γραμμή, π.χ.:\nΠαράθυρο σπασμένο\nΤο φως στην πλώρη δεν ανάβει\nΗ σκότα θέλει αλλαγή": "One task per line, e.g.:\nBroken window\nBow light not working\nSheet needs replacement", "Διαγραφή": "Delete", "Φωτογραφίες (προαιρετικό)": "Photos (optional)", "Προσθήκη φωτογραφίας": "Add photo", "Αγορά": "Purchase", "Λείπει υλικό / χρειάζεται αγορά": "Missing material / needs purchase", "ΑΓΟΡΑ / ΛΕΙΨΗ ΥΛΙΚΟΥ — θα ανατεθεί στον Λεωνίδα": "PURCHASE / MISSING MATERIAL — will be assigned to Leonidas", "Ναι, διαγραφή": "Yes, delete", "Διαγραφή εργασίας; Δεν αναιρείται.": "Delete this task? This cannot be undone.", "πρόοδοι": "progress entries", "Επιστράφηκε": "Returned",
};

const tr = (s) => (LANG === "en" ? (TR[s] || s) : s);
const fmtDate = (d) => { if (!d) return ""; const x = new Date(d); return x.toLocaleDateString(LANG === "en" ? "en-GB" : "el-GR", { day: "numeric", month: "short" }); };
const daysUntil = (d) => { if (!d) return null; return Math.ceil((new Date(d) - new Date(todayStr())) / 86400000); };

// ---------- Αποθήκευση ----------
async function load(key, fallback) {
  try { const r = await winStorage.get(key, true); return r ? JSON.parse(r.value) : fallback; }
  catch { return fallback; }
}
async function save(key, val) {
  try { await winStorage.set(key, JSON.stringify(val), true); } catch (e) { console.error("save", key, e); }
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
function compressImage(file, maxDim = 1280, quality = 0.72) {
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
export default function App() {
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState([]);
  const [boats, setBoats] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [quick, setQuick] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [me, setMe] = useState(null);
  const [viewAs, setViewAs] = useState(null);
  const [tab, setTab] = useState("today");
  const [toast, setToast] = useState(null);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // Φόρτωση
  useEffect(() => {
    (async () => {
      let [u, b, t, q, c] = await Promise.all([
        load("app-users", null), load("app-boats", null), load("app-tasks", null),
        load("app-quicktasks", null), load("app-checklist", null),
      ]);
      if (!u) { u = SEED_USERS; await save("app-users", u); }
      
      if (u.some(x => !x.code)) { u = u.map(x => x.code ? x : { ...x, code: genCode(x.name) }); await save("app-users", u); }
      
      const PROFILES = {
        "Βασίλης": "Βασίλης (22): Πρόθυμος και συνεργάσιμος, ακολουθεί οδηγίες. Χωρίς εξειδίκευση — σε φάση εκμάθησης. Δυνατά σημεία: χειρωνακτικές και σωματικά απαιτητικές εργασίες (βιδώματα, μοντάρισμα, μεταφορές, βαριές δουλειές) — τις προτιμά και αποδίδει καλύτερα. Καθαρισμούς αναλαμβάνει κανονικά. Ιδανική ανάθεση: απλές, σαφώς ορισμένες εργασίες με συγκεκριμένες οδηγίες. Να αποφεύγονται: σύνθετες τεχνικές διαγνώσεις, εργασίες που απαιτούν αυτόνομο σχεδιασμό. Ποιότητα: χρειάζεται τακτικό έλεγχο ολοκληρώσεων. Συμπράξεις: ΜΠΑΛΑΝΤΕΡ — συνδυάζεται άνετα με οποιονδήποτε ως δεύτερο χέρι· πρώτη επιλογή όταν χρειάζεται βοηθός.",
        "Μήτσος": "Μήτσος (~25-27): Νέος στην εταιρεία με άριστα δείγματα. Εργατικός, αξιόπιστος, αυτόνομος — ολοκληρώνει σωστά, διπλοτσεκάρει, κρατά σημειώσεις. Εμπειρία μηχανικού αυτοκινήτων: δυνατός σε κινητήρες και μηχανολογικά. Ιδανική ανάθεση: μηχανολογικές/τεχνικές εργασίες κάθε δυσκολίας, εργασίες αυτονομίας και κρίσης, οργάνωση χώρων/εργαλείων/ανταλλακτικών. Προτεραιότητα ανάπτυξης: εργασίες που παραδοσιακά πάνε σε εξωτερικούς μηχανικούς — δοκιμάζει πρώτος πριν κληθεί εξωτερικός. Μπορεί να καθοδηγεί νεότερους/ξενόγλωσσους. Χαμηλή ανάγκη ελέγχου. Εργάζεται άνετα μόνος· σύμπραξη με Γιάννη επιτρεπτή ΜΟΝΟ ως ισότιμη (όχι σχέση επικεφαλής-βοηθού). Μελλοντικά: κεντρικό τεχνικό πρόσωπο βάσης.",
        "Γιάννης": "Γιάννης (~30+, 1+ έτος): Ευρεία τεχνική εμπειρία — χρήσιμος σε όλα τα τεχνικά: μηχανικά, ηλεκτρολογικά (ως έναν βαθμό, πρώτο σκαλί πριν Φανούρη/Αλέξανδρο), μηχανισμούς (bow thrusters, πλατφόρμες). Κανόνας: όταν υπάρχει τεχνική πίεση (αναχωρήσεις, σοβαρά ζητήματα) → προτεραιότητα σε τεχνικές εργασίες, οι καθαριότητες σε άλλους. Χχωρίς τεχνική πίεση → συμμετέχει κανονικά και ισότιμα σε καθαρισμούς/τακτοποιήσεις/αγγαρείες — καμία μόνιμη εξαίρεση. Προσοχή: αυτοαναφορές αναξιόπιστες («δεν υπάρχει δουλειά» ενώ υπάρχουν διαθέσιμες)· τακτικός ποιοτικός έλεγχος με έμφαση σε πληρότητα και επιστροφή εργαλείων στη θέση τους. Δεν καθοδηγεί/συντονίζει άλλους. Συμπράξεις: με Βασίλη (πρώτη επιλογή) ή Μήτσο (ισότιμα). Όχι με Martin ή Δανάη.",
        "Δανάη": "Δανάη (νέα): Απόφοιτος ΑΣΚΤ (γλυπτική) — υψηλή κατασκευαστική ικανότητα: ηλεκτροκόλληση, κοπές, κατασκευές, ξυλουργικά, φινιρίσματα. Δίπλωμα skipper, προοπτική προς θάλασσα. Αξιόπιστη, πρόθυμη, επικοινωνιακή — ως νέα χρειάζεται καθοδήγηση και σαφείς οδηγίες. Ιδανική ανάθεση: (α) κατασκευαστικές εργασίες ακριβείας· (β) αισθητική αναβάθμιση σκαφών — γυαλίσματα, βαψίματα, στοκαρίσματα, ανακαινίσεις (προτεραιότητα σε περιόδους χαμηλού φόρτου — στρατηγικός λόγος ένταξής της). Καλοκαίρι: κανονική κάλυψη αναγκών βάσης. Συμπράξεις: καλή συνεργασία με Φανούρη, Μήτσος, Βασίλη, Martin· όχι με Γιάννη. Με Martin: λογική επιλογή για εργασίες αισθητικής φύσεως. Μέλος σχήματος έκτακτης εσωτερικής προετοιμασίας (με Νικόλ/Martin).",
        "Martin": "Martin (new): English-speaking (Czech — app language EN). Artist (painting, preparing for Fine Arts Academy) with high practical skill and inventiveness — past experience with boats and engines; can solve complex problems incl. some electrical. Assign tasks normally and fully. Main areas: (a) routine boat preparation — washing, cleaning, oils, closings; (b) artistic/aesthetic work — varnish removal/application, polishing, finishing, restoration (natural interest, high performance); (c) clearly defined technical tasks. Performance condition: task description must be fully clear and specific (what, where, expected result) — vague tasks block him. Motivation factor: excels on tasks that interest him; performance drops on indifferent ones. Completeness: knows procedures perfectly but often forgets steps when alone — his completions need regular completeness checks. Especially suited: long-duration tasks with gradual progress (boat renewals, varnish projects — «Progress» logging over days). Pairings: pleasant cooperation with Danai (shared artistic background) — good choice for aesthetic work, not an exclusive duo. NEVER under Giannis' coordination. Avoid multi-person tasks with many voices. Member of urgent interior-prep team (with Nikol/Danai).",
        "Φανούρης": "Φανούρης (Base Manager): Υψηλή αντιληπτική ικανότητα, πλήρης εικόνα βάσης — υπόβαθρο εμβιομηχανικής/μηχανικής. Απόλυτη αξιοπιστία: ό,τι δηλώνει ολοκληρωμένο, είναι. Φυσικό πεδίο: εργασίες υψηλής λεπτομέρειας και τεχνικής σκέψης — μηχανισμοί, πόμολα/κλειδαριές/παράθυρα, σχεδιασμός & 3D εκτύπωση εξαρτημάτων. ΚΡΙΣΙΜΕΣ ΛΕΠΤΟΔΟΥΛΕΙΕΣ (όπου πρόχειρη εκτέλεση = ζημιά, π.χ. στεγανοποίηση/λάστιχα παραθύρων): μαρκάρονται απευθείας ως εργασία Φανούρη — ΔΕΝ κατανέμονται σε άλλους. Ηλεκτρολογικά: ισχυρή αντίληψη — κλιμάκωση: Γιάννης → Φανούρης → Αλέξανδρος → εξωτερικός. Ωράριο μη συγχρονισμένο (μπορεί μεσημέρι-νύχτα). Αναθέτει, δίνει οδηγίες, σημείο τηλεφωνικής αναφοράς.",
        "Νικόλ": "Νικόλ: Σταθεροί δικοί της τομείς — ΕΚΤΟΣ αυτόματης κατανομής, λειτουργεί με δικό της πρόγραμμα. Πεδία: (α) INVENTORY LIST σκαφών προ αναχώρησης — πλήρης έλεγχος εξοπλισμού (σωσίβια, γκάζι, εργαλεία, τρόμπες κ.λπ.) — στο checklist αναχώρησης προ-ανατίθεται αυτόματα σε αυτήν· (β) εσωτερικοί καθαρισμοί/προετοιμασία σκαφών (όχι εξωτερικά πλυσίματα) — Σάββατα μαζί με εξωτερικές καθαρίστριες· (γ) επίβλεψη γραφείου/αποθήκης ανταλλακτικών — δίαυλος τροφοδοσίας βάσης με υλικά. Έκτακτες άμεσες προετοιμασίες (π.χ. ημερήσια εκδρομή): πάντα βασικό άτομο εσωτερικής ετοιμασίας, με ενίσχυση Δανάη ή/και Martin. Χειροκίνητη ανάθεση: μόνο εντός των πεδίων της.",
        "Λεωνίδας": "Λεωνίδας (~19-20, γιος ιδιοκτήτη): Ικανός, ευφυής — προετοιμάζεται για μελλοντική διεύθυνση βάσης. Χωρίς ωράριο/πρόγραμμα — παρών, βοηθά, μαθαίνει. ΕΚΤΟΣ AI κατανομής και εργασιών ρουτίνας — δεν του γεμίζει κανείς τον χρόνο. Χειροκίνητη ανάθεση όταν προκύπτει: (α) προμήθειες/αγορές — πρώτο άτομο για εξωτερικές διαδρομές αγοράς υλικών/ανταλλακτικών· (β) διαδρομές γραφείου/μεταφορές· (γ) check-out σκαφών — συμμετέχει συχνά· (δ) σημειακή βοήθεια. Δεν λογίζεται στα στατιστικά φόρτου.",
        "Αφροδίτη": "Αφροδίτη (γραμματεία): Δεξί χέρι της επιχείρησης — οικονομικά, επίβλεψη, υψηλός λόγος. Αναθέτει εργασίες, δεν λαμβάνει. Πρόσβαση manager για εποπτεία και ανάθεση.",
        "Αλέξανδρος": "Αλέξανδρος (ιδιοκτήτης): Πλήρης γνώση όλων των εργασιών — καμία δουλειά δεν τον σταματά (π.χ. δεξαμενές λυμάτων). Ισχυρά ηλεκτρολογικά. Κυρίως γραφείο, παρών σε δύσκολα — βρίσκει λύσεις όπου κολλάνε οι υπάλληλοι. ΚΑΝΟΝΑΣ ΚΛΙΜΑΚΩΣΗΣ: πριν οποιονδήποτε εξωτερικό συνεργάτη, εξαντλείται η φάση Αλέξανδρου (ιδίως ηλεκτρολογικά). Χωρίς αυτόματες αναθέσεις — εμπλέκεται με πρωτοβουλία/συνεννόηση.",
        "Νίκος": "Νίκος (συνιδιοκτήτης): Εξειδίκευση: επισκευές πλαστικών/πολυεστέρα (και για τρίτους), πανιά (μούδες, επισκευές), κατασκευαστικές λεπτομέρειες. Έμπειρος καπετάνιος. Ρόλος: τεχνικός γνωμοδότης — δεν του ανατίθενται εργασίες· σε ζητήματα πολυεστέρα/πανιών/κατασκευών, οι αναθέσεις σε άλλους φέρουν οδηγία «συμβουλέψου τον κ. Νίκο για τον τρόπο». Τελικός λόγος σε κατασκευαστικά αδιέξοδα.",
      };

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
      
      // Αναβαθμισμένος έλεγχος φόρτωσης / μετεγκατάστασης για το αντικειμενοστρεφές Checklist
      if (!c || c.length === 0 || typeof c[0] === "string") { 
        c = SEED_CHECKLIST; 
        await save("app-checklist", c); 
      }

      const v5done = await load("app-fanouris-v5", false);
      if (!v5done) {
        u = u.map(x => x.name === "Φανούρης" ? { ...x, profile: PROFILES["Φανούρης"]
          .replace("ΔΕΝ λαμβάνει αυτόματες αναθέσεις — επιλέγει μόνος.", "Λαμβάνει αυτόματες αναθέσεις ΜΟΝΟ για εργασίες υψηλής προσοχής/υπευθυνότητας, και λίγες (1-2/ημέρα) — επιλέγει και μόνος του επιπλέον. Hatch/παράθυρα/πόρτες/λεπτοδουλειές: αυτόματα σε αυτόν.")
          .replace("Ωράριο μη συγχρονισμένο (μπορεί μεσημέρι-νύχτα) — η πρωινή κατανομή δεν τον προσμετρά.", "Ωράριο μη συγχρονισμένο (μπορεί μεσημέρι-νύχτα).") } : x);
        await save("app-users", u);
        await save("app-fanouris-v5", true);
      }

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

      const v9done = await load("app-roles-v9", false);
      if (!v9done) {
        u = u.map(x => (x.name || "").toLowerCase().replace(/ί/g, "ι").trim() === "αφροδιτη" ? { ...x, role: "manager" } : x);
        await save("app-users", u);
        await save("app-roles-v9", true);
      }

      const v4done = await load("app-nostats-v4", false);
      if (!v4done) {
        const NOSTATS = ["Νικόλ", "Λεωνίδας", "Αλέξανδρος", "Νίκος", "Αφροδίτη"];
        u = u.map(x => NOSTATS.includes(x.name) ? { ...x, noStats: true } : x);
        await save("app-users", u);
        await save("app-nostats-v4", true);
      }

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

      let changed = false;
      b = b.map(x => {
        if (x.atSea && x.returnDate && x.returnDate <= todayStr()) { changed = true; return { ...x, atSea: false, returnDate: null }; }
        if (!x.atSea && x.departureDate && x.departureDate <= todayStr() && x.returnDate) { changed = true; return { ...x, atSea: true, departureDate: null }; }
        return x;
      });
      if (changed) await save("app-boats", b);
      setUsers(u); setBoats(b); setTasks(t); setQuick(q); setChecklist(c);
      setReady(true);
    })();
  }, []);

  const persistTasks = async (next) => { setTasks(next); await save("app-tasks", next); };
  const persistBoats = async (next) => { setBoats(next); await save("app-boats", next); };
  const persistUsers = async (next) => { setUsers(next); await save("app-users", next); };
  const persistQuick = async (next) => { setQuick(next); await save("app-quicktasks", next); };
  const persistChecklist = async (next) => { setChecklist(next); await save("app-checklist", next); };

  // Νυχτερινή κατανομή AI: τρέχει στο πρώτο άνοιγμα κάθε νέας μέρας
  useEffect(() => {
    if (!ready || !me) return;
    (async () => {
      const meta = await load("app-meta", {});
      if (meta.lastDistribution === todayStr()) return;
      await save("app-meta", { ...meta, lastDistribution: todayStr() });
      await runDistribution(false);
    })();
  }, [ready, me]);

  async function runDistribution(manual) {
    const employees = users.filter(u => (u.role === "employee" && !u.noAutoAssign) || u.name === "Φανούρης");
    const free = tasks.filter(t => t.status === "open" && !t.assignedTo);
    if (!employees.length || !free.length) { if (manual) showToast("Δεν υπάρχουν ελεύθερες εργασίες για κατανομή"); return; }
    try {
      let rules = await load("app-dist-rules", [
        "Ο Γιάννης ΔΕΝ αναλαμβάνει ΠΟΤΕ εργασίες στο σκάφος Sunflower — μην του ανατεθεί καμία εργασία αυτού του σκάφους.",
        "Εργασίες του σκάφους Sunflower: ανατίθενται κατά προτεραιότητα στον Martin.",
      ]);
      const FAN_RULES = [
        "Ο Φανούρης ΛΑΜΒΑΝΕΙ αναθέσεις, αλλά ΜΟΝΟ εργασίες που απαιτούν υψηλή προσοχή, ακρίβεια και υπευθυνότητα — και ΛΙΓΕΣ (το πολύ 1-2 την ημέρα), γιατί επιλέγει και μόνος του επιπλέον.",
        "Εργασίες σχετικές με hatch, παράθυρα, πόρτες, πόμολα, κλειδαριές, στεγανοποιήσεις και γενικά λεπτοδουλειές: ανατίθενται ΑΥΤΟΜΑΤΑ στον Φανούρη.",
      ];
      for (const fr of FAN_RULES) {
        if (!rules.some(r => r.includes(fr.slice(0, 30)))) rules = [...rules, fr];
      }
      rules = rules.filter(r => !r.includes("πεδίο Φανούρη — δεν λαμβάνει αυτόματες αναθέσεις"));
      await save("app-dist-rules", rules);
      const boatName = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
      const loadPer = Object.fromEntries(employees.map(e => [e.id, tasks.filter(t => t.assignedTo === e.id && t.status === "open").length]));
      const prompt = `Είσαι σύστημα κατανομής εργασιών σε βάση σκαφών. Μοίρασε ΜΕΧΡΙ 3 εργασίες ανά υπάλληλο για σήμερα από τις ελεύθερες, με βάση προφίλ, είδος εργασίας και δίκαιο φόρτο. Δεν χρειάζεται να ανατεθούν όλες. ΑΠΑΡΑΒΑΤΟΙ ΕΙΔΙΚΟΙ ΚΑΝΟΝΕΣ:\n${rules.map(r => "- " + r).join("\n")}\n\nΥπάλληλοι: ${employees.map(e => `${e.id}: ${e.name} (τρέχων φόρτος: ${loadPer[e.id]}, προφίλ: ${e.profile || "χωρίς προφίλ"})`).join("; ")}\n\nΕλεύθερες εργασίες: ${free.map(t => `${t.id}: "${t.desc}" [σκάφος: ${boatName(t.boatId)}${t.urgent ? ", ΕΠΕΙΓΟΝ" : ""}]`).join("; ")}\n\nΑπάντησε ΜΟΝΟ με JSON, χωρίς markdown: {"assignments":[{"taskId":"...","userId":"..."}]}`;
      const raw = await askClaude(prompt, 800);
      const parsed = JSON.parse(raw.replace(/```json|```/gi, "").trim());
      if (parsed?.assignments?.length) {
        const next = tasks.map(t => {
          const match = parsed.assignments.find(a => a.taskId === t.id);
          return match ? { ...t, assignedTo: match.userId } : t;
        });
        await persistTasks(next);
        if (manual) showToast(`Η αυτόματη κατανομή ολοκληρώθηκε! Μοιράστηκαν ${parsed.assignments.length} εργασίες.`);
      } else {
        if (manual) showToast("Το AI δεν βρήκε κατάλληλες νέες αναθέσεις.");
      }
    } catch (e) {
      console.error(e);
      if (manual) showToast("Η κατανομή απέτυχε.");
    }
  }

  // --- Το υπόλοιπο UI και τα Tabs του App συνεχίζουν κανονικά εδώ ---
  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", background: COLORS.bg, minHeight: "100vh" }}>
      <h3>Base Management Application {APP_VERSION}</h3>
      {/* UI rendering elements */}
    </div>
  );
}

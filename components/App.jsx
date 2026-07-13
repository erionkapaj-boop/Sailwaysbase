"use client";
import React, { useState, useEffect, useRef } from "react";
import { storage as winStorage } from "../lib/storage";
import { supabase } from "../lib/supabaseClient";

// ---------- Σταθερές ----------
const APP_VERSION = "v3.34";
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
const daysUntil = (d) => { if (!d) return null; return Math.ceil((new Date(d) - localMidnight(todayStr())) / 86400000); };

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
        <div style={{ background: "#FDECEA", border: "1.5px solid #C0392B", borderRadius: 12, padding: 16, margin: "10px 0" }}>
          <div style={{ fontWeight: 700, color: "#8A1C12", marginBottom: 6 }}>⚠️ Πρόβλημα σε: {this.props.label || "άγνωστο σημείο"}</div>
          <div style={{ fontSize: 13, color: "#8A1C12", marginBottom: 10, whiteSpace: "pre-wrap" }}>{(this.state.error && this.state.error.message) || String(this.state.error)}</div>
          <div style={{ fontSize: 12, color: "#8A1C12", marginBottom: 10 }}>Τα υπόλοιπα κομμάτια της εφαρμογής δουλεύουν κανονικά. Το σφάλμα καταγράφηκε — θα το δούμε στο Admin → Σφάλματα.</div>
          <button onClick={() => this.setState({ error: null })} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#C0392B", color: "#fff", fontWeight: 700, fontSize: 13 }}>Δοκίμασε ξανά</button>
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
function AppInner() {
  const [ready, setReady] = useState(false);
  const [users, setUsers] = useState([]);
  const [boats, setBoats] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [quick, setQuick] = useState([]);
  const [checklist, setChecklist] = useState([]);
  const [closingChecklist, setClosingChecklist] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [notes, setNotes] = useState([]);
  const [boatNotes, setBoatNotes] = useState([]);
  const [aiMemories, setAiMemories] = useState([]);
  const [me, setMe] = useState(null);
  const [viewAs, setViewAs] = useState(null);
  const [tab, setTab] = useState("today");
  const [toast, setToast] = useState(null);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2500); };

  // Φόρτωση
  useEffect(() => {
    (async () => {
      let [u, b, t, q, c, cc, ab, nt, bn, am] = await Promise.all([
        load("app-users", null), load("app-boats", null), load("app-tasks", null),
        load("app-quicktasks", null), load("app-checklist", null), load("app-closingchecklist", null), load("app-absences", null), load("app-notes", null), load("app-boatnotes", null), load("app-aimemories", null),
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
      if (new Date().getDay() === 0) return; // Κυριακή — μη εργάσιμη, καμία κατανομή
      const meta = await load("app-meta", {});
      if (meta.lastDistribution === todayStr()) return;
      await save("app-meta", { ...meta, lastDistribution: todayStr() });
      const freshTasks = await runDistribution(false);
      await generateAutoTasks(freshTasks);
    })();
  }, [ready, me]);

  const isAbsentOn = (userId, dateStr) => absences.some(a => a.userId === userId && a.from <= dateStr && dateStr <= a.to);

  const generateClosingChecks = async (tasksOverride) => {
    const src = tasksOverride || tasks;
    const today = todayStr();
    const inPort = boats.filter(b => !b.atSea);
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
    await persistTasks([...newTasks, ...src]);
  };

  // Ελέγχοι κλεισίματος: εμφανίζονται αυτόματα μετά τις 15:30, μία φορά τη μέρα, στο πρώτο άνοιγμα της εφαρμογής μετά την ώρα αυτή
  useEffect(() => {
    if (!ready || !me) return;
    (async () => {
      const now = new Date();
      if (now.getHours() < 15 || (now.getHours() === 15 && now.getMinutes() < 30)) return;
      const meta = await load("app-meta", {});
      if (meta.lastClosingCheck === todayStr()) return;
      await save("app-meta", { ...meta, lastClosingCheck: todayStr() });
      await generateClosingChecks();
    })();
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
      const prompt = `Είσαι σύστημα κατανομής εργασιών σε βάση σκαφών. Μοίρασε ΜΕΧΡΙ 3 εργασίες ανά υπάλληλο για σήμερα από τις ελεύθερες, με βάση προφίλ, είδος εργασίας και δίκαιο φόρτο. Δεν χρειάζεται να ανατεθούν όλες.
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
      const next = tasks.map(t => {
        const a = valid.find(v => v.taskId === t.id);
        return a ? { ...t, assignedTo: a.userId, assignedBy: "AI" } : t;
      });
      await persistTasks(next);
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
    if (dow === 0 || dow === 6) return; // Κυριακή μη εργάσιμη· Σάββατο προτεραιότητα κλείσιμο υπαρχουσών, όχι νέες άσχετες
    const employees = users.filter(u => u.role === "employee" && !u.noAutoAssign && !isAbsentOn(u.id, today));
    if (!employees.length) return;
    // Ρυθμός ουράς: αν υπάρχουν ήδη αρκετές ελεύθερες εργασίες σε αναμονή, μην προσθέσεις άλλες.
    const freeNow = src.filter(t => t.status === "open" && !t.assignedTo).length;
    const doneLast7d = src.filter(t => t.status === "done" && t.completedAt && (Date.now() - new Date(t.completedAt).getTime()) <= 7 * 24 * 60 * 60 * 1000).length;
    const avgDailyPace = Math.max(1, Math.round(doneLast7d / 7));
    if (freeNow >= avgDailyPace * 2) return; // η ουρά είναι ήδη αρκετά γεμάτη σε σχέση με τον ρυθμό ολοκλήρωσης
    // Ποιοι έχουν χαμηλό φόρτο σήμερα (0-1 ανοιχτές αναθέσεις);
    const loadPer = Object.fromEntries(employees.map(e => [e.id, src.filter(t => t.assignedTo === e.id && t.status === "open").length]));
    const lowLoad = employees.filter(e => loadPer[e.id] <= 1);
    if (!lowLoad.length) return;
    // Έλεγχος υποχρεωτικού βαν τουλάχιστον 1x/εβδομάδα
    const vanLast7d = src.some(t => t.autoType === "van" && t.createdAt && (Date.now() - new Date(t.createdAt).getTime()) <= 7 * 24 * 60 * 60 * 1000);
    // Πρώτα εξάντλησε εργασίες σε αναμονή (backlog) πριν επινοήσεις νέες — αυτές είχαν ήδη οριστεί από τον χρήστη για «όταν υπάρχει κενό».
    const backlog = src.filter(t => t.status === "backlog");
    const eligibleBacklog = backlog.filter(t => !t.scheduledFor || t.scheduledFor <= today);
    if (eligibleBacklog.length) {
      const toConvert = eligibleBacklog.slice(0, Math.min(lowLoad.length, 3));
      const converted = toConvert.map((t, i) => {
        const preferred = t.preferredAssignee && lowLoad.some(e => e.id === t.preferredAssignee) ? t.preferredAssignee : lowLoad[i % lowLoad.length].id;
        return { ...t, status: "open", assignedTo: preferred, assignedBy: "AI-backlog", convertedAt: new Date().toISOString() };
      });
      const rest = src.filter(t => !toConvert.some(c => c.id === t.id));
      await persistTasks([...converted, ...rest]);
      return;
    }
    try {
      const inPort = boats.filter(b => !b.atSea);
      // Πρόσφατο ιστορικό ανά σκάφος για να αποφευχθεί επανάληψη ίδιου σημείου
      const recentByBoat = Object.fromEntries(inPort.map(b => [b.id,
        src.filter(t => t.boatId === b.id && t.completedAt && (Date.now() - new Date(t.completedAt).getTime()) <= 21 * 24 * 60 * 60 * 1000)
          .map(t => t.desc).slice(0, 8)
      ]));
      const prompt = `Είσαι σύστημα δημιουργίας εργασιών χαμηλού φόρτου για βάση σκαφών. ΣΗΜΕΡΑ υπάρχουν λίγες ελεύθερες εργασίες σε αναμονή, οπότε δημιούργησε 1-${Math.min(lowLoad.length, 3)} ΝΕΕΣ, ΣΤΟΧΟΠΟΙΗΜΕΝΕΣ εργασίες, μία ανά υπάλληλο με χαμηλό φόρτο.
ΚΑΝΟΝΕΣ:
- Διάλεξε ΜΟΝΟ από τους παρακάτω εγκεκριμένους τύπους — ΜΗΝ επινοήσεις άλλο είδος εργασίας.
- Κάθε εργασία πρέπει να αναφέρει ΣΥΓΚΕΚΡΙΜΕΝΟ σκάφος (από τη λίστα «σκάφη στο λιμάνι») και ΣΥΓΚΕΚΡΙΜΕΝΟ σημείο/αντικείμενο, όχι γενικόλογη περιγραφή.
- Δες το πρόσφατο ιστορικό ανά σκάφος και ΑΠΕΦΥΓΕ να ξαναστείλεις κάποιον στο ίδιο ακριβώς σημείο που καθαρίστηκε πρόσφατα — προτίμησε άλλο τμήμα του σκάφους (πλώρη/σαλόνι/πίσω καμπίνες/εξωτερικός χώρος, εναλλάξ).
- Ανάφερε ρητά ελάχιστο χρόνο ενασχόλησης όπου αναγράφεται (π.χ. "τουλάχιστον 1 ώρα — όχι πρόχειρα"), ΟΧΙ σαν deadline.
- ${vanLast7d ? "Η τακτοποίηση βαν έχει ήδη γίνει αυτή την εβδομάδα — μην την ξαναβάλεις εκτός αν κρίνεις ότι όντως χρειάζεται." : "Η τακτοποίηση βαν ΔΕΝ έχει γίνει αυτή την εβδομάδα ακόμα — αν έχεις διαθέσιμο άτομο, δώσε ΠΡΟΤΕΡΑΙΟΤΗΤΑ σε αυτήν."}
- Αν εντοπίζεις μοτίβο επαναλαμβανόμενου προβλήματος σε κάποιο σκάφος μέσα στο ιστορικό, προτίμησε προληπτικό έλεγχο εκεί.
Υπάλληλοι με χαμηλό φόρτο: ${lowLoad.map(e => `${e.id}: ${e.name}`).join("; ")}
Σκάφη στο λιμάνι: ${inPort.map(b => `${b.id}: ${b.name}`).join("; ")}
Πρόσφατο ιστορικό ανά σκάφος (τελευταίες 3 εβδ.): ${JSON.stringify(recentByBoat)}
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
      await persistTasks([...newTasks, ...src]);
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
    setMe(null);
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
  const activeBoats = boats.filter(b => !b.atSea);

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
    setTab("tasks");
  };
  const addTasks = async (base, descs) => {
    const now = Date.now();
    const leo = (base.purchase && !base.backlog) ? findLeonidas() : null;
    const fresh = descs.map((d, i) => ({
      id: "t" + now + "-" + i, status: base.backlog ? "backlog" : "open", createdBy: acting.id, createdAt: new Date(now + i).toISOString(),
      progress: [], returns: 0, assignedTo: base.backlog ? null : (leo ? leo.id : (base.assignedTo || null)), boatId: base.boatId || null, desc: d, urgent: !!base.urgent, purchase: !!base.purchase,
      ...(leo ? { assignedBy: "auto-purchase" } : {}),
    }));
    await persistTasks([...fresh, ...tasks]);
    showToast(base.backlog ? `Μπήκε σε αναμονή: ${fresh.length} εργασία/ίες` : `Καταχωρήθηκαν ${fresh.length} εργασίες`);
    setTab("tasks");
  };
  const findLeonidas = () => users.find(x => ["λεωνιδας", "leonidas"].includes((x.name || "").toLowerCase().replace(/ί/g, "ι").trim()));
  const addTask = async (task, photoFiles) => {
    const leo = task.purchase ? findLeonidas() : null;
    const id = "t" + Date.now();
    const t = {
      id, status: "open", createdBy: acting.id, createdAt: new Date().toISOString(),
      progress: [], returns: 0, assignedTo: null, photos: [], ...task, ...(leo ? { assignedTo: leo.id, assignedBy: "auto-purchase" } : {}),
    };
    await persistTasks([t, ...tasks]);
    showToast("Η εργασία καταχωρήθηκε");
    setTab("tasks");
    if (photoFiles?.length) {
      const urls = await uploadTaskPhotos(photoFiles, id);
      if (urls.length) setTasks(cur => { const nx = cur.map(x => x.id === id ? { ...x, photos: [...(x.photos || []), ...urls] } : x); save("app-tasks", nx); return nx; });
    }
  };
  const logFinding = async (findTask, desc) => {
    if (!desc?.trim()) return;
    const newId = "t" + Date.now() + "-f";
    const newTask = {
      id: newId, status: "open", createdBy: acting.id, createdAt: new Date().toISOString(),
      progress: [], returns: 0, assignedTo: null, photos: [], boatId: findTask.boatId, desc: desc.trim(), foundVia: findTask.id,
    };
    const findings = [...(findTask.findings || []), { taskId: newId, desc: desc.trim(), at: new Date().toISOString() }];
    await persistTasks([newTask, ...tasks.map(x => x.id === findTask.id ? { ...x, findings } : x)]);
    showToast(`Καταχωρήθηκε (${findings.length}/${findTask.findMin || 3})`);
  };
  const classifyServiceRelevance = async (t) => {
    try {
      const prompt = `Είσαι βοηθός βάσης σκαφών. Μια εργασία μόλις ολοκληρώθηκε σε σκάφος. Απόφασισε αν αξίζει μόνιμη καταγραφή στο ιστορικό συντήρησης του σκάφους (service book) — δηλαδή αν αφορά μηχανή/κινητήρα, ηλεκτρικά/ηλεκτρονικά, εξοπλισμό που άλλαξε/μπήκε/αφαιρέθηκε, ανταλλακτικό, ή τεχνική επισκευή με μελλοντική αξία (π.χ. "άλλαξε impeller", "μπήκε καινούργια μπαταρία", "επισκευή ψυγείου").
ΔΕΝ αξίζει καταγραφή αν είναι ρουτίνα καθαριότητας, τακτοποίησης, προετοιμασίας αναχώρησης/άφιξης, ή κάτι ασήμαντο χωρίς μελλοντική αξία (π.χ. "πλύθηκε το σκάφος", "τακτοποιήθηκαν τα σχοινιά").
ΕΡΓΑΣΙΑ: "${t.desc}"
Απάντησε ΜΟΝΟ με "yes" ή "no", τίποτα άλλο.`;
      const raw = await askClaude(prompt, 10);
      patchTask(t.id, { serviceRelevant: /yes/i.test(raw) });
    } catch { /* ταξινόμηση απέτυχε — η εργασία απλά δεν εμφανίζεται στο βιβλίο service, δεν χάνεται τίποτα */ }
  };
  const completeTask = async (t, attributedTo, afterPhotoFiles, confidence) => {
    const finalBy = attributedTo || acting.id;
    let afterUrls = [];
    if (afterPhotoFiles?.length) {
      try { afterUrls = await uploadTaskPhotos(afterPhotoFiles, t.id); } catch {}
    }
    await persistTasks(tasks.map(x => x.id === t.id ? {
      ...x, status: "done", completedBy: finalBy, completedByActor: acting.id, completedAt: new Date().toISOString(),
      ...(confidence ? { completionConfidence: confidence } : {}),
      ...(afterUrls.length ? { photosAfter: [...(x.photosAfter || []), ...afterUrls] } : {}),
    } : x));
    showToast("Ολοκληρώθηκε ✔");
    classifyServiceRelevance(t);
    // Η επιλογή «τέλεια / με επιφυλάξεις» τροφοδοτεί αυτόματα το ίδιο χρονολόγιο παρατηρήσεων που βλέπει το AI
    // στο προφίλ του σκάφους — χωρίς να χρειάζεται κανείς να το ξαναγράψει χειροκίνητα.
    if (confidence && t.boatId) {
      const text = confidence === "good"
        ? `🟢 "${t.desc}" — ολοκληρώθηκε, δούλευε τέλεια κατά τον έλεγχο`
        : `🟡 "${t.desc}" — ολοκληρώθηκε, αλλά με επιφυλάξεις για την ποιότητα/διάρκεια`;
      addBoatNote(t.boatId, text);
    }
  };
  const addBeforePhotos = async (t, files) => {
    if (!files?.length) return;
    const urls = await uploadTaskPhotos(files, t.id);
    if (urls.length) await persistTasks(tasks.map(x => x.id === t.id ? { ...x, photosBefore: [...(x.photosBefore || []), ...urls] } : x));
  };
  const externalTask = async (t, note) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, status: "external", externalBy: acting.id, externalAt: new Date().toISOString(), externalNote: note } : x));
    showToast("Καταγράφηκε: χρειάζεται εξωτερικό συνεργάτη ⚠");
  };
  const acknowledgeExternal = async (t) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, ackBy: { ...(x.ackBy || {}), [acting.id]: new Date().toISOString() } } : x));
  };
  const addProgress = async (t, note) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, progress: [...x.progress, { by: acting.id, at: new Date().toISOString(), note }] } : x));
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
    classifyServiceRelevance({ ...t, desc: t.desc + (note ? " — " + note : "") });
  };
  const toggleServiceRelevant = (t) => patchTask(t.id, { serviceRelevant: !t.serviceRelevant });
  const toggleUrgent = async (t) => {
    const next = !t.urgent;
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, urgent: next, ...(next ? { upgradedBy: acting.id } : { downgradedBy: acting.id }) } : x));
    showToast(next ? "Μαρκαρίστηκε ως επείγον 🔴" : "Υποβαθμίστηκε σε κανονική");
  };
  const deleteTask = async (t) => {
    await persistTasks(tasks.filter(x => x.id !== t.id));
    showToast("Η εργασία διαγράφηκε");
  };
  const editTask = async (t, desc) => {
    await persistTasks(tasks.map(x => x.id === t.id ? { ...x, desc, editedBy: acting.id, editedAt: new Date().toISOString() } : x));
    showToast("Η εργασία διορθώθηκε");
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
    const iso = new Date(base + minutes * 60000).toISOString();
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
      patch.manualDeadline = new Date(base + Number(minutes) * 60000).toISOString();
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

  const sendNote = async (recipientIds, text) => {
    const n = { id: "n" + Date.now(), from: acting.id, to: recipientIds, text, at: new Date().toISOString() };
    await persistNotes([n, ...notes]);
    showToast("Το μήνυμα στάλθηκε");
  };
  const deleteNote = async (id) => {
    await persistNotes(notes.filter(n => n.id !== id));
    showToast("Το μήνυμα διαγράφηκε");
  };
  const persistBoatNotes = async (next) => { setBoatNotes(next); await save("app-boatnotes", next); };
  const addBoatNote = async (boatId, text) => {
    const n = { id: "bn" + Date.now(), boatId, text, by: acting.id, at: new Date().toISOString() };
    await persistBoatNotes([n, ...boatNotes]);
    showToast("Η παρατήρηση καταχωρήθηκε");
  };
  const deleteBoatNote = async (id) => {
    await persistBoatNotes(boatNotes.filter(n => n.id !== id));
    showToast("Η παρατήρηση διαγράφηκε");
  };
  const persistAiMemories = async (next) => { setAiMemories(next); await save("app-aimemories", next); };
  const addAiMemory = async (text) => {
    const m = { id: "am" + Date.now(), text, at: new Date().toISOString(), by: acting.id };
    await persistAiMemories([m, ...aiMemories]);
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
    return b?.departureDate || null;
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

  const tabs = [
    { id: "today", label: tr("Σήμερα"), icon: "☀" },
    { id: "tasks", label: tr("Εργασίες"), icon: "☰" },
    { id: "new", label: tr("Νέα"), icon: "+" },
    { id: "service", label: "Service", icon: "📖" },
    ...(isMgr ? [{ id: "admin", label: "Διοίκηση", icon: "⚙" }] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "system-ui, -apple-system, sans-serif", paddingBottom: 76 }}>
      <Header me={acting} onLogout={logout} />
      {viewAs && (
        <div style={{ background: COLORS.amber, color: "#3A2600", padding: "9px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, fontWeight: 700 }}>
          👁 Προβολή ως: {viewAs.name}
          <button onClick={() => { setViewAs(null); setTab("admin"); }} style={{ border: "1.5px solid #3A2600", background: "transparent", color: "#3A2600", borderRadius: 8, padding: "5px 10px", fontWeight: 700 }}>Επιστροφή σε {me.name}</button>
        </div>
      )}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "12px 14px" }}>
        {tab === "today" && <ErrorBoundary label="Σήμερα"><TodayView me={acting} tasks={myTasks} allTasks={tasks} boats={boats} users={users} isMgr={isMgr} canAssign={canAssign}
          effectiveDeadline={effectiveDeadline} onComplete={completeTask} onProgress={addProgress} onExternal={externalTask} onEdit={editTask} onDelete={deleteTask} onChecklistItem={resolveChecklistItem} onSetDeadline={setTaskDeadline} onSetDeadlineDuration={setTaskDeadlineByDuration} onAddBeforePhotos={addBeforePhotos} onLogFinding={logFinding}
          onAssign={assignTask} onAssignWithDeadline={assignTaskWithDeadline} onDowngrade={toggleUrgent}
          absences={absences} onAddAbsence={addAbsence} onDeleteAbsence={deleteAbsence} notes={notes} onSendNote={sendNote} onDeleteNote={deleteNote} onAckExternal={acknowledgeExternal} onCloseExternal={closeExternal} /></ErrorBoundary>}
        {tab === "tasks" && <ErrorBoundary label="Εργασίες"><TasksView tasks={freeTasks} boats={boats} users={users} isMgr={isMgr} me={acting}
          effectiveDeadline={effectiveDeadline} onComplete={completeTask} onProgress={addProgress} onExternal={externalTask}
          onAssign={assignTask} onAssignWithDeadline={assignTaskWithDeadline} onDowngrade={toggleUrgent} onEdit={editTask} onDelete={deleteTask} canAssign={canAssign} onChecklistItem={resolveChecklistItem} onSetDeadline={setTaskDeadline} onSetDeadlineDuration={setTaskDeadlineByDuration} onAddBeforePhotos={addBeforePhotos} onLogFinding={logFinding} /></ErrorBoundary>}
        {tab === "new" && <ErrorBoundary label="Νέα εργασία"><NewTask boats={activeBoats} quick={quick} users={users} isMgr={isMgr} onAdd={addTask} onAddMany={addTasks} onAddParsed={addParsed} /></ErrorBoundary>}
        {tab === "service" && <ErrorBoundary label="Service Book"><ServiceBook boats={boats} tasks={tasks} users={users} isMgr={isMgr} onDelete={deleteTask} onToggleService={toggleServiceRelevant} /></ErrorBoundary>}
        {tab === "admin" && isMgr && <ErrorBoundary label="Admin"><AdminView me={acting} users={users} boats={boats} tasks={tasks} quick={quick} checklist={checklist} closingChecklist={closingChecklist} boatNotes={boatNotes} onAddBoatNote={addBoatNote} onDeleteBoatNote={deleteBoatNote} aiMemories={aiMemories} onAddMemory={addAiMemory} onDeleteMemory={deleteAiMemory} onAddScheduled={addScheduledBacklogTask} absences={absences}
          persistUsers={persistUsers} persistBoats={persistBoats} persistQuick={persistQuick} persistChecklist={persistChecklist} persistClosingChecklist={persistClosingChecklist}
          setDeparture={setDeparture} cancelCharter={cancelCharter} onReturn={returnTask} onCloseExternal={closeExternal} onDowngrade={toggleUrgent} onRate={rateTask}
          onAssign={assignTask} runDistribution={() => runDistribution(true).then(fresh => generateAutoTasks(fresh))} generateClosingChecks={generateClosingChecks} effectiveDeadline={effectiveDeadline}
          persistTasks={persistTasks} tasksRaw={tasks} showToast={showToast} onViewAs={isMgr ? (u) => { setViewAs(u); setTab("today"); } : null} realOwner={me.role === "owner"} onDelete={deleteTask}
          onAddAbsence={addAbsence} onDeleteAbsence={deleteAbsence} /></ErrorBoundary>}
      </div>
      <TabBar tabs={tabs} tab={tab} setTab={setTab} />
      {toast && <div style={{ position: "fixed", bottom: 86, left: "50%", transform: "translateX(-50%)", background: COLORS.navy, color: "#fff", padding: "10px 18px", borderRadius: 24, fontSize: 14, zIndex: 50, maxWidth: "90%" }}>{toast}</div>}
    </div>
  );
}

// ---------- Κοινά UI ----------
const Center = ({ children }) => <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.bg }}>{children}</div>;

function Header({ me, onLogout }) {
  const roleLabel = me.role === "owner" ? "Διαχειριστής" : me.role === "manager" ? "Base Manager" : me.role === "associate" ? "Στέλεχος" : tr("Συνεργείο βάσης");
  return (
    <div style={{ background: COLORS.navy, color: "#fff", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 800, letterSpacing: 0.5, fontSize: 17 }}>SAILWAYS <span style={{ fontWeight: 300 }}>| Βάση Αλίμου</span></div>
        <div style={{ fontSize: 12, opacity: 0.75 }}>{me.name} · {roleLabel}</div>
      </div>
      <button onClick={onLogout} style={{ background: "transparent", border: "1px solid rgba(255,255,255,.35)", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13 }}>{tr("Έξοδος")}</button>
    </div>
  );
}

function TabBar({ tabs, tab, setTab }) {
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: COLORS.card, borderTop: `1px solid ${COLORS.line}`, display: "flex", zIndex: 40 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex: 1, padding: "10px 4px 12px", background: "none", border: "none",
          color: tab === t.id ? COLORS.teal : COLORS.sub, fontWeight: tab === t.id ? 700 : 500, fontSize: 12,
        }}>
          <div style={{ fontSize: 19, marginBottom: 2 }}>{t.icon}</div>{t.label}
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
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.navy, letterSpacing: 1 }}>SAILWAYS</div>
          <div style={{ color: COLORS.sub, marginTop: 4 }}>Βάση Μαρίνας Αλίμου <span style={{ fontSize: 11, opacity: .6 }}>· {APP_VERSION}</span></div>
        </div>
        <div style={{ background: COLORS.card, borderRadius: 14, padding: 20 }}>
          <label style={lbl}>Προσωπικός κωδικός / Personal code</label>
          <input value={code} onChange={e => { setCode(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && tryLogin()}
            placeholder="π.χ. VAS-4821" autoCapitalize="characters"
            style={{ ...inputStyle, fontSize: 17, textAlign: "center", letterSpacing: 1.5 }} />
          {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 14 }}>
            <button onClick={tryLogin} style={{ width: "100%", padding: 13, borderRadius: 10, border: "none", background: COLORS.navy, color: "#fff", fontSize: 15.5, fontWeight: 700 }}>Είσοδος / Sign in</button>
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
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12.5, color: canComplete ? COLORS.green : COLORS.sub, fontWeight: 700, marginBottom: 8 }}>
        {findings.length}/{min} {tr("εντοπισμένα")} {canComplete ? "✔" : ""}
      </div>
      {findings.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {findings.map((f, i) => (
            <div key={i} style={{ fontSize: 13.5, padding: "5px 0", borderBottom: i < findings.length - 1 ? `1px dashed ${COLORS.line}` : "none" }}>
              {i + 1}. {f.desc}
            </div>
          ))}
        </div>
      )}
      <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder={tr("Τι εντόπισες; π.χ. Το πόμολο της ντουλάπας στην πλώρη είναι χαλαρό")} style={inputStyle} />
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <Btn small color={COLORS.teal} onClick={() => { if (!text.trim()) return; onLogFinding(t, text.trim()); setText(""); }}>{tr("Προσθήκη εύρεσης")}</Btn>
        {canComplete && (
          <Btn small color={COLORS.green} onClick={() => { if (isMgr) { setCompleteAsId(t.assignedTo || me.id); setMode("completeAs"); } else { onComplete(t); } }}>{tr("Ολοκληρώθηκε ✔")}</Btn>
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
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12.5, color: COLORS.sub, fontWeight: 700, marginBottom: 6 }}>{doneCount}/{items.length} ελέγχθηκαν</div>
      {items.map(it => (
        <div key={it.id} style={{ borderBottom: `1px dashed ${COLORS.line}`, padding: "8px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>
              {it.status === "ok" && "✔ "}{it.status === "problem" && "⚠ "}{it.text}
            </div>
            {it.status === "pending"
              ? <div style={{ display: "flex", gap: 6 }}>
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
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
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

function TaskCard({ t, boats, users, isMgr, me, deadline, onComplete, onProgress, onExternal, onAssign, onAssignWithDeadline, onDowngrade, onEdit, onDelete, canAssign, showAssignee, onChecklistItem, onSetDeadline, onSetDeadlineDuration, onAddBeforePhotos, onLogFinding }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null); // 'progress' | 'external' | 'assign' | 'completeAs'
  const [note, setNote] = useState("");
  const [completeAsId, setCompleteAsId] = useState(null);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [assignMinutes, setAssignMinutes] = useState("");
  const [customMins, setCustomMins] = useState("");
  const [confidence, setConfidence] = useState(null);
  const afterFileRef = useRef(null);
  const boat = boats.find(b => b.id === t.boatId);
  const dl = deadline(t);
  const du = daysUntil(dl);
  const spine = t.urgent ? COLORS.red : (dl && du !== null && du <= 7 ? COLORS.amber : COLORS.line);
  const assignee = users.find(u => u.id === t.assignedTo);
  const employees = users.filter(u => u.role === "employee" && !u.noStats);
  const startComplete = (conf) => {
    setConfidence(conf);
    if (isMgr) { setCompleteAsId(t.assignedTo || me.id); setMode("completeAs"); }
    else if (t.intensive) { setMode("completeSimple"); }
    else { onComplete(t, undefined, undefined, conf); }
  };

  return (
    <div style={{ background: COLORS.card, borderRadius: 12, marginBottom: 10, borderLeft: `5px solid ${spine}`, boxShadow: "0 1px 2px rgba(10,30,50,.06)" }}>
      <div onClick={() => setOpen(!open)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.35 }}>{t.desc}</div>
          <div style={{ fontSize: 18 }}>{open ? "▾" : "▸"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6, fontSize: 12.5, color: COLORS.sub, alignItems: "center" }}>
          <span style={{ background: COLORS.bg, padding: "2px 8px", borderRadius: 6, fontWeight: 600, color: COLORS.navy }}>{boat ? boat.name : tr("Βάση / Άλλο")}</span>
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
        <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${COLORS.line}` }}>
          {t.returnNote && t.status === "open" && (
            <div style={{ background: "#FDECEA", color: "#8A1C12", padding: "8px 10px", borderRadius: 8, fontSize: 13, margin: "10px 0" }}>
              <b>{tr("Σημείωση manager:")}</b> {t.returnNote}
            </div>
          )}
          {t.photos?.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              {(t.photos || []).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}` }} />
                </a>
              ))}
            </div>
          )}
          {(t.photosBefore?.length > 0 || t.photosAfter?.length > 0) && (
            <div style={{ margin: "10px 0" }}>
              {t.photosBefore?.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 11.5, color: COLORS.sub, marginBottom: 4 }}>{tr("Πριν")}</div>
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
                  <div style={{ fontSize: 11.5, color: COLORS.sub, marginBottom: 4 }}>{tr("Μετά")}</div>
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
            <div style={{ color: COLORS.amber, fontSize: 12.5, fontWeight: 600, margin: "10px 0" }}>⚠ {tr("Χωρίς φωτογραφία αποτελέσματος")}</div>
          )}
          {t.progress?.length > 0 && (
            <div style={{ margin: "10px 0", fontSize: 13 }}>
              {(t.progress || []).map((p, i) => (
                <div key={i} style={{ padding: "5px 0", borderBottom: i < (t.progress || []).length - 1 ? `1px dashed ${COLORS.line}` : "none", color: COLORS.sub }}>
                  ✏ {fmtDate(p.at)}: {p.note}{isMgr ? ` — ${users.find(u => u.id === p.by)?.name || ""}` : ""}
                </div>
              ))}
            </div>
          )}
          {Array.isArray(t.reminderList) && t.reminderList.length > 0 && (
            <div style={{ margin: "10px 0", fontSize: 13, background: COLORS.bg, borderRadius: 8, padding: "8px 12px" }}>
              <div style={{ fontWeight: 700, color: COLORS.sub, marginBottom: 4 }}>{tr("Έλεγξε:")}</div>
              {t.reminderList.map((item, i) => <div key={i} style={{ color: COLORS.sub, padding: "2px 0" }}>• {item}</div>)}
            </div>
          )}
          {Array.isArray(t.checklistItems) && (
            <ChecklistItems t={t} onChecklistItem={onChecklistItem} />
          )}
          {t.findMode && (
            <FindingsFlow t={t} onLogFinding={onLogFinding} onComplete={onComplete} isMgr={isMgr} me={me} setCompleteAsId={setCompleteAsId} setMode={setMode} employees={employees} completeAsId={completeAsId} />
          )}
          {mode === null && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {!Array.isArray(t.checklistItems) && !t.findMode && (
                t.boatId ? (
                  <>
                    <Btn color={COLORS.green} onClick={() => startComplete("good")}>🟢 {tr("Τέλεια ολοκλήρωση")}</Btn>
                    <Btn color={COLORS.amber} outline onClick={() => startComplete("reservations")}>🟡 {tr("Με επιφυλάξεις")}</Btn>
                  </>
                ) : (
                  <Btn color={COLORS.green} onClick={() => startComplete(null)}>{tr("Ολοκληρώθηκε ✔")}</Btn>
                )
              )}
              <Btn color={COLORS.teal} outline onClick={() => { setMode("progress"); setNote(""); }}>{tr("➕ Πρόοδος")}</Btn>
              {t.intensive && !(t.photosBefore?.length) && <Btn color={COLORS.teal} outline onClick={() => setMode("beforePhoto")}>📷 {tr("Φωτογραφία πριν")}</Btn>}
              <Btn color={COLORS.amber} outline onClick={() => { setMode("external"); setNote(""); }}>{tr("Χρειάζεται ειδικός ⚠")}</Btn>
              {(isMgr || t.createdBy === me?.id || t.assignedTo === me?.id) && <Btn color={COLORS.sub} outline onClick={() => { setMode("edit"); setNote(t.desc); }}>✎ {tr("Διόρθωση")}</Btn>}
              {isMgr && <Btn color={COLORS.amber} outline onClick={() => setMode("deadline")}>⏱ {tr("Deadline")}</Btn>}
              {(isMgr || t.createdBy === me?.id || t.assignedTo === me?.id) && <Btn color={COLORS.red} outline onClick={() => setMode("confirmDel")}>🗑 {tr("Διαγραφή")}</Btn>}
              {(isMgr || canAssign) && <Btn color={COLORS.navy} outline onClick={() => setMode("assign")}>Ανάθεση →</Btn>}
              {!t.urgent && <Btn color={COLORS.red} outline onClick={() => onDowngrade(t)}>🔴 {tr("Μαρκάρισμα ως επείγον")}</Btn>}
              {isMgr && t.urgent && <Btn color={COLORS.red} outline onClick={() => onDowngrade(t)}>Υποβάθμιση επείγοντος</Btn>}
            </div>
          )}
          {mode === "confirmDel" && (
            <div style={{ marginTop: 10, background: "#FDECEA", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#8A1C12", marginBottom: 8 }}>{tr("Διαγραφή εργασίας; Δεν αναιρείται.")}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small color={COLORS.red} onClick={() => onDelete(t)}>{tr("Ναι, διαγραφή")}</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "edit" && (
            <div style={{ marginTop: 10 }}>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn color={COLORS.teal} onClick={() => { if (!note.trim()) return; onEdit(t, note.trim()); setMode(null); }}>{tr("Καταχώρηση")}</Btn>
                <Btn color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "deadline" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 8 }}>{tr("Ορισμός προθεσμίας:")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[["30′", 30], ["1ω", 60], ["2ω", 120], ["3ω", 180], ["4ω", 240]].map(([label, mins]) => (
                  <Btn key={mins} small color={COLORS.amber} outline onClick={() => { onSetDeadlineDuration(t, mins); setMode(null); }}>{label}</Btn>
                ))}
                <Btn small color={COLORS.amber} outline onClick={() => { const d = new Date(); d.setHours(18, 0, 0, 0); onSetDeadline(t, d.toISOString()); setMode(null); }}>{tr("Τέλος ημέρας")}</Btn>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <input type="number" min="1" placeholder={tr("Custom (λεπτά)")} value={customMins} onChange={e => setCustomMins(e.target.value)} style={{ ...inputStyle, width: 130 }} />
                <Btn small color={COLORS.amber} outline onClick={() => { if (customMins) { onSetDeadlineDuration(t, Number(customMins)); setMode(null); setCustomMins(""); } }}>{tr("Ορισμός")}</Btn>
              </div>
              {t.manualDeadline && (
                <div style={{ marginTop: 10 }}>
                  <Btn small color={COLORS.red} outline onClick={() => { onSetDeadline(t, null); setMode(null); }}>{tr("Αφαίρεση προθεσμίας")}</Btn>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <Btn small color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "beforePhoto" && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, color: COLORS.sub, marginBottom: 6 }}>{tr("Φωτογραφία πριν ξεκινήσεις:")}</div>
              <input ref={afterFileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }}
                onChange={async e => { const files = Array.from(e.target.files || []); if (files.length) { await onAddBeforePhotos(t, files); } setMode(null); }} />
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small color={COLORS.teal} onClick={() => afterFileRef.current?.click()}>📷 {tr("Επιλογή φωτογραφίας")}</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {(mode === "progress" || mode === "external") && (
            <div style={{ marginTop: 10 }}>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder={mode === "progress" ? tr("Τι έκανες; π.χ. γυάλισα τη δεξιά πλευρά της πλώρης (~1 ώρα)") : tr("Τι δοκίμασες; Τι ειδικό χρειάζεται;")}
                style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn color={COLORS.teal} onClick={() => { if (!note.trim()) return; mode === "progress" ? onProgress(t, note.trim()) : onExternal(t, note.trim()); setMode(null); setOpen(false); }}>{tr("Καταχώρηση")}</Btn>
                <Btn color={COLORS.sub} outline onClick={() => setMode(null)}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "assign" && (isMgr || canAssign) && (
            <div style={{ marginTop: 10 }}>
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
          {mode === "completeAs" && isMgr && (
            <div style={{ marginTop: 10 }}>
              {t.boatId && <div style={{ fontSize: 12.5, marginBottom: 8, color: confidence === "reservations" ? COLORS.amber : COLORS.green, fontWeight: 700 }}>{confidence === "reservations" ? "🟡 " + tr("Με επιφυλάξεις") : "🟢 " + tr("Τέλεια ολοκλήρωση")}</div>}
              <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 8 }}>{tr("Ολοκληρώθηκε από:")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {employees.map(u => (
                  <Btn key={u.id} small color={completeAsId === u.id ? COLORS.teal : COLORS.navy} outline={completeAsId !== u.id}
                    onClick={() => setCompleteAsId(u.id)}>{u.name}</Btn>
                ))}
                <Btn small color={completeAsId === me.id ? COLORS.teal : COLORS.navy} outline={completeAsId !== me.id}
                  onClick={() => setCompleteAsId(me.id)}>{tr("Εγώ")} ({me.name})</Btn>
              </div>
              {t.intensive && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12.5, color: COLORS.sub, marginBottom: 6 }}>{tr("Φωτογραφία αποτελέσματος (προαιρετικό):")}</div>
                  <input ref={afterFileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }}
                    onChange={e => setAfterPhotos(prev => [...prev, ...Array.from(e.target.files || [])])} />
                  <Btn small color={COLORS.teal} outline onClick={() => afterFileRef.current?.click()}>📷 {tr("Προσθήκη φωτογραφίας")}</Btn>
                  {afterPhotos.length > 0 && <span style={{ fontSize: 12.5, color: COLORS.sub, marginLeft: 8 }}>{afterPhotos.length} {tr("επιλεγμένες")}</span>}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Btn color={COLORS.green} onClick={() => { onComplete(t, completeAsId, afterPhotos, confidence); setMode(null); setOpen(false); setAfterPhotos([]); setConfidence(null); }}>{tr("Επιβεβαίωση ✔")}</Btn>
                <Btn color={COLORS.sub} outline onClick={() => { setMode(null); setAfterPhotos([]); setConfidence(null); }}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
          {mode === "completeSimple" && !isMgr && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12.5, color: COLORS.sub, marginBottom: 6 }}>{tr("Φωτογραφία αποτελέσματος (προαιρετικό, αλλά συνιστάται):")}</div>
              <input ref={afterFileRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }}
                onChange={e => setAfterPhotos(prev => [...prev, ...Array.from(e.target.files || [])])} />
              <Btn small color={COLORS.teal} outline onClick={() => afterFileRef.current?.click()}>📷 {tr("Προσθήκη φωτογραφίας")}</Btn>
              {afterPhotos.length > 0 && <span style={{ fontSize: 12.5, color: COLORS.sub, marginLeft: 8 }}>{afterPhotos.length} {tr("επιλεγμένες")}</span>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Btn color={COLORS.green} onClick={() => { onComplete(t, null, afterPhotos, confidence); setMode(null); setOpen(false); setAfterPhotos([]); setConfidence(null); }}>{tr("Επιβεβαίωση ✔")}</Btn>
                <Btn color={COLORS.sub} outline onClick={() => { setMode(null); setAfterPhotos([]); setConfidence(null); }}>{tr("Άκυρο")}</Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const Btn = ({ children, color, outline, onClick, small }) => (
  <button onClick={onClick} style={{
    background: outline ? "transparent" : color, color: outline ? color : "#fff",
    border: `1.5px solid ${color}`, borderRadius: 9, padding: small ? "5px 10px" : "9px 14px",
    fontSize: small ? 12.5 : 14, fontWeight: 600,
  }}>{children}</button>
);

const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 9, border: `1px solid ${COLORS.line}`, fontSize: 14.5, fontFamily: "inherit", background: "#fff" };

const SectionTitle = ({ children }) => <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.sub, textTransform: "uppercase", letterSpacing: 0.8, margin: "18px 0 8px" }}>{children}</div>;

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
    <div style={{ background: "linear-gradient(135deg, #0B2239, #0E7C86)", color: "#fff", borderRadius: 14, padding: "16px 18px", marginBottom: 14, fontSize: 15.5, lineHeight: 1.45, fontWeight: 600 }}>
      {msg}
    </div>
  );
}

function DeparturesWidget({ boats }) {
  const soon = boats
    .filter(b => !b.atSea && b.departureDate)
    .map(b => ({ ...b, _du: daysUntil(b.departureDate) }))
    .filter(b => b._du !== null && b._du <= 7)
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  const returning = boats
    .filter(b => b.atSea && b.returnDate)
    .map(b => ({ ...b, _du: daysUntil(b.returnDate) }))
    .filter(b => b._du !== null && b._du <= 7)
    .sort((a, b) => a.returnDate.localeCompare(b.returnDate));
  if (!soon.length && !returning.length) return null;
  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 14, border: `1px solid ${COLORS.line}` }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>⚓ Αναχωρήσεις & Επιστροφές (7 μέρες)</div>
      {soon.map(b => (
        <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13.5 }}>
          <span>⏰ {b.name}</span>
          <span style={{ color: b._du <= 1 ? COLORS.red : COLORS.amber, fontWeight: 700 }}>{b._du <= 0 ? "Φεύγει σήμερα" : `Φεύγει σε ${b._du}μ — ${fmtDate(b.departureDate)}`}</span>
        </div>
      ))}
      {returning.map(b => (
        <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13.5 }}>
          <span>🌊 {b.name}</span>
          <span style={{ color: COLORS.teal, fontWeight: 700 }}>{b._du <= 0 ? "Επιστρέφει σήμερα" : `Επιστρέφει σε ${b._du}μ — ${fmtDate(b.returnDate)}`}</span>
        </div>
      ))}
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
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8A5A00", marginBottom: 6 }}>⚠ Εκκρεμούν εξωτερικοί συνεργάτες ({shown.length})</div>
      {shown.map(t => {
        const m = mode?.taskId === t.id ? mode.kind : null;
        return (
          <div key={t.id} style={{ background: "#FFF7E8", borderRadius: 10, padding: "10px 12px", marginBottom: 6, fontSize: 13.5 }}>
            <div><b>{t.desc}</b> — {bn(t.boatId)}</div>
            {t.externalNote && <div style={{ color: "#8A5A00", fontSize: 12.5, marginTop: 3 }}>{t.externalNote}</div>}
            {t.progress?.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12.5, color: "#5B4A00" }}>
                {t.progress.map((p, i) => <div key={i}>✏ {fmtDate(p.at)}: {p.note}</div>)}
              </div>
            )}
            {m === null && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn small color={COLORS.green} onClick={() => startMode(t.id, "complete")}>✔ Ολοκληρώθηκε</Btn>
                <Btn small color={COLORS.teal} outline onClick={() => startMode(t.id, "progress")}>➕ Πρόοδος</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => startMode(t.id, "edit", t.desc)}>✎ Διόρθωση</Btn>
                <Btn small color={COLORS.red} outline onClick={() => startMode(t.id, "confirmDel")}>🗑 Διαγραφή</Btn>
                <Btn small color={COLORS.amber} outline onClick={() => onAck(t)}>👁 Το γνωρίζω</Btn>
              </div>
            )}
            {(m === "progress" || m === "complete") && (
              <div style={{ marginTop: 8 }}>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder={m === "complete" ? "π.χ. Ο μηχανικός ολοκλήρωσε την επισκευή" : "π.χ. Ο μηχανικός έφτιαξε το μισό, θα ξανάρθει την Πέμπτη"}
                  style={inputStyle} />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
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
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <Btn small color={COLORS.teal} onClick={() => { if (!note.trim()) return; onEdit(t, note.trim()); cancelMode(); }}>Καταχώρηση</Btn>
                  <Btn small color={COLORS.sub} outline onClick={cancelMode}>Άκυρο</Btn>
                </div>
              </div>
            )}
            {m === "confirmDel" && (
              <div style={{ marginTop: 8, background: "#FDECEA", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#8A1C12", marginBottom: 6 }}>Διαγραφή εργασίας; Δεν αναιρείται.</div>
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
  const eightHoursAgo = Date.now() - 8 * 3600 * 1000;
  const mine = notes.filter(n => n.to.includes(me.id) && new Date(n.at).getTime() >= eightHoursAgo)
    .sort((a, b) => b.at.localeCompare(a.at));
  if (mine.length === 0) return null;
  const shown = mine[Math.min(idx, mine.length - 1)];
  const senderName = users.find(u => u.id === shown.from)?.name || "";
  const timeAgo = (() => {
    const mins = Math.round((Date.now() - new Date(shown.at).getTime()) / 60000);
    if (mins < 60) return `${mins}λ`;
    return `${Math.round(mins / 60)}ω`;
  })();
  return (
    <div style={{ background: "#FFF7E8", border: `1.5px solid ${COLORS.amber}`, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#8A5A00", marginBottom: 3 }}>📌 {senderName} · {timeAgo}</div>
          <div style={{ fontSize: 14, lineHeight: 1.4, color: "#3A2600" }}>{shown.text}</div>
        </div>
        {mine.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
            <button onClick={() => setIdx((idx - 1 + mine.length) % mine.length)} style={{ border: "none", background: "none", color: "#8A5A00", fontSize: 14, padding: 2, lineHeight: 1 }}>▴</button>
            <div style={{ fontSize: 10, color: "#8A5A00" }}>{idx + 1}/{mine.length}</div>
            <button onClick={() => setIdx((idx + 1) % mine.length)} style={{ border: "none", background: "none", color: "#8A5A00", fontSize: 14, padding: 2, lineHeight: 1 }}>▾</button>
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
  const eightHoursAgo = Date.now() - 8 * 3600 * 1000;
  const sent = notes.filter(n => n.from === me.id && new Date(n.at).getTime() >= eightHoursAgo).sort((a, b) => b.at.localeCompare(a.at));
  const recipientNames = (ids) => ids.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(", ");
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  return (
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "none", border: "none", color: COLORS.sub, fontSize: 12.5, fontWeight: 600, padding: 0, display: "flex", alignItems: "center", gap: 4,
      }}>✉ Μήνυμα σε ομάδα {open ? "▾" : "▸"}</button>
      {open && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginTop: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {users.filter(u => u.id !== me.id).map(u => (
              <button key={u.id} onClick={() => toggle(u.id)} style={{
                padding: "6px 11px", borderRadius: 16, fontSize: 12.5, fontWeight: 600,
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
            <div style={{ marginTop: 14, borderTop: `1px solid ${COLORS.line}`, paddingTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.sub, marginBottom: 6 }}>Στάλθηκαν πρόσφατα:</div>
              {sent.map(n => (
                <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 13 }}>
                  <div><b>{recipientNames(n.to)}</b>: {n.text}</div>
                  <button onClick={() => onDelete(n.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>🗑</button>
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
    <div style={{ marginBottom: 14 }}>
      <button onClick={() => setOpen(!open)} style={{
        background: "none", border: "none", color: COLORS.sub, fontSize: 12.5, fontWeight: 600, padding: 0, display: "flex", alignItems: "center", gap: 4,
      }}>🏖 Απουσίες{upcoming.length > 0 ? ` (${upcoming.length})` : ""} {open ? "▾" : "▸"}</button>
      {open && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginTop: 8 }}>
          {mine.length === 0 && <div style={{ fontSize: 13, color: COLORS.sub, marginBottom: 10 }}>Καμία δηλωμένη απουσία.</div>}
          {mine.map(a => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 13.5 }}>
              <span>{fmtDate(a.from)} – {fmtDate(a.to)}{a.note ? ` · ${a.note}` : ""}</span>
              <button onClick={() => onDelete(a.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700 }}>×</button>
            </div>
          ))}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
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
      const prompt = `Είσαι βοηθός βάσης σκαφών. Ο χρήστης λέει προφορικά ότι ολοκλήρωσε κάποια/ες από τις παρακάτω δικές του ανοιχτές εργασίες. Βρες ΠΟΙΕΣ εργασίες εννοεί, με βάση το σκάφος και την περιγραφή. Να είσαι συντηρητικός — βάλε μόνο ό,τι ταιριάζει με σιγουριά.
ΕΡΓΑΣΙΕΣ: ${list}
ΚΕΙΜΕΝΟ: "${text.trim()}"
Απάντησε ΜΟΝΟ με JSON χωρίς markdown: {"taskIds":["..."]}`;
      const raw = await askClaude(prompt, 300);
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      const found = tasks.filter(t => (parsed.taskIds || []).includes(t.id));
      if (!found.length) setErr(tr("Δεν βρέθηκε αντίστοιχη εργασία — δοκίμασε πιο συγκεκριμένα (π.χ. όνομα σκάφους)."));
      else setMatches(found);
    } catch { setErr(tr("Η αναγνώριση απέτυχε — δοκίμασε ξανά.")); }
    setBusy(false);
  };

  const confirm = () => {
    matches.forEach(t => onComplete(t));
    setMatches(null); setText(""); setOpen(false);
  };

  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12, border: `1.5px solid ${open ? COLORS.green : COLORS.line}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", textAlign: "left", fontSize: 15, fontWeight: 700, color: COLORS.green }}>
        🎤 {tr("Ολοκλήρωση με φωνή")} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <button onClick={toggleMic} style={{
            width: "100%", padding: 12, borderRadius: 10, fontWeight: 700, fontSize: 14.5,
            border: `2px solid ${listening ? COLORS.red : COLORS.green}`,
            background: listening ? COLORS.red : "transparent", color: listening ? "#fff" : COLORS.green,
          }}>{listening ? "⏹ " + tr("Σταμάτημα") : "🎤 " + tr("Μίλα")}</button>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={2}
            placeholder={tr("π.χ. Στο Σοφία 2 το πόμολο το έφτιαξα")} style={{ ...inputStyle, marginTop: 8 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn color={COLORS.green} onClick={analyze}>{busy ? tr("Αναγνώριση…") : "✨ " + tr("Αναγνώριση")}</Btn>
            {text && <Btn color={COLORS.sub} outline onClick={() => { setText(""); setMatches(null); }}>{tr("Καθάρισμα")}</Btn>}
          </div>
          {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          {matches && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.sub, marginBottom: 6 }}>{tr("Βρέθηκαν")}:</div>
              {matches.map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 10, marginBottom: 6, fontSize: 14 }}>
                  <span>{t.desc} <span style={{ color: COLORS.sub, fontSize: 12.5 }}>({boats.find(b => b.id === t.boatId)?.name || "Βάση/Άλλο"})</span></span>
                  <Btn small color={COLORS.sub} outline onClick={() => setMatches(matches.filter(x => x.id !== t.id))}>×</Btn>
                </div>
              ))}
              {matches.length > 0 && <Btn color={COLORS.green} onClick={confirm}>✔ {tr("Ολοκλήρωση")} ({matches.length})</Btn>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TodayView({ me, tasks, allTasks, boats, users, isMgr, canAssign, effectiveDeadline, onComplete, onProgress, onExternal, onEdit, onDelete, onChecklistItem, onSetDeadline, onSetDeadlineDuration, onAddBeforePhotos, onLogFinding, onAssign, onAssignWithDeadline, onDowngrade, absences, onAddAbsence, onDeleteAbsence, notes, onSendNote, onDeleteNote, onAckExternal, onCloseExternal }) {
  return (
    <div>
      <ExternalReminders me={me} tasks={allTasks} boats={boats} onAck={onAckExternal} onProgress={onProgress} onCloseExternal={onCloseExternal} onDelete={onDelete} onEdit={onEdit} />
      <MyNotes me={me} notes={notes} users={users} />
      <DailyGreeting me={me} />
      <DeparturesWidget boats={boats} />
      <MyAbsences me={me} absences={absences} onAdd={onAddAbsence} onDelete={onDeleteAbsence} />
      {canAssign && <SendNote me={me} users={users} notes={notes} onSend={onSendNote} onDelete={onDeleteNote} />}
      <SectionTitle>{tr("Οι εργασίες μου")} — {new Date().toLocaleDateString(LANG === "en" ? "en-GB" : "el-GR", { weekday: "long", day: "numeric", month: "long" })}</SectionTitle>
      {tasks.length > 0 && <VoiceComplete tasks={tasks} boats={boats} onComplete={onComplete} />}
      {tasks.length === 0 && <Empty>{tr("Δεν σου έχει ανατεθεί κάτι ονομαστικά. Δες τις διαθέσιμες εργασίες στην καρτέλα «Εργασίες».")}</Empty>}
      {tasks.map(t => <TaskCard key={t.id} t={t} boats={boats} users={users} isMgr={isMgr} me={me} deadline={effectiveDeadline}
        onComplete={onComplete} onProgress={onProgress} onExternal={onExternal} onEdit={onEdit} onDelete={onDelete} onChecklistItem={onChecklistItem} onSetDeadline={onSetDeadline} onSetDeadlineDuration={onSetDeadlineDuration} onAddBeforePhotos={onAddBeforePhotos} onLogFinding={onLogFinding}
        onAssign={onAssign} onAssignWithDeadline={onAssignWithDeadline} onDowngrade={onDowngrade} canAssign={canAssign} showAssignee={isMgr} />)}
    </div>
  );
}

function TasksView({ tasks, boats, users, isMgr, me, effectiveDeadline, onComplete, onProgress, onExternal, onAssign, onAssignWithDeadline, onDowngrade, onEdit, onDelete, canAssign, onChecklistItem, onSetDeadline, onSetDeadlineDuration, onAddBeforePhotos, onLogFinding }) {
  const [boatFilter, setBoatFilter] = useState("");
  const shown = boatFilter ? tasks.filter(t => t.boatId === boatFilter || (boatFilter === "other" && !t.boatId)) : tasks;
  return (
    <div>
      <SectionTitle>{tr("Διαθέσιμες εργασίες")} ({tasks.length})</SectionTitle>
      <select value={boatFilter} onChange={e => setBoatFilter(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
        <option value="">{tr("Όλα τα σκάφη")}</option>
        {boats.filter(b => !b.atSea).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value="other">{tr("Βάση / Άλλο")}</option>
      </select>
      {shown.length === 0 && <Empty>{tr("Καμία εργασία εδώ.")}</Empty>}
      {shown.map(t => <TaskCard key={t.id} t={t} boats={boats} users={users} isMgr={isMgr} me={me} deadline={effectiveDeadline}
        onComplete={onComplete} onProgress={onProgress} onExternal={onExternal} onAssign={onAssign} onAssignWithDeadline={onAssignWithDeadline} onDowngrade={onDowngrade} onEdit={onEdit} onDelete={onDelete} canAssign={canAssign} showAssignee={isMgr || canAssign} onChecklistItem={onChecklistItem} onSetDeadline={onSetDeadline} onSetDeadlineDuration={onSetDeadlineDuration} onAddBeforePhotos={onAddBeforePhotos} onLogFinding={onLogFinding} />)}
    </div>
  );
}

const Empty = ({ children }) => <div style={{ background: COLORS.card, borderRadius: 12, padding: 18, color: COLORS.sub, fontSize: 14, textAlign: "center" }}>{children}</div>;

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
          {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <label style={lbl}>{tr("Περιγραφή")}</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={multi ? 6 : 3}
          placeholder={multi ? tr("Μία εργασία ανά γραμμή, π.χ.:\nΠαράθυρο σπασμένο\nΤο φως στην πλώρη δεν ανάβει\nΗ σκότα θέλει αλλαγή") : tr("π.χ. Το πόμολο στη δεξιά πόρτα της καμπίνας έχει χαλάσει")} style={inputStyle} />
        <button onClick={() => setMulti(!multi)} style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 9, fontSize: 13, fontWeight: 700,
          border: `1.5px solid ${COLORS.teal}`, background: multi ? COLORS.teal : "transparent", color: multi ? "#fff" : COLORS.teal,
        }}>≡ {multi ? tr("Πολλαπλές εργασίες: ΝΑΙ — μία ανά γραμμή") : tr("Πολλαπλές εργασίες μαζί (μία ανά γραμμή)")}</button>

        <button onClick={() => setUrgent(!urgent)} style={{
          marginTop: 8, padding: "8px 12px", borderRadius: 9, fontSize: 13, fontWeight: 700,
          border: `1.5px solid ${COLORS.red}`, background: urgent ? COLORS.red : "transparent", color: urgent ? "#fff" : COLORS.red,
        }}>🔴 {urgent ? tr("ΕΠΕΙΓΟΝ — σοβαρό πρόβλημα") : tr("Μαρκάρισμα ως επείγον (σοβαρό πρόβλημα)")}</button>

        <button onClick={() => setPurchase(!purchase)} style={{
          marginTop: 8, width: "100%", padding: "11px", borderRadius: 10, fontWeight: 700, fontSize: 14.5,
          border: `2px solid ${COLORS.amber}`, background: purchase ? COLORS.amber : "transparent", color: purchase ? "#fff" : COLORS.amber,
        }}>🛒 {purchase ? tr("ΑΓΟΡΑ / ΛΕΙΨΗ ΥΛΙΚΟΥ — θα ανατεθεί στον Λεωνίδα") : tr("Λείπει υλικό / χρειάζεται αγορά")}</button>

        <button onClick={() => setBacklog(!backlog)} style={{
          marginTop: 8, width: "100%", padding: "11px", borderRadius: 10, fontWeight: 700, fontSize: 14.5,
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
          width: "100%", padding: "10px", borderRadius: 9, border: `1.5px dashed ${COLORS.teal}`,
          background: "transparent", color: COLORS.teal, fontSize: 13.5, fontWeight: 600,
        }}>📷 {tr("Προσθήκη φωτογραφίας")}</button>
        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {photos.map((f, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: `1px solid ${COLORS.line}` }} />
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} style={{
                  position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: "none",
                  background: COLORS.red, color: "#fff", fontSize: 12, lineHeight: "20px", padding: 0,
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
const lbl = { display: "block", fontSize: 12.5, fontWeight: 700, color: COLORS.sub, margin: "14px 0 6px" };


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
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12, border: `1.5px solid ${open ? COLORS.teal : COLORS.line}` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", textAlign: "left", fontSize: 15, fontWeight: 700, color: COLORS.teal }}>
        🎤 {tr("Φωνητική καταχώρηση με AI")} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={toggleMic} style={{
              flex: 1, padding: 12, borderRadius: 10, fontWeight: 700, fontSize: 14.5,
              border: `2px solid ${listening ? COLORS.red : COLORS.teal}`,
              background: listening ? COLORS.red : "transparent", color: listening ? "#fff" : COLORS.teal,
            }}>{listening ? "⏹ " + tr("Σταμάτημα") : "🎤 " + tr("Μίλα")}</button>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
            placeholder={tr("π.χ. Στον Λεωνίδα το παράθυρο είναι σπασμένο, δεν ανάβει το φως στην πλώρη και θέλει αλλαγή η σκότα")}
            style={inputStyle} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Btn color={COLORS.navy} onClick={analyze}>{busy ? tr("Ανάλυση…") : "✨ " + tr("Ανάλυση με AI")}</Btn>
            {text && <Btn color={COLORS.sub} outline onClick={() => { setText(""); setItems(null); }}>{tr("Καθάρισμα")}</Btn>}
          </div>
          {err && <div style={{ color: COLORS.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
          {items && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.sub, marginBottom: 6 }}>{tr("Προεπισκόπηση — έλεγξε και διόρθωσε πριν την καταχώρηση")}:</div>
              {items.map((it, i) => (
                <div key={i} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
                  <input value={it.desc} onChange={e => upd(i, { desc: e.target.value })} style={{ ...inputStyle, marginBottom: 6 }} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={it.boatId} onChange={e => upd(i, { boatId: e.target.value })} style={{ ...inputStyle, width: "auto", flex: 1 }}>
                      <option value="">{tr("Βάση / Άλλο")}</option>
                      {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button onClick={() => upd(i, { urgent: !it.urgent })} style={{
                      padding: "7px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                      border: `1.5px solid ${COLORS.red}`, background: it.urgent ? COLORS.red : "transparent", color: it.urgent ? "#fff" : COLORS.red,
                    }}>🔴</button>
                    <button onClick={() => upd(i, { purchase: !it.purchase })} title={tr("Λείπει υλικό / χρειάζεται αγορά")} style={{
                      padding: "7px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
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
  const doneAll = tasks.filter(t => t.status === "done" && (boatId ? t.boatId === boatId : true))
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  const done = showAll ? doneAll : doneAll.filter(t => t.serviceRelevant);
  return (
    <div>
      <SectionTitle>{tr("Βιβλίο service")}</SectionTitle>
      <select value={boatId} onChange={e => setBoatId(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
        <option value="">{tr("Όλα τα σκάφη")}</option>
        {boats.map(b => <option key={b.id} value={b.id}>{b.name}{b.atSea ? " (εν πλω)" : ""}</option>)}
      </select>
      {isMgr && (
        <button onClick={() => setShowAll(!showAll)} style={{
          marginBottom: 12, padding: "8px 12px", borderRadius: 9, fontSize: 13, fontWeight: 700,
          border: `1.5px solid ${COLORS.sub}`, background: showAll ? COLORS.sub : "transparent", color: showAll ? "#fff" : COLORS.sub,
        }}>{showAll ? "Δείχνω όλες τις ολοκληρωμένες" : "Δείξε και τις ρουτίνας"}</button>
      )}
      {done.length === 0 && <Empty>{tr("Καμία ολοκληρωμένη εργασία ακόμα.")}</Empty>}
      {done.map(t => {
        const boat = boats.find(b => b.id === t.boatId);
        return (
          <div key={t.id} style={{ background: COLORS.card, borderRadius: 10, padding: "11px 14px", marginBottom: 8, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ fontWeight: 600 }}>{t.desc}</div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {isMgr && (
                  <button onClick={() => onToggleService(t)} title={t.serviceRelevant ? "Αφαίρεση από βιβλίο service" : "Προσθήκη στο βιβλίο service"}
                    style={{ border: "none", background: "none", color: t.serviceRelevant ? COLORS.teal : COLORS.sub, fontSize: 14, padding: "2px 4px" }}>
                    {t.serviceRelevant ? "🔧✓" : "🔧+"}
                  </button>
                )}
                {isMgr && confirmId !== t.id && (
                  <button onClick={() => setConfirmId(t.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", padding: "2px 4px" }}>🗑</button>
                )}
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: COLORS.sub, marginTop: 3 }}>
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
    setDeparture, cancelCharter, onReturn, onCloseExternal, onDowngrade, onRate, runDistribution, generateClosingChecks, effectiveDeadline, showToast, onViewAs, realOwner, onAddAbsence, onDeleteAbsence } = props;
  const [section, setSection] = useState("overview");
  const isOwner = me.role === "owner";
  const sections = [
    ["overview", "Επισκόπηση"], ["control", "Έλεγχος"], ["boats", "Σκάφη"],
    ["lists", "Λίστες"], ["absences", "Απουσίες"], ["stats", "Στατιστικά"], ["ai", "AI"],
    ["profiles", "Ομάδα"], ["errors", "Σφάλματα"],
    ...(isOwner ? [["usersS", "Χρήστες"]] : []),
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 6 }}>
        {sections.map(([id, label]) => (
          <button key={id} onClick={() => setSection(id)} style={{
            whiteSpace: "nowrap", padding: "7px 13px", borderRadius: 20, fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${section === id ? COLORS.navy : COLORS.line}`,
            background: section === id ? COLORS.navy : COLORS.card, color: section === id ? "#fff" : COLORS.text,
          }}>{label}</button>
        ))}
      </div>
      {section === "overview" && <Overview boats={boats} tasks={tasks} effectiveDeadline={effectiveDeadline} runDistribution={runDistribution} generateClosingChecks={generateClosingChecks} users={users} me={me} absences={absences} />}
      {section === "control" && <ControlPanel tasks={tasks} boats={boats} users={users} onReturn={onReturn} onCloseExternal={onCloseExternal} onDowngrade={onDowngrade} onRate={onRate} onDelete={props.onDelete} />}
      {section === "boats" && <BoatsAdmin boats={boats} tasks={tasks} boatNotes={boatNotes} onAddBoatNote={onAddBoatNote} onDeleteBoatNote={onDeleteBoatNote} isMgr={me.role === "manager" || me.role === "owner"} persistBoats={persistBoats} setDeparture={setDeparture} cancelCharter={cancelCharter} showToast={showToast} />}
      {section === "lists" && <ListsAdmin quick={quick} checklist={checklist} closingChecklist={closingChecklist} persistQuick={persistQuick} persistChecklist={persistChecklist} persistClosingChecklist={persistClosingChecklist} />}
      {section === "absences" && <AbsencesAdmin users={users} absences={absences} onAdd={onAddAbsence} onDelete={onDeleteAbsence} />}
      {section === "stats" && <Stats users={users} tasks={tasks} boats={boats} />}
      {section === "ai" && <AiSearch tasks={tasks} boats={boats} users={users} aiMemories={aiMemories} onAddMemory={onAddMemory} onDeleteMemory={onDeleteMemory} onAddScheduled={onAddScheduled} onDeleteTask={props.onDelete} />}
      {section === "profiles" && <ProfilesView users={users} me={me} onViewAs={onViewAs} />}
      {section === "errors" && <ErrorsAdmin />}
      {section === "usersS" && isOwner && <UsersAdmin users={users} persistUsers={persistUsers} me={me} onViewAs={realOwner ? onViewAs : null} />}
    </div>
  );
}


function WeeklyReport({ tasks, users, me, boats, absences }) {
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const allowed = me.role === "owner" || ["Φανούρης", "Αλέξανδρος"].includes(me.name);
  const weekKey = (() => { const d = new Date(); const day = d.getDay(); const back = day === 0 ? 0 : day; d.setDate(d.getDate() - back); return d.toISOString().slice(0, 10); })();
  const genReport = async (auto) => {
    if (busy) return; setBusy(true);
    try {
      const from = new Date(); from.setDate(from.getDate() - 7);
      const fromStr = from.toISOString().slice(0, 10);
      const inW = (d) => d && new Date(d) >= from;
      const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση";
      const team = users.filter(u => u.role === "employee" && !u.noStats);
      const absDaysFor = (uid) => (absences || []).filter(a => a.userId === uid && a.from <= todayStr() && a.to >= fromStr)
        .reduce((s, a) => s + 1, 0);
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
      if (now.getDay() === 0 && now.getHours() >= 17) genReport(true);
    })();
  }, []);
  if (!allowed) return null;
  return (
    <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12, border: `1.5px solid ${COLORS.navy}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => rep && setOpen(!open)} style={{ background: "none", border: "none", padding: 0, display: "flex", alignItems: "center", gap: 6, cursor: rep ? "pointer" : "default" }}>
          <div style={{ fontWeight: 800, fontSize: 14.5 }}>📊 Εβδομαδιαία αναφορά ομάδας</div>
          {rep && <span style={{ fontSize: 12, color: COLORS.sub }}>{open ? "▾" : "▸"}</span>}
        </button>
        <Btn small color={COLORS.navy} outline onClick={() => genReport(false)}>{busy ? "Σύνταξη…" : rep ? "↻ Νέα" : "Δημιουργία"}</Btn>
      </div>
      {rep
        ? (open
            ? <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{rep.text}</div>
            : <div onClick={() => setOpen(true)} style={{ marginTop: 8, fontSize: 13, color: COLORS.sub, cursor: "pointer" }}>
                {rep.text.slice(0, 90)}… <span style={{ color: COLORS.teal, fontWeight: 600 }}>περισσότερα</span>
              </div>)
        : <div style={{ marginTop: 8, fontSize: 12.5, color: COLORS.sub }}>Δημιουργείται αυτόματα κάθε Κυριακή απόγευμα — ή πάτα «Δημιουργία» όποτε θες ενδιάμεση εικόνα.</div>}
    </div>
  );
}

function Overview({ boats, tasks, effectiveDeadline, runDistribution, generateClosingChecks, users, me, absences }) {
  const departing = boats.filter(b => !b.atSea && b.departureDate).sort((a, b) => a.departureDate.localeCompare(b.departureDate));
  const urgent = tasks.filter(t => t.status === "open" && t.urgent);
  const external = tasks.filter(t => t.status === "external");
  const purchases = tasks.filter(t => t.status === "open" && t.purchase);
  const bn = (id) => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
  const openPerBoat = boats.filter(b => !b.atSea).map(b => ({ b, n: tasks.filter(t => t.boatId === b.id && t.status === "open").length })).filter(x => x.n > 0);
  return (
    <div>
      <SectionTitle>Εικόνα εβδομάδας</SectionTitle>
      <WeeklyReport tasks={tasks} users={users} me={me} boats={boats} absences={absences} />
      {(urgent.length > 0 || external.length > 0) && (
        <div style={{ background: "#FDECEA", borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 14 }}>
          {urgent.length > 0 && <div style={{ fontWeight: 700, color: COLORS.red }}>🔴 {urgent.length} επείγουσες εργασίες σοβαρότητας</div>}
          {external.length > 0 && <div style={{ fontWeight: 700, color: "#8A5A00", marginTop: 6 }}>⚠ Εκκρεμούν εξωτερικοί συνεργάτες:</div>}
          {external.map(t => <div key={t.id} style={{ fontSize: 13, color: "#8A5A00", paddingLeft: 8 }}>• {t.desc} — {bn(t.boatId)}</div>)}
          <div style={{ fontSize: 12.5, color: COLORS.sub, marginTop: 4 }}>Λεπτομέρειες/κλείσιμο στην καρτέλα «Έλεγχος».</div>
        </div>
      )}
      {purchases.length > 0 && (
        <div style={{ background: "#FFF7E8", borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 14 }}>
          <div style={{ fontWeight: 700, color: "#8A5A00" }}>🛒 Ελλείψεις / προς αγορά ({purchases.length}) — ανατεθειμένα στον Λεωνίδα:</div>
          {purchases.map(t => <div key={t.id} style={{ fontSize: 13, color: "#5B4A00", paddingLeft: 8, marginTop: 3 }}>• {t.desc} — {bn(t.boatId)}</div>)}
        </div>
      )}
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Αναχωρήσεις</div>
        {departing.length === 0 && <div style={{ color: COLORS.sub, fontSize: 14 }}>Καμία δηλωμένη αναχώρηση. Όρισε από «Σκάφη».</div>}
        {departing.map(b => {
          const open = tasks.filter(t => t.boatId === b.id && t.status === "open" && !t.excludedFromDeadline).length;
          const du = daysUntil(b.departureDate);
          return (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 14 }}>
              <span style={{ fontWeight: 600 }}>{b.name}</span>
              <span style={{ color: du <= 2 ? COLORS.red : COLORS.sub }}>{fmtDate(b.departureDate)} ({du <= 0 ? "σήμερα" : `σε ${du}μ`}) · {open} ανοιχτές</span>
            </div>
          );
        })}
      </div>
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Ανοιχτές εργασίες ανά σκάφος</div>
        {openPerBoat.length === 0 && <div style={{ color: COLORS.sub, fontSize: 14 }}>Καμία ανοιχτή εργασία σε σκάφη.</div>}
        {openPerBoat.map(({ b, n }) => (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14 }}>
            <span>{b.name}</span><b>{n}</b>
          </div>
        ))}
      </div>
      <Btn color={COLORS.teal} onClick={runDistribution}>▶ Εκτέλεση κατανομής ημέρας (AI) τώρα</Btn>
      <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 6, marginBottom: 14 }}>Η κατανομή τρέχει αυτόματα μία φορά την ημέρα στο πρώτο άνοιγμα.</div>
      <Btn color={COLORS.amber} outline onClick={generateClosingChecks}>🔒 Δημιουργία ελέγχων κλεισίματος τώρα</Btn>
      <div style={{ fontSize: 12, color: COLORS.sub, marginTop: 6 }}>Τρέχει αυτόματα μετά τις 15:30, στο πρώτο άνοιγμα της εφαρμογής μετά την ώρα αυτή. Το κουμπί εδώ είναι για χειροκίνητη εκτέλεση εκτός ώρας.</div>
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
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      <Btn small color={COLORS.red} onClick={() => { onDelete(t); setConfirmId(null); }}>Ναι, διαγραφή</Btn>
      <Btn small color={COLORS.sub} outline onClick={() => setConfirmId(null)}>Άκυρο</Btn>
    </div>
  ) : <button onClick={() => setConfirmId(t.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700, padding: "2px 4px" }}>🗑</button>;
  return (
    <div>
      <SectionTitle>⚠ Εκκρεμούν εξωτερικοί συνεργάτες ({external.length})</SectionTitle>
      {external.length === 0 && <Empty>Καμία εκκρεμότητα εξωτερικού.</Empty>}
      {external.map(t => (
        <div key={t.id} style={{ background: "#FFF7E8", borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 14 }}>
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
        <div key={t.id} style={{ background: "#FDECEA", borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 14 }}>
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
        <div key={t.id} style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>{t.desc} — {bn(t.boatId)}</div>
            <DelBtn t={t} />
          </div>
          <div style={{ color: COLORS.sub, fontSize: 13, margin: "3px 0 8px" }}>
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
              <span key={n} onClick={() => onRate(t, n)} style={{ cursor: "pointer", fontSize: 18, color: (t.rating || 0) >= n ? COLORS.amber : COLORS.line }}>★</span>
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

const addDays = (dateStr, days) => { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

function BoatDetail({ boat, tasks, boatNotes, onAddNote, onDeleteNote, isMgr, onDeleteBoat }) {
  const [noteText, setNoteText] = useState("");
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
    <div style={{ marginTop: 10, background: COLORS.bg, borderRadius: 10, padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>ℹ️ {boat.name} — Πληροφορίες</div>
      <Btn small color={COLORS.teal} onClick={() => ask("Τι θέματα ή επαναλαμβανόμενα προβλήματα έχει αυτό το σκάφος; Αν κάτι φαίνεται καινούργιο (δηλαδή υπάρχει παλιότερη ένδειξη ότι δούλευε καλά), ανάφερέ το ρητά. Δώσε σύντομη επισκόπηση.")}>{busy ? "…" : "✨ Επισκόπηση AI"}</Btn>
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <input value={aiQ} onChange={e => setAiQ(e.target.value)} placeholder="Ρώτησε κάτι για αυτό το σκάφος…" style={{ ...inputStyle, flex: 1 }} />
        <Btn small color={COLORS.navy} onClick={() => ask()}>{busy ? "…" : "Ρώτησε"}</Btn>
      </div>
      {aiAns && <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", background: COLORS.card, borderRadius: 8, padding: 10 }}>{aiAns}</div>}

      <div style={{ fontWeight: 700, marginTop: 14, marginBottom: 6, fontSize: 13.5 }}>Παρατηρήσεις <span style={{ fontWeight: 400, color: COLORS.sub, fontSize: 11.5 }}>(θετικές ή αρνητικές — και τα δύο βοηθούν)</span></div>
      {myNotes.length === 0 && <div style={{ color: COLORS.sub, fontSize: 13 }}>Καμία ακόμα.</div>}
      {myNotes.map(n => (
        <div key={n.id} style={{ fontSize: 13, padding: "5px 0", borderBottom: `1px dashed ${COLORS.line}` }}>
          {n.text} <span style={{ color: COLORS.sub, fontSize: 11.5 }}>— {fmtDate(n.at)}</span>
          {isMgr && <button onClick={() => onDeleteNote(n.id)} style={{ border: "none", background: "none", color: COLORS.red, marginLeft: 6, fontSize: 12 }}>🗑</button>}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="π.χ. Ο αυτόματος πιλότος δουλεύει τέλεια — ή: Στάζει λάδι στο μηχανοστάσιο" style={{ ...inputStyle, flex: 1 }} />
        <Btn small color={COLORS.teal} onClick={() => { if (noteText.trim()) { onAddNote(boat.id, noteText.trim()); setNoteText(""); } }}>Προσθήκη</Btn>
      </div>

      {serviceHistory.length > 0 && (
        <>
          <div style={{ fontWeight: 700, marginTop: 14, marginBottom: 6, fontSize: 13.5 }}>Πρόσφατο ιστορικό Service Book</div>
          {serviceHistory.slice(0, 6).map(t => (
            <div key={t.id} style={{ fontSize: 13, padding: "4px 0", color: COLORS.sub }}>• {t.desc} — {fmtDate(t.completedAt)}</div>
          ))}
        </>
      )}
      {isMgr && onDeleteBoat && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: `1px dashed ${COLORS.line}` }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ border: "none", background: "none", color: COLORS.sub, fontSize: 12, textDecoration: "underline" }}>Διαγραφή σκάφους</button>
          ) : (
            <div>
              <div style={{ fontSize: 12.5, color: COLORS.red, marginBottom: 8 }}>Διαγραφή «{boat.name}»; Το ιστορικό/Βιβλίο Service παραμένουν καταγεγραμμένα, απλά το σκάφος δεν θα εμφανίζεται πλέον.</div>
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

function BoatsAdmin({ boats, tasks, boatNotes, onAddBoatNote, onDeleteBoatNote, isMgr, persistBoats, setDeparture, cancelCharter, showToast }) {
  const [dateFor, setDateFor] = useState(null);
  const [dateVal, setDateVal] = useState("");
  const [duration, setDuration] = useState(7);
  const [customReturn, setCustomReturn] = useState("");
  const [mode, setMode] = useState(null); // 'sea' | 'charter'
  const [cancelFor, setCancelFor] = useState(null);
  const [detailFor, setDetailFor] = useState(null);
  const [newBoatName, setNewBoatName] = useState("");
  const [newBoatType, setNewBoatType] = useState("");
  const computedReturn = dateVal ? (duration === "custom" ? customReturn : addDays(dateVal, duration)) : "";
  const today = todayStr();
  const weekAhead = addDays(today, 7);
  const groupOf = (b) => {
    if (!b.atSea) return 0; // στη βάση — ετοιμάζονται ή απλά εκεί
    if (b.returnDate && b.returnDate <= weekAhead) return 1; // επιστρέφουν από ναύλο, εντός της εβδομάδας
    return 2; // εν πλω, δεν επιστρέφουν σύντομα
  };
  const sortedBoats = [...boats].sort((a, b) => {
    const ga = groupOf(a), gb = groupOf(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) {
      if (a.departureDate && b.departureDate) return a.departureDate.localeCompare(b.departureDate);
      if (a.departureDate) return -1;
      if (b.departureDate) return 1;
      return a.name.localeCompare(b.name);
    }
    if (a.returnDate && b.returnDate) return a.returnDate.localeCompare(b.returnDate);
    if (a.returnDate) return -1;
    if (b.returnDate) return 1;
    return a.name.localeCompare(b.name);
  });
  const groupInfo = {
    0: { label: "🔧 Στη βάση / ετοιμάζονται", color: COLORS.amber },
    1: { label: "🌊 Επιστρέφουν από ναύλο (εντός εβδομάδας)", color: COLORS.teal },
    2: { label: "⛵ Εν πλω — δεν επιστρέφουν σύντομα", color: COLORS.sub },
  };
  let lastGroup = null;
  return (
    <div>
      <SectionTitle>Σκάφη ({boats.length})</SectionTitle>
      {sortedBoats.map(b => {
        const g = groupOf(b);
        const showHeader = g !== lastGroup;
        lastGroup = g;
        return (
        <React.Fragment key={b.id}>
          {showHeader && (
            <div style={{ fontSize: 12.5, fontWeight: 800, color: groupInfo[g].color, margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>{groupInfo[g].label}</div>
          )}
          <div style={{ background: COLORS.card, borderRadius: 12, padding: "12px 14px", marginBottom: 8, fontSize: 14, borderLeft: `4px solid ${groupInfo[g].color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{b.name}</b> <span style={{ color: COLORS.sub, fontSize: 12.5 }}>{b.type}</span>
              <div style={{ fontSize: 12.5, marginTop: 2 }}>
                {b.atSea
                  ? <span style={{ color: COLORS.teal, fontWeight: 700 }}>🌊 Εν πλω — επιστρέφει {fmtDate(b.returnDate)}</span>
                  : b.departureDate
                    ? <span style={{ color: COLORS.amber, fontWeight: 700 }}>⏰ Φεύγει {fmtDate(b.departureDate)}{b.returnDate ? ` — επιστρέφει ${fmtDate(b.returnDate)}` : ""}</span>
                    : <span style={{ color: COLORS.sub }}>Στη βάση</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexDirection: "column" }}>
              <Btn small color={COLORS.sub} outline onClick={() => setDetailFor(detailFor === b.id ? null : b.id)}>ℹ️ Πληροφορίες</Btn>
              {b.atSea
                ? <Btn small color={COLORS.teal} outline onClick={() => persistBoats(boats.map(x => x.id === b.id ? { ...x, atSea: false, returnDate: null } : x))}>Επέστρεψε</Btn>
                : b.departureDate
                  ? <>
                    <Btn small color={COLORS.navy} outline onClick={() => { setDateFor(b.id); setMode("charter"); setDateVal(b.departureDate || ""); setDuration(7); setCustomReturn(""); }}>Αλλαγή</Btn>
                    <Btn small color={COLORS.red} outline onClick={() => setCancelFor(b.id)}>Ακύρωση ναύλου</Btn>
                  </>
                  : <>
                    <Btn small color={COLORS.navy} outline onClick={() => { setDateFor(b.id); setMode("charter"); setDateVal(""); setDuration(7); setCustomReturn(""); }}>Ναύλο</Btn>
                    <Btn small color={COLORS.teal} outline onClick={() => { setDateFor(b.id); setMode("sea"); setDateVal(""); }}>Εν πλω (έκτακτο)</Btn>
                  </>}
            </div>
          </div>
          {detailFor === b.id && (
            <BoatDetail boat={b} tasks={tasks} boatNotes={boatNotes} onAddNote={onAddBoatNote} onDeleteNote={onDeleteBoatNote} isMgr={isMgr} onDeleteBoat={() => { persistBoats(boats.filter(x => x.id !== b.id)); showToast(`Το ${b.name} διαγράφηκε`); }} />
          )}
          {cancelFor === b.id && (
            <div style={{ marginTop: 10, background: "#FDECEA", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#8A1C12", marginBottom: 8 }}>
                Ακύρωση ναύλου για {b.name}; Ο έλεγχος αναχώρησης θα φύγει από τις εργασίες — τυχόν προβλήματα που είχαν ήδη καταγραφεί παραμένουν κανονικά.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn small color={COLORS.red} onClick={() => { cancelCharter(b); setCancelFor(null); }}>Ναι, ακύρωση</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setCancelFor(null)}>Όχι</Btn>
              </div>
            </div>
          )}
          {dateFor === b.id && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
              {mode === "charter" && dateVal && (
                <>
                  <div style={{ display: "flex", gap: 6, width: "100%" }}>
                    <Btn small color={COLORS.navy} outline={duration !== 7} onClick={() => setDuration(7)}>1 εβδομάδα</Btn>
                    <Btn small color={COLORS.navy} outline={duration !== 14} onClick={() => setDuration(14)}>2 εβδομάδες</Btn>
                    <Btn small color={COLORS.navy} outline={duration !== "custom"} onClick={() => setDuration("custom")}>Συγκεκριμένη ημερομηνία</Btn>
                  </div>
                  {duration === "custom" && (
                    <div style={{ width: "100%" }}>
                      <label style={{ fontSize: 12, color: COLORS.sub }}>Ημερομηνία επιστροφής</label>
                      <input type="date" min={dateVal} value={customReturn} onChange={e => setCustomReturn(e.target.value)} style={{ ...inputStyle, width: "auto", display: "block", marginTop: 4 }} />
                    </div>
                  )}
                  {computedReturn && <div style={{ fontSize: 12.5, color: COLORS.sub, width: "100%" }}>Επιστρέφει: <b>{fmtDate(computedReturn)}</b> — γίνεται αυτόματα «εν πλω» την {fmtDate(dateVal)} και επιστρέφει μόνο του την ίδια μέρα.</div>}
                </>
              )}
              <Btn small color={COLORS.navy} onClick={() => {
                if (mode === "sea") {
                  if (!dateVal) { showToast("Η ημερομηνία επιστροφής είναι υποχρεωτική"); return; }
                  persistBoats(boats.map(x => x.id === b.id ? { ...x, atSea: true, returnDate: dateVal, departureDate: null } : x));
                } else if (dateVal) {
                  if (duration === "custom" && !customReturn) { showToast("Διάλεξε ημερομηνία επιστροφής"); return; }
                  setDeparture(b, dateVal, computedReturn || null);
                } else {
                  setDeparture(b, null);
                }
                setDateFor(null);
              }}>{mode === "sea" ? "Ορισμός εν πλω" : dateVal ? "Ορισμός ναύλου" : "Αφαίρεση αναχώρησης"}</Btn>
              <Btn small color={COLORS.sub} outline onClick={() => setDateFor(null)}>Άκυρο</Btn>
              {mode === "sea" && <div style={{ fontSize: 12, color: COLORS.sub, width: "100%" }}>Για έκτακτες περιπτώσεις εκτός συνηθισμένου ναύλου. Υποχρεωτική ημερομηνία επιστροφής.</div>}
            </div>
          )}
        </div>
        </React.Fragment>
        );
      })}
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginTop: 12 }}>
        <label style={lbl}>Νέο σκάφος</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={newBoatName} onChange={e => setNewBoatName(e.target.value)} placeholder="Όνομα (π.χ. Καλλιρόη)" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input value={newBoatType} onChange={e => setNewBoatType(e.target.value)} placeholder="Τύπος (π.χ. Bavaria 46)" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <Btn small color={COLORS.navy} onClick={() => {
            if (!newBoatName.trim()) return;
            persistBoats([...boats, { id: "b" + Date.now(), name: newBoatName.trim(), type: newBoatType.trim(), atSea: false, returnDate: null, departureDate: null }]);
            setNewBoatName(""); setNewBoatType(""); showToast(`Προστέθηκε: ${newBoatName.trim()}`);
          }}>+</Btn>
        </div>
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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 13.5 }}>
      <span><b>{un(a.userId)}</b> · {fmtDate(a.from)} – {fmtDate(a.to)}{a.note ? ` · ${a.note}` : ""}</span>
      <button onClick={() => onDelete(a.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, fontWeight: 700 }}>×</button>
    </div>
  );
  return (
    <div>
      <SectionTitle>Επερχόμενες / τρέχουσες απουσίες ({upcoming.length})</SectionTitle>
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14 }}>
        {upcoming.length === 0 && <div style={{ fontSize: 14, color: COLORS.sub }}>Καμία δηλωμένη απουσία.</div>}
        {upcoming.map(a => <Row key={a.id} a={a} />)}
      </div>

      <SectionTitle>Καταχώρηση απουσίας για κάποιον</SectionTitle>
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14 }}>
        <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
          <option value="">Επίλεξε άτομο</option>
          {users.filter(u => u.role !== "owner").map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: "auto", flex: 1 }} />
          <input type="date" min={from} value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: "auto", flex: 1 }} />
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="π.χ. άδεια, καπετάνιος σε ναύλο (προαιρετικό)" style={{ ...inputStyle, marginTop: 8 }} />
        <div style={{ marginTop: 10 }}>
          <Btn small color={COLORS.navy} onClick={() => { if (!userId || !from || !to) return; onAdd(userId, from, to, note.trim()); setUserId(""); setFrom(""); setTo(""); setNote(""); }}>+ Προσθήκη</Btn>
        </div>
      </div>

      {past.length > 0 && (
        <>
          <SectionTitle>Παλαιότερες ({past.length})</SectionTitle>
          <div style={{ background: COLORS.card, borderRadius: 12, padding: 14 }}>
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
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14 }}>
        {safeItems.map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px dashed ${COLORS.line}`, fontSize: 14 }}>
            {it}
            <Btn small color={COLORS.red} outline onClick={() => onChange(safeItems.filter((_, j) => j !== i))}>×</Btn>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
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
        <SectionTitle>👤 {sel.name} — ιστορικό</SectionTitle>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {[["week","Εβδομάδα"],["month","Μήνας"],["all","Όλα"]].map(([id,l]) => (
            <Btn key={id} small color={COLORS.navy} outline={range!==id} onClick={()=>setRange(id)}>{l}</Btn>
          ))}
          <Btn small color={COLORS.sub} outline onClick={()=>setSel(null)}>← Πίσω</Btn>
        </div>
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 14 }}>
          <b>Σύνοψη:</b> {done.length} ολοκληρώσεις · {created.length} καταχωρήσεις · {prog.length} πρόοδοι
        </div>
        <SectionTitle>Ολοκληρώσεις</SectionTitle>
        {done.length === 0 && <Empty>Καμία στο διάστημα.</Empty>}
        {done.map(t => (
          <div key={t.id} style={{ background: COLORS.card, borderRadius: 10, padding: "10px 13px", marginBottom: 6, fontSize: 13.5 }}>
            <b>{t.desc}</b> — {bn(t.boatId)} · {fmtDate(t.completedAt)}{t.returns > 0 ? <span style={{color:COLORS.red}}> · ↩{t.returns}</span> : ""}
          </div>
        ))}
        <SectionTitle>Πρόοδοι</SectionTitle>
        {prog.length === 0 && <Empty>Καμία στο διάστημα.</Empty>}
        {prog.map((p,i) => (
          <div key={i} style={{ background: COLORS.card, borderRadius: 10, padding: "10px 13px", marginBottom: 6, fontSize: 13.5 }}>
            ✏ {p.note} <span style={{color:COLORS.sub}}>({p.desc} — {bn(p.boatId)}, {fmtDate(p.at)})</span>
          </div>
        ))}
        <SectionTitle>Καταχωρήσεις (εντοπισμοί)</SectionTitle>
        {created.length === 0 && <Empty>Καμία στο διάστημα.</Empty>}
        {created.map(t => (
          <div key={t.id} style={{ background: COLORS.card, borderRadius: 10, padding: "10px 13px", marginBottom: 6, fontSize: 13.5 }}>
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
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13.5, borderCollapse: "collapse" }}>
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
const th = { padding: "6px 8px", fontWeight: 700, fontSize: 12 };
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
ΣΚΑΦΗ: ${boats.map(b => b.name).join(", ")}
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
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: COLORS.sub, marginBottom: 8 }}>Ρώτησε οτιδήποτε, πες κάτι να το θυμάται, ή ζήτα να βάλει μια εργασία αργότερα.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button onClick={toggleMic} style={{
            padding: "10px 14px", borderRadius: 10, fontWeight: 700, fontSize: 14,
            border: `2px solid ${listening ? COLORS.red : COLORS.teal}`,
            background: listening ? COLORS.red : "transparent", color: listening ? "#fff" : COLORS.teal,
          }}>{listening ? "⏹" : "🎤"}</button>
          <textarea value={q} onChange={e => setQ(e.target.value)} rows={2} placeholder='π.χ. "Πες μου για τον Βασίλη" ή "Θυμήσου ότι το μηχανοστάσιο στη Βερόνικα θέλει τακτοποίηση, βάλε το όποτε υπάρχει χρόνος"' style={{ ...inputStyle, flex: 1 }} />
        </div>
        <Btn color={COLORS.teal} onClick={run}>{busy ? "…" : "Στείλε"}</Btn>
        {ans && <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", background: COLORS.bg, borderRadius: 10, padding: 12 }}>{ans}</div>}
      </div>
      {aiMemories.length > 0 && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13.5 }}>🧠 Όσα θυμάται ({aiMemories.length})</div>
          {aiMemories.map(m => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "5px 0", borderBottom: `1px dashed ${COLORS.line}` }}>
              <span>{m.text} <span style={{ color: COLORS.sub, fontSize: 11.5 }}>— {fmtDate(m.at)}</span></span>
              <button onClick={() => onDeleteMemory(m.id)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, flexShrink: 0 }}>🗑</button>
            </div>
          ))}
        </div>
      )}
      {backlog.length > 0 && (
        <div style={{ background: COLORS.card, borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13.5 }}>⏳ Σε αναμονή ({backlog.length}) — δεν φαίνονται σε κανέναν ακόμα</div>
          {backlog.map(t => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "5px 0", borderBottom: `1px dashed ${COLORS.line}` }}>
              <span>{t.desc} <span style={{ color: COLORS.sub, fontSize: 11.5 }}>({boats.find(b => b.id === t.boatId)?.name || "Βάση/Άλλο"}{t.scheduledFor ? ` · από ${fmtDate(t.scheduledFor)}` : ""}{t.preferredAssignee ? ` · προτίμηση: ${users.find(u => u.id === t.preferredAssignee)?.name || ""}` : ""})</span></span>
              <button onClick={() => onDeleteTask(t)} style={{ border: "none", background: "none", color: COLORS.red, fontSize: 12, flexShrink: 0 }}>🗑</button>
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
      <div style={{ fontSize: 12.5, color: COLORS.sub, marginBottom: 10 }}>Αυτόματη καταγραφή κάθε φορά που κάτι σπάει κάπου στην εφαρμογή — δείχνει ακριβώς πού, ώστε να μη χρειάζεται τυφλή αναζήτηση.</div>
      {errors.length === 0 && <Empty>Κανένα καταγεγραμμένο σφάλμα. 🎉</Empty>}
      {errors.map(e => (
        <div key={e.id} style={{ background: COLORS.card, borderRadius: 10, padding: "11px 14px", marginBottom: 8, fontSize: 13.5 }}>
          <div style={{ fontWeight: 700, color: COLORS.red }}>⚠️ {e.section} <span style={{ fontWeight: 400, color: COLORS.sub, fontSize: 11.5 }}>· {e.version} · {fmtDate(e.at)}</span></div>
          <div style={{ marginTop: 4, color: COLORS.text }}>{e.message}</div>
        </div>
      ))}
      {errors.length > 0 && <Btn small color={COLORS.sub} outline onClick={clearAll}>Καθάρισμα όλων</Btn>}
    </div>
  );
}

function ProfilesView({ users, me, onViewAs }) {
  const roleLabel = (r) => r === "manager" ? "Base Manager" : r === "owner" ? "Διαχειριστής" : r === "associate" ? "Στέλεχος" : "Υπάλληλος";
  const shown = users.filter(u => (u.role === "employee" || u.role === "associate") && u.id !== me.id);
  return (
    <div>
      <SectionTitle>Ομάδα</SectionTitle>
      {shown.length === 0 && <Empty>Κανένας χρήστης ακόμα.</Empty>}
      {shown.map(u => (
        <div key={u.id} style={{ background: COLORS.card, borderRadius: 12, padding: "12px 14px", marginBottom: 8, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <b>{u.name}</b> <span style={{ color: COLORS.sub, fontSize: 12.5 }}>{roleLabel(u.role)}</span>
            </div>
            {onViewAs && <Btn small color={COLORS.teal} onClick={() => onViewAs(u)}>👁 Προβολή ως</Btn>}
          </div>
        </div>
      ))}
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
        <div key={u.id} style={{ background: COLORS.card, borderRadius: 12, padding: "12px 14px", marginBottom: 8, fontSize: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{u.name}</b> <span style={{ color: COLORS.sub, fontSize: 12.5 }}>{u.role === "manager" ? "Base Manager" : u.role === "owner" ? "Διαχειριστής" : u.role === "associate" ? "Στέλεχος" : "Υπάλληλος"}</span>
              <div style={{ fontSize: 12.5, marginTop: 2 }}>
                Κωδικός: <b style={{ letterSpacing: 1 }}>{u.code}</b>{" "}
                <button onClick={() => persistUsers(users.map(x => x.id === u.id ? { ...x, code: genCode(x.name) } : x))}
                  style={{ border: "none", background: "none", color: COLORS.teal, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>↻ νέος</button>
              </div>
              {u.profile && <div style={{ fontSize: 12.5, color: COLORS.sub, marginTop: 2 }}>{u.profile}</div>}
            </div>
            <div style={{ display: "flex", gap: 6, flexDirection: "column", alignItems: "flex-end" }}>
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
              {onViewAs && <Btn small color={COLORS.teal} onClick={() => onViewAs(u)}>👁 Προβολή ως</Btn>}
              {u.role !== "owner" && <Btn small color={COLORS.red} outline onClick={() => { if (confirm(`Αφαίρεση πρόσβασης: ${u.name};`)) persistUsers(users.filter(x => x.id !== u.id)); }}>Αφαίρεση</Btn>}
            </div>
          </div>
          {profFor === u.id && (
            <div style={{ marginTop: 10 }}>
              <textarea value={prof} onChange={e => setProf(e.target.value)} rows={2} placeholder="Δεξιότητες / τι κάνει κυρίως — το χρησιμοποιεί το AI για τις αναθέσεις" style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn small color={COLORS.navy} onClick={() => { persistUsers(users.map(x => x.id === u.id ? { ...x, profile: prof.trim() } : x)); setProfFor(null); }}>Αποθήκευση</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setProfFor(null)}>Άκυρο</Btn>
              </div>
            </div>
          )}
          {profFor === "h-" + u.id && (
            <div style={{ marginTop: 10 }}>
              <textarea value={prof} onChange={e => setProf(e.target.value)} rows={2} placeholder="Ύφος ημερήσιου μηνύματος (χιούμορ, πειράγματα, running jokes) — κενό = χωρίς μήνυμα" style={inputStyle} />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn small color={COLORS.navy} onClick={() => { persistUsers(users.map(x => x.id === u.id ? { ...x, humor: prof.trim() } : x)); setProfFor(null); }}>Αποθήκευση</Btn>
                <Btn small color={COLORS.sub} outline onClick={() => setProfFor(null)}>Άκυρο</Btn>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ background: COLORS.card, borderRadius: 12, padding: 14, marginTop: 12 }}>
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


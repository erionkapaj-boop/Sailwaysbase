// Κανονικοποίηση τηλεφώνου: ό,τι κι αν γράψει κάποιος για τον ίδιο αριθμό,
// αποθηκεύεται ο ίδιος αριθμός. Τρέχει με: node tests/unit/phone.test.mjs
import { normalizePhone, isValidPhone } from "../../lib/platform/phone.js";

const SAME = [
  // Περίπτωση παραγωγής: «0030…» είχε γίνει «+300306940903478».
  ["00306940903478", "+306940903478"],
  ["0030 694 090 3478", "+306940903478"],
  ["+30 694 090 3478", "+306940903478"],
  ["+30 0694 090 3478", "+306940903478"],
  ["+300306940903478", "+306940903478"],
  ["306940903478", "+306940903478"],
  ["6940903478", "+306940903478"],
  ["06940903478", "+306940903478"],
  ["694-090-3478", "+306940903478"],
  ["2101234567", "+302101234567"],
  ["+357 99 123456", "+35799123456"],
  ["0035799123456", "+35799123456"],
  ["+306980000015", "+306980000015"],
];
const VALID = ["+306940903478", "+302101234567", "+35799123456", "+4915112345678"];
const INVALID = ["+300306940903478", "+3069409034", "+30694090347800", "+30123456789", "+12", "6940903478", ""];

const failures = [];
for (const [raw, want] of SAME) {
  const got = normalizePhone(raw);
  if (got !== want) failures.push(`normalizePhone(«${raw}») → ${got} (ήθελε ${want})`);
  if (!isValidPhone(got)) failures.push(`«${raw}» → ${got} δεν περνά τον έλεγχο`);
}
for (const p of VALID) if (!isValidPhone(p)) failures.push(`έγκυρο απορρίφθηκε: ${p}`);
for (const p of INVALID) if (isValidPhone(p)) failures.push(`άκυρο πέρασε: ${p}`);

if (failures.length) {
  console.log("FAIL\n" + failures.join("\n"));
  process.exit(1);
}
console.log(`ok   τηλέφωνα: ${SAME.length} γραφές, ${VALID.length} έγκυρα, ${INVALID.length} άκυρα`);

// Community: ό,τι μοιράζονται οι οθόνες του χάρτη (κατηγορίες, ηλικία αναφοράς, ημερομηνία παρατήρησης).
// Τα ονόματα των κατηγοριών ζουν στα messages (namespace «Community»)· εδώ μόνο κωδικοί, εικονίδια, χρώματα.
import { colors } from "./theme.js";

export const COMMUNITY_CATEGORIES = [
  { key: "hazard", icon: "triangle", color: colors.danger },
  { key: "weather", icon: "wind", color: "#3F6F8F" },
  { key: "anchorage", icon: "anchor", color: colors.ink },
  { key: "useful_place", icon: "flag", color: colors.success },
  { key: "other", icon: "dots", color: colors.inkSoft },
];

export const COMMUNITY_CATEGORY = Object.fromEntries(COMMUNITY_CATEGORIES.map((c) => [c.key, c]));

// Λόγοι αναφοράς προβλήματος σε σημείο (κωδικοί της βάσης, 0136).
export const POINT_REPORT_REASONS = ["wrong", "outdated", "abuse", "other"];

const DAY = 86400000;

// Πόσο φρέσκια είναι μια αναφορά: ο χρόνος από την τελευταία επιβεβαίωση σε σχέση με τη διάρκεια
// εμφάνισης της κατηγορίας της (ρύθμιση της διαχείρισης). fresh < 1/3, aging < 2/3, old μετά.
export function freshness(point, settings, now = Date.now()) {
  const show = settings?.[point.category]?.show_days;
  if (!show) return "fresh";
  const ratio = (now - new Date(point.last_confirmed_at).getTime()) / (show * DAY);
  return ratio < 0.34 ? "fresh" : ratio < 0.67 ? "aging" : "old";
}

// «πριν 3 ημέρες» / «3 days ago», στη γλώσσα της σελίδας (Intl, χωρίς κείμενο στον κώδικα).
export function ageLabel(iso, locale, now = Date.now()) {
  if (!iso) return "";
  const rtf = new Intl.RelativeTimeFormat(locale === "el" ? "el-GR" : "en-GB", { numeric: "auto" });
  const secs = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (hours < 1) return rtf.format(0, "hour");
  if (hours < 24) return rtf.format(-hours, "hour");
  if (days < 60) return rtf.format(-days, "day");
  if (days < 730) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

// Η ημερομηνία παρατήρησης που επιλέγει ο χρήστης (YYYY-MM-DD, τοπική) → στιγμή για τη βάση.
// Σήμερα = τώρα· άλλη μέρα = μεσημέρι εκείνης της μέρας (ώστε να μην πέφτει στο μέλλον λόγω ζώνης ώρας).
export function observedAtFromDay(day, now = new Date()) {
  const today = dayKey(now);
  if (!day || day === today) return now.toISOString();
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export function dayKey(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function dayKeyDaysAgo(days, now = new Date()) {
  return dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
}

// Ομάδες (0136): εικονίδιο ανά ομάδα (slug), λόγοι αναφοράς μηνύματος.
export const GROUP_ICON = { saronic: "sail", aegean: "compass", small_cyclades: "anchor", ionian: "wind" };
export const MESSAGE_REPORT_REASONS = ["offer", "abuse", "wrong", "other"];
export const MESSAGE_MAX = 2000;

// Μηνύματα ομάδας (η βάση τα δίνει επίπεδα, νεότερα πρώτα) → νήματα: κάθε μήνυμα με τις απαντήσεις του.
// Τα νήματα είναι νεότερο πρώτα, οι απαντήσεις παλαιότερη πρώτη. Απάντηση που το αρχικό της μήνυμα δεν έχει φορτωθεί
// (παλαιότερο από το φορτωμένο διάστημα) εμφανίζεται μόνη της, σημαδεμένη `orphan`.
export function buildThreads(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const roots = [];
  const replies = new Map();
  for (const r of rows) {
    if (r.parent_id && byId.has(r.parent_id)) {
      if (!replies.has(r.parent_id)) replies.set(r.parent_id, []);
      replies.get(r.parent_id).push(r);
    } else roots.push(r);
  }
  const asc = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  const desc = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  return roots.sort(desc).map((root) => ({ root, orphan: Boolean(root.parent_id), replies: (replies.get(root.id) || []).sort(asc) }));
}

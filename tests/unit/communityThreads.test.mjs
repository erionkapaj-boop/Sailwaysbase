import { buildThreads, ageLabel, freshness, observedAtFromDay, dayKey } from "../../lib/platform/community.js";

let passed = 0;
const ok = (label, cond, detail) => {
  if (!cond) { console.error(`FAIL ${label}`, detail ?? ""); process.exitCode = 1; return; }
  console.log(`ok   ${label}`);
  passed++;
};
const m = (id, parent, at) => ({ id, parent_id: parent, created_at: at });

const t = buildThreads([m("c", "a", "2026-10-17T10:00:00Z"), m("b", null, "2026-10-17T09:00:00Z"), m("a", null, "2026-10-17T08:00:00Z"), m("d", "a", "2026-10-17T08:30:00Z"), m("x", "gone", "2026-10-16T08:00:00Z")]);
ok("νήματα: νεότερο πρώτα", t.map((n) => n.root.id).join() === "b,a,x", t.map((n) => n.root.id).join());
ok("απαντήσεις: παλαιότερη πρώτη, κάτω από το μήνυμά τους", t[1].replies.map((r) => r.id).join() === "d,c");
ok("απάντηση χωρίς φορτωμένο αρχικό μήνυμα εμφανίζεται μόνη της", t[2].orphan === true && t[2].replies.length === 0);
ok("κενή λίστα", buildThreads([]).length === 0);

const now = Date.parse("2026-10-17T12:00:00Z");
ok("ηλικία: ώρες, ημέρες, μήνες (el)", ageLabel("2026-10-17T09:00:00Z", "el", now).includes("3") && ageLabel("2026-10-14T12:00:00Z", "el", now).includes("3") && ageLabel("2026-07-17T12:00:00Z", "el", now).includes("3"));
ok("ηλικία (en)", ageLabel("2026-10-14T12:00:00Z", "en", now) === "3 days ago");
const s = { hazard: { show_days: 60 } };
const ago = (days) => new Date(now - days * 86400000).toISOString();
ok("φρεσκάδα: φρέσκο / γερνά / παλιό", freshness({ category: "hazard", last_confirmed_at: ago(5) }, s, now) === "fresh" && freshness({ category: "hazard", last_confirmed_at: ago(30) }, s, now) === "aging" && freshness({ category: "hazard", last_confirmed_at: ago(50) }, s, now) === "old");
ok("φρεσκάδα χωρίς ρύθμιση = φρέσκο", freshness({ category: "x", last_confirmed_at: ago(900) }, s, now) === "fresh");
const today = new Date(2026, 9, 17, 14, 30);
ok("ημερομηνία παρατήρησης: σήμερα = τώρα, άλλη μέρα = μεσημέρι", observedAtFromDay(dayKey(today), today) === today.toISOString() && new Date(observedAtFromDay("2026-10-15", today)).getHours() === 12);

console.log(`${passed} έλεγχοι ομάδων/ηλικίας`);

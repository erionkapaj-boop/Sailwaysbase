import { createClient } from "@supabase/supabase-js";

const supa = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function kvGet(db, key, fallback) {
  const { data } = await db.from("kv").select("value").eq("key", key).maybeSingle();
  return data ? data.value : fallback;
}
async function kvSet(db, key, value) {
  await db.from("kv").upsert({ key, value, updated_at: new Date().toISOString() });
}

async function askClaude(prompt, max_tokens = 900) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export async function GET(req) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = supa();
  const results = {};

  // ---------- 1) Daily AI distribution ----------
  try {
    const users = (await kvGet(db, "app-users", [])) || [];
    const tasks = (await kvGet(db, "app-tasks", [])) || [];
    const boats = (await kvGet(db, "app-boats", [])) || [];
    const rules = (await kvGet(db, "app-dist-rules", [])) || [];
    const meta = (await kvGet(db, "app-meta", {})) || {};

    if (meta.lastDistribution !== todayStr()) {
      const employees = users.filter(u => (u.role === "employee" && !u.noAutoAssign) || u.name === "Φανούρης");
      const free = tasks.filter(t => t.status === "open" && !t.assignedTo);
      if (employees.length && free.length) {
        const bn = id => boats.find(b => b.id === id)?.name || "Βάση/Άλλο";
        const loadPer = Object.fromEntries(employees.map(e => [e.id, tasks.filter(t => t.assignedTo === e.id && t.status === "open").length]));
        const prompt = `Είσαι σύστημα κατανομής εργασιών σε βάση σκαφών. Μοίρασε ΜΕΧΡΙ 3 εργασίες ανά υπάλληλο για σήμερα από τις ελεύθερες, με βάση προφίλ, είδος εργασίας και δίκαιο φόρτο. Δεν χρειάζεται να ανατεθούν όλες.
ΑΠΑΡΑΒΑΤΟΙ ΕΙΔΙΚΟΙ ΚΑΝΟΝΕΣ:
${rules.map(r => "- " + r).join("\n")}
Υπάλληλοι: ${employees.map(e => `${e.id}: ${e.name} (τρέχων φόρτος: ${loadPer[e.id]}, προφίλ: ${e.profile || "χωρίς προφίλ"})`).join("; ")}
Ελεύθερες εργασίες: ${free.map(t => `${t.id}: "${t.desc}" [σκάφος: ${bn(t.boatId)}${t.urgent ? ", ΕΠΕΙΓΟΝ" : ""}]`).join("; ")}
Απάντησε ΜΟΝΟ με JSON, χωρίς markdown: {"assignments":[{"taskId":"...","userId":"..."}]}`;
        const raw = await askClaude(prompt, 800);
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        const valid = (parsed.assignments || []).filter(a => free.some(t => t.id === a.taskId) && employees.some(e => e.id === a.userId));
        if (valid.length) {
          const next = tasks.map(t => {
            const a = valid.find(v => v.taskId === t.id);
            return a ? { ...t, assignedTo: a.userId, assignedBy: "AI" } : t;
          });
          await kvSet(db, "app-tasks", next);
          results.distributed = valid.length;
        }
      }
      await kvSet(db, "app-meta", { ...meta, lastDistribution: todayStr() });
    }
  } catch (e) { results.distributionError = String(e); }

  // ---------- 2) Weekly report (Sundays) ----------
  try {
    const now = new Date();
    if (now.getDay() === 0) {
      const d = new Date(now); d.setDate(d.getDate() - (d.getDay() === 0 ? 0 : d.getDay()));
      const weekKey = d.toISOString().slice(0, 10);
      const existing = await kvGet(db, "weekly-report-" + weekKey, null);
      if (!existing) {
        const users = (await kvGet(db, "app-users", [])) || [];
        const tasks = (await kvGet(db, "app-tasks", [])) || [];
        const boats = (await kvGet(db, "app-boats", [])) || [];
        const from = new Date(); from.setDate(from.getDate() - 7);
        const inW = d2 => d2 && new Date(d2) >= from;
        const bn = id => boats.find(b => b.id === id)?.name || "Βάση";
        const team = users.filter(u => u.role === "employee" && !u.noStats);
        const data = team.map(u => {
          const done = tasks.filter(t => t.completedBy === u.id && t.status === "done" && inW(t.completedAt)).map(t => `"${t.desc}" (${bn(t.boatId)})${t.returns ? " [επιστράφηκε " + t.returns + "x]" : ""}`);
          const prog = tasks.reduce((s2, t) => s2 + (t.progress || []).filter(p => p.by === u.id && inW(p.at)).length, 0);
          const found = tasks.filter(t => t.createdBy === u.id && inW(t.createdAt)).length;
          return `${u.name}: Ολοκλήρωσε [${done.join("; ") || "τίποτα"}]. Πρόοδοι: ${prog}. Εντόπισε νέες: ${found}.`;
        }).join("\n");
        const prompt = `Είσαι σύμβουλος απόδοσης ομάδας σε βάση σκαφών charter. Γράψε ΣΥΝΟΠΤΙΚΗ εβδομαδιαία αναφορά (150-250 λέξεις, ελληνικά) για τη διοίκηση.
Κρίνε κάθε ολοκληρωμένη εργασία με συντελεστή βαρύτητας 1-5 (1=ασήμαντη, 5=βαριά). Σύγκρινε ΣΤΑΘΜΙΣΜΕΝΟ έργο ανά άτομο με τον μέσο όρο ομάδας. Επισήμανε ποιος σηκώνει τα βαριά, ποιος διαλέγει μόνο εύκολα, ποιος έχει χαμηλή παραγωγή. Ευθύς αλλά δίκαιος.
ΔΕΔΟΜΕΝΑ:\n${data}`;
        const text = await askClaude(prompt, 900);
        if (text) { await kvSet(db, "weekly-report-" + weekKey, { text, at: new Date().toISOString() }); results.weeklyReport = true; }
      }
    }
  } catch (e) { results.reportError = String(e); }

  // ---------- 3) Old photo cleanup (>~1.5 years after task closure) ----------
  try {
    const tasks = (await kvGet(db, "app-tasks", [])) || [];
    const cutoff = Date.now() - 548 * 24 * 60 * 60 * 1000;
    let changed = false;
    const next = [];
    for (const t of tasks) {
      if (t.status === "done" && t.completedAt && new Date(t.completedAt).getTime() < cutoff && Array.isArray(t.photos) && t.photos.length) {
        for (const url of t.photos) {
          try {
            const path = url.split("/task-photos/")[1];
            if (path) await db.storage.from("task-photos").remove([path]);
          } catch {}
        }
        changed = true;
        next.push({ ...t, photos: [] });
      } else next.push(t);
    }
    if (changed) { await kvSet(db, "app-tasks", next); results.photosCleared = true; }
  } catch (e) { results.cleanupError = String(e); }

  return Response.json({ ok: true, ...results });
}

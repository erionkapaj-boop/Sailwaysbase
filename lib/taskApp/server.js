import { createClient } from "@supabase/supabase-js";

// Server side of the team app (components/App.jsx). Every read and write of
// its shared data goes through /api/kv, which first checks the person's
// personal code against the stored team list. The browser never talks to the
// kv table directly, so nobody without a valid code can read anything —
// including the list of everyone's codes (docs/AUDIT.md #27, #28).
//
// With SUPABASE_SERVICE_ROLE_KEY set, the table itself can be closed to the
// public key (docs/PENDING.md). Until then this falls back to the public key
// so the app keeps working while the switch is made.

export const MASK = "••••••";
const USERS_KEY = "app-users";

export function taskDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readKey(db, key) {
  const { data, error } = await db.from("kv").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

export async function loadTeam(db) {
  const raw = await readKey(db, USERS_KEY);
  if (raw == null) return null;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

const norm = (code) => String(code || "").trim().toUpperCase();

// A few wrong codes in a row from one address slow that address down. Kept in
// memory: with several server instances it is per instance, which is fine —
// the real protection is that a code has ~2 billion possible values.
const failures = new Map();
export function tooManyFailures(ip) {
  const f = failures.get(ip);
  return Boolean(f && f.count >= 10 && Date.now() - f.at < 15 * 60_000);
}
export function noteFailure(ip) {
  const f = failures.get(ip);
  const fresh = !f || Date.now() - f.at > 15 * 60_000;
  failures.set(ip, { count: fresh ? 1 : f.count + 1, at: Date.now() });
  if (failures.size > 5000) failures.clear();
}

export function clientIp(req) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
}

// { user } for a valid code, { bootstrap: true } before any team exists
// (a brand-new install has nothing to protect yet), otherwise {}.
export async function whoIs(db, code) {
  const team = await loadTeam(db);
  if (!team) return { bootstrap: true, team: null };
  const c = norm(code);
  const user = c ? team.find((u) => norm(u.code) === c) : null;
  return { user: user || null, team };
}

// What someone who isn't the owner sees of the team: their own code, nobody
// else's.
export function maskTeam(team, viewer) {
  if (viewer?.role === "owner") return team;
  return team.map((u) => (u.id === viewer?.id || !u.code ? u : { ...u, code: MASK }));
}

// Writing the team list back. Only the owner changes codes or roles of
// existing people, or removes the owner. Anyone else's copy may carry masked
// codes and roles they shouldn't touch — those come from what is stored.
export function mergeTeam(stored, incoming, viewer) {
  if (!Array.isArray(incoming)) throw new Error("bad_team");
  if (!stored) return incoming;
  const isOwner = viewer?.role === "owner";
  const byId = new Map(stored.map((u) => [u.id, u]));
  const out = incoming.map((u) => {
    const before = byId.get(u.id);
    if (isOwner) {
      return before && (u.code === MASK || !u.code) ? { ...u, code: before.code } : u;
    }
    if (before) return { ...u, code: before.code, role: before.role };
    // Someone new, added by a manager: never an owner.
    const code = u.code && u.code !== MASK ? u.code : null;
    return { ...u, role: u.role === "owner" ? "employee" : u.role, code };
  });
  if (!isOwner) {
    for (const u of stored) {
      if (u.role === "owner" && !out.some((x) => x.id === u.id)) out.push(u);
    }
  }
  return out;
}

import { taskDb, readKey, whoIs, maskTeam, mergeTeam, loadTeam, tooManyFailures, noteFailure, clientIp } from "../../../lib/taskApp/server";

// The team app's shared data (components/App.jsx via lib/storage.js). Every
// call carries the person's code in x-app-code; see lib/taskApp/server.js.
const USERS_KEY = "app-users";

export async function POST(req) {
  const db = taskDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 500 });

  const ip = clientIp(req);
  if (tooManyFailures(ip)) return Response.json({ error: "too_many_attempts" }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const { op, key, value, prefix } = body;
  const code = req.headers.get("x-app-code") || "";

  let who;
  try {
    who = await whoIs(db, code);
  } catch {
    return Response.json({ error: "failed" }, { status: 500 });
  }
  if (!who.user && !who.bootstrap) {
    noteFailure(ip);
    return Response.json({ error: "bad_code" }, { status: 401 });
  }
  const viewer = who.user;

  try {
    if (op === "login") {
      return Response.json({ ok: true, bootstrap: Boolean(who.bootstrap), user: viewer ? { id: viewer.id } : null });
    }

    if (op === "get") {
      if (typeof key !== "string") return Response.json({ error: "bad_request" }, { status: 400 });
      if (key === USERS_KEY) {
        return Response.json({ value: who.team ? JSON.stringify(maskTeam(who.team, viewer)) : null });
      }
      return Response.json({ value: await readKey(db, key) });
    }

    if (op === "set") {
      if (typeof key !== "string" || typeof value !== "string") return Response.json({ error: "bad_request" }, { status: 400 });
      let stored = value;
      if (key === USERS_KEY) {
        const current = await loadTeam(db);
        stored = JSON.stringify(mergeTeam(current, JSON.parse(value), viewer));
      }
      const { error } = await db.from("kv").upsert({ key, value: stored, updated_at: new Date().toISOString() });
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (op === "delete") {
      if (typeof key !== "string") return Response.json({ error: "bad_request" }, { status: 400 });
      if (key === USERS_KEY && viewer?.role !== "owner") return Response.json({ error: "forbidden" }, { status: 403 });
      const { error } = await db.from("kv").delete().eq("key", key);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    if (op === "list") {
      let q = db.from("kv").select("key");
      if (prefix) q = q.like("key", `${String(prefix).replace(/[%_]/g, "\\$&")}%`);
      const { data, error } = await q;
      if (error) throw error;
      return Response.json({ keys: (data || []).map((r) => r.key) });
    }
  } catch (e) {
    console.error("kv", op, key, e);
    return Response.json({ error: "failed" }, { status: 500 });
  }
  return Response.json({ error: "bad_request" }, { status: 400 });
}
